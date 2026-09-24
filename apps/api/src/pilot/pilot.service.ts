import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  FleetModule,
  TripStatus,
  VehicleStatus,
  WorkOrderStatus,
} from "@fsg/db";
import { HARD_RULES } from "@fsg/shared";
import { PrismaService } from "../prisma/prisma.service";
import type {
  FuelTokenDto,
  PreoperacionalDto,
  SosDto,
} from "./dto/pilot.dto";

export const PREOP_PHOTOS_REQUIRED = "PREOP_PHOTOS_REQUIRED";
export const PREOP_ITEMS_FAILED = "PREOP_ITEMS_FAILED";
export const PREOP_VEHICLE_BLOCK_REASON = "PREOP_CHECKLIST_FAILED";

@Injectable()
export class PilotService {
  constructor(private prisma: PrismaService) {}

  speedLock(speedKph: number) {
    const lock = speedKph > HARD_RULES.PILOT_SPEED_LOCK_KPH;
    return {
      speedKph,
      thresholdKph: HARD_RULES.PILOT_SPEED_LOCK_KPH,
      touchLocked: lock,
      uiMode: lock ? "DRIVER_SAFE_BLACKOUT" : "INTERACTIVE",
      message: lock
        ? `Pantalla bloqueada — velocidad ${speedKph} km/h > ${HARD_RULES.PILOT_SPEED_LOCK_KPH} km/h`
        : "Modo interactivo nominal",
    };
  }

  async submitPreoperacional(
    organizationId: string,
    userId: string,
    dto: PreoperacionalDto,
  ) {
    if (!dto.photoRefs?.length) {
      throw new BadRequestException({
        error: PREOP_PHOTOS_REQUIRED,
        message: "Preoperacional fotográfico obligatorio previo al encendido",
      });
    }

    const trip = await this.prisma.trip.findFirst({
      where: { id: dto.tripId, organizationId },
      include: { driver: true },
    });
    if (!trip) throw new NotFoundException("Viaje no encontrado");

    const driver =
      trip.driver ??
      (await this.prisma.driver.findFirst({
        where: { organizationId, userId },
      }));
    if (!driver) {
      throw new BadRequestException("Conductor no vinculado al viaje");
    }

    const failedItems = [
      !dto.brakesOk ? "frenos" : null,
      !dto.lightsOk ? "luces" : null,
      !dto.tiresOk ? "llantas" : null,
      !dto.kitOk ? "kit" : null,
      !dto.oilOk ? "aceite" : null,
    ].filter(Boolean) as string[];
    const allOk = failedItems.length === 0;

    const existing = await this.prisma.preoperational.findUnique({
      where: { tripId: trip.id },
    });
    if (existing) {
      await this.prisma.preoperational.delete({ where: { id: existing.id } });
    }

    const preop = await this.prisma.preoperational.create({
      data: {
        tripId: trip.id,
        driverId: driver.id,
        brakesOk: dto.brakesOk,
        lightsOk: dto.lightsOk,
        tiresOk: dto.tiresOk,
        kitOk: dto.kitOk,
        oilOk: dto.oilOk,
        observations: dto.observations,
        approved: allOk,
        payload: {
          photoRefs: dto.photoRefs,
          submittedBy: userId,
          failedItems,
        },
      },
    });

    if (!allOk) {
      const sideEffects = await this.applyPreopFailureBlocks(
        organizationId,
        trip,
        preop.id,
        failedItems,
        userId,
      );
      throw new UnprocessableEntityException({
        error: PREOP_ITEMS_FAILED,
        message:
          "Checklist preoperacional fallido — unidad bloqueada en Logística y OT abierta en Taller",
        failedItems,
        preoperationalId: preop.id,
        ...sideEffects,
      });
    }

    await this.prisma.trip.update({
      where: { id: trip.id },
      data: {
        status: TripStatus.AWAITING_FUEC,
        meta: {
          ...((trip.meta as object) || {}),
          preopApprovedAt: new Date().toISOString(),
          logicalIgnitionUnlocked: true,
        },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId,
        action: "PILOT_PREOP_APPROVED",
        entity: "Preoperational",
        entityId: preop.id,
        module: FleetModule.APP_CONDUCTOR,
        userId,
        meta: { tripId: trip.id, photoCount: dto.photoRefs.length },
      },
    });

    return {
      approved: true,
      logicalIgnitionUnlocked: true,
      preoperationalId: preop.id,
      tripId: trip.id,
      message: "Preoperacional OK — encendido lógico autorizado",
    };
  }

  /**
   * SCRUM-31: fallo preop → complianceBlocked + OT Taller + trip INCIDENT.
   */
  private async applyPreopFailureBlocks(
    organizationId: string,
    trip: { id: string; code: string; vehicleId: string | null; meta: unknown },
    preopId: string,
    failedItems: string[],
    userId: string,
  ) {
    let vehicleBlocked: {
      id: string;
      plate: string;
      complianceBlocked: boolean;
    } | null = null;
    let workOrder: { id: string; code: string } | null = null;

    if (trip.vehicleId) {
      vehicleBlocked = await this.prisma.vehicle.update({
        where: { id: trip.vehicleId },
        data: {
          status: VehicleStatus.MAINTENANCE,
          complianceBlocked: true,
          complianceReason: `${PREOP_VEHICLE_BLOCK_REASON}:${failedItems.join(",")}`,
        },
        select: { id: true, plate: true, complianceBlocked: true },
      });

      const openWo = await this.prisma.workOrder.findFirst({
        where: {
          organizationId,
          vehicleId: trip.vehicleId,
          status: { in: [WorkOrderStatus.OPEN, WorkOrderStatus.IN_PROGRESS] },
          description: { contains: "Preop fallido" },
        },
        select: { id: true, code: true },
      });
      if (openWo) {
        workOrder = openWo;
      } else {
        const woCount = await this.prisma.workOrder.count({
          where: { organizationId },
        });
        workOrder = await this.prisma.workOrder.create({
          data: {
            organizationId,
            vehicleId: trip.vehicleId,
            code: `OT-PREOP-${String(woCount + 1).padStart(4, "0")}`,
            description: `Preop fallido viaje ${trip.code} — ítems: ${failedItems.join(", ")}`,
            status: WorkOrderStatus.OPEN,
          },
          select: { id: true, code: true },
        });
      }
    }

    await this.prisma.trip.update({
      where: { id: trip.id },
      data: {
        status: TripStatus.INCIDENT,
        incidentNote: `Preoperacional fallido: ${failedItems.join(", ")}`,
        meta: {
          ...((trip.meta as object) || {}),
          preopFailedAt: new Date().toISOString(),
          preopFailedItems: failedItems,
          logicalIgnitionUnlocked: false,
          workOrderId: workOrder?.id ?? null,
        },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId,
        action: "PILOT_PREOP_FAILED",
        entity: "Preoperational",
        entityId: preopId,
        module: FleetModule.APP_CONDUCTOR,
        userId,
        meta: {
          tripId: trip.id,
          failedItems,
          vehicleId: trip.vehicleId,
          workOrderId: workOrder?.id ?? null,
        },
      },
    });

    return {
      vehicleBlocked,
      workOrder,
      tripStatus: TripStatus.INCIDENT,
    };
  }

  async raiseSos(
    organizationId: string,
    userId: string,
    dto: SosDto,
  ) {
    const code = `SOS-${Date.now().toString(36).toUpperCase()}`;
    const voipChannel = `voip://fsg-pilot/${code}`;

    const alert = await this.prisma.pilotSosAlert.create({
      data: {
        organizationId,
        code,
        category: dto.category,
        tripId: dto.tripId,
        vehicleId: dto.vehicleId,
        plate: dto.plate?.toUpperCase(),
        lat: dto.lat,
        lng: dto.lng,
        speedKph: dto.speedKph,
        voipChannel,
        status: "ACTIVE",
        meta: { raisedBy: userId, channels: ["PUSH", "SMS", "VOIP"] },
      },
    });

    await this.prisma.systemAlert.create({
      data: {
        organizationId,
        severity: "CRITICAL",
        source: "FSG_PILOT_SOS",
        message: `SOS ${dto.category} · ${dto.plate || "SIN-PLACA"} · ${voipChannel}`,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId,
        action: "PILOT_SOS",
        entity: "PilotSosAlert",
        entityId: alert.id,
        module: FleetModule.APP_CONDUCTOR,
        userId,
        meta: { category: dto.category, voipChannel },
      },
    });

    return {
      alertId: alert.id,
      code,
      voipChannel,
      multichannel: ["PUSH", "SMS", "VOIP"],
      message: "SOS multicanal disparado — canal VoIP abierto",
    };
  }

  async issueFuelToken(
    organizationId: string,
    userId: string,
    dto: FuelTokenDto,
  ) {
    const tokenQr = `FUEL-${organizationId.slice(0, 6)}-${Date.now().toString(36)}`;
    const expiresAt = new Date(Date.now() + 2 * 3600_000);

    const token = await this.prisma.fuelWalletToken.create({
      data: {
        organizationId,
        tokenQr,
        plate: dto.plate?.toUpperCase(),
        amountCop: dto.amountCop,
        status: "ACTIVE",
        expiresAt,
        meta: { issuedBy: userId, tripId: dto.tripId },
      },
    });

    return {
      tokenId: token.id,
      tokenQr,
      amountCop: dto.amountCop,
      expiresAt,
      message: "Token QR de tanqueo emitido — sin efectivo",
    };
  }

  async dashboard(organizationId: string, userId: string) {
    const driver = await this.prisma.driver.findFirst({
      where: { organizationId, userId },
    });
    const trips = await this.prisma.trip.findMany({
      where: {
        organizationId,
        ...(driver ? { driverId: driver.id } : {}),
        status: {
          in: [
            "ASSIGNED",
            "AWAITING_PREOP",
            "AWAITING_FUEC",
            "IN_TRANSIT",
          ],
        },
      },
      orderBy: { departAt: "asc" },
      take: 10,
      include: {
        vehicle: { select: { id: true, plate: true } },
        preoperational: true,
      },
    });

    const openShift = driver
      ? await this.prisma.driverShift.findFirst({
          where: {
            organizationId,
            driverId: driver.id,
            status: "OPEN",
          },
          orderBy: { checkInAt: "desc" },
        })
      : null;

    const shiftMeta = (openShift?.meta ?? null) as {
      dutyStatus?: string;
      lastLat?: number;
      lastLng?: number;
      lastLocationAt?: string;
    } | null;

    const sos = await this.prisma.pilotSosAlert.findMany({
      where: { organizationId, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    const wallet = await this.prisma.fuelWalletToken.findMany({
      where: { organizationId, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    return {
      hub: "FSG Pilot",
      role: "CONDUCTOR",
      speedLockKph: HARD_RULES.PILOT_SPEED_LOCK_KPH,
      driver: driver
        ? {
            id: driver.id,
            name: driver.name,
            document: driver.document,
          }
        : null,
      duty: {
        status: (shiftMeta?.dutyStatus as
          | "ON_DUTY"
          | "OFF_DUTY"
          | "BREAK"
          | undefined) ?? (openShift ? "ON_DUTY" : "OFF_DUTY"),
        shiftId: openShift?.id ?? null,
        checkInAt: openShift?.checkInAt?.toISOString() ?? null,
        lastLat: shiftMeta?.lastLat ?? null,
        lastLng: shiftMeta?.lastLng ?? null,
        lastLocationAt: shiftMeta?.lastLocationAt ?? null,
      },
      trips: trips.map((t) => ({
        id: t.id,
        code: t.code,
        status: t.status,
        vehicleId: t.vehicle?.id ?? t.vehicleId ?? null,
        plate: t.vehicle?.plate,
        departAt: t.departAt,
        preopDone: Boolean(t.preoperational?.approved),
        origin: t.origin,
        destination: t.destination,
      })),
      activeSos: sos,
      fuelWallet: wallet,
      scoreCard: {
        label: "Score Card del día",
        safety: 92,
        punctuality: 88,
        fuelEfficiency: 85,
      },
    };
  }

  private async resolveDriver(organizationId: string, userId: string) {
    const driver = await this.prisma.driver.findFirst({
      where: { organizationId, userId },
    });
    if (!driver) {
      throw new NotFoundException("Conductor no vinculado al usuario");
    }
    return driver;
  }

  /** SCRUM-51 — Persistir estado ON_DUTY / OFF_DUTY / BREAK */
  async setDutyStatus(
    organizationId: string,
    userId: string,
    dto: import("./dto/pilot.dto").DutyStatusDto,
  ) {
    const driver = await this.resolveDriver(organizationId, userId);
    const now = new Date();

    if (dto.status === "ON_DUTY" || dto.status === "BREAK") {
      const open = await this.prisma.driverShift.findFirst({
        where: { organizationId, driverId: driver.id, status: "OPEN" },
        orderBy: { checkInAt: "desc" },
      });
      if (open && dto.status === "ON_DUTY") {
        await this.prisma.driverShift.update({
          where: { id: open.id },
          data: {
            meta: {
              ...((open.meta as object) || {}),
              dutyStatus: dto.status,
              lat: dto.lat,
              lng: dto.lng,
              notes: dto.notes,
              updatedAt: now.toISOString(),
            },
          },
        });
        return {
          driverId: driver.id,
          status: dto.status,
          shiftId: open.id,
          message: "Estado de turno actualizado",
        };
      }
      if (!open) {
        const shift = await this.prisma.driverShift.create({
          data: {
            organizationId,
            driverId: driver.id,
            checkInAt: now,
            status: "OPEN",
            notes: dto.notes,
            meta: {
              dutyStatus: dto.status,
              lat: dto.lat,
              lng: dto.lng,
            },
          },
        });
        return {
          driverId: driver.id,
          status: dto.status,
          shiftId: shift.id,
          message: "Turno iniciado",
        };
      }
      await this.prisma.driverShift.update({
        where: { id: open.id },
        data: {
          meta: {
            ...((open.meta as object) || {}),
            dutyStatus: dto.status,
            lat: dto.lat,
            lng: dto.lng,
            notes: dto.notes,
          },
        },
      });
      return {
        driverId: driver.id,
        status: dto.status,
        shiftId: open.id,
        message: "Descanso registrado",
      };
    }

    const open = await this.prisma.driverShift.findFirst({
      where: { organizationId, driverId: driver.id, status: "OPEN" },
      orderBy: { checkInAt: "desc" },
    });
    if (open) {
      const hours =
        (now.getTime() - open.checkInAt.getTime()) / (1000 * 60 * 60);
      await this.prisma.driverShift.update({
        where: { id: open.id },
        data: {
          checkOutAt: now,
          status: "CLOSED",
          continuousHours: Number(hours.toFixed(2)),
          meta: {
            ...((open.meta as object) || {}),
            dutyStatus: "OFF_DUTY",
            lat: dto.lat,
            lng: dto.lng,
          },
        },
      });
      return {
        driverId: driver.id,
        status: "OFF_DUTY" as const,
        shiftId: open.id,
        continuousHours: Number(hours.toFixed(2)),
        message: "Turno cerrado",
      };
    }
    return {
      driverId: driver.id,
      status: "OFF_DUTY" as const,
      shiftId: null,
      message: "Sin turno abierto — estado OFF_DUTY",
    };
  }

  /** SCRUM-51 — Uplink GPS del conductor (vehículo del viaje activo o indicado) */
  async reportLocation(
    organizationId: string,
    userId: string,
    dto: import("./dto/pilot.dto").PilotLocationDto,
  ) {
    const driver = await this.resolveDriver(organizationId, userId);
    let vehicleId = dto.vehicleId;
    let tripId = dto.tripId;

    if (!vehicleId || !tripId) {
      const active = await this.prisma.trip.findFirst({
        where: {
          organizationId,
          driverId: driver.id,
          status: {
            in: ["ASSIGNED", "AWAITING_PREOP", "AWAITING_FUEC", "IN_TRANSIT"],
          },
        },
        orderBy: { departAt: "asc" },
        select: { id: true, vehicleId: true },
      });
      if (active) {
        tripId = tripId || active.id;
        vehicleId = vehicleId || active.vehicleId || undefined;
      }
    }

    if (!vehicleId) {
      throw new BadRequestException(
        "Indique vehicleId o tenga un viaje activo con unidad",
      );
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
    });
    if (!vehicle) throw new NotFoundException("Vehículo no encontrado");

    await this.prisma.vehicle.update({
      where: { id: vehicle.id },
      data: { lat: dto.lat, lng: dto.lng },
    });

    const snap = await this.prisma.gpsSnapshot.create({
      data: {
        vehicleId: vehicle.id,
        lat: dto.lat,
        lng: dto.lng,
        speedKph: dto.speedKph,
      },
    });

    if (tripId) {
      await this.prisma.tripTrackPoint.create({
        data: {
          tripId,
          vehicleId: vehicle.id,
          lat: dto.lat,
          lng: dto.lng,
          speedKph: dto.speedKph,
        },
      });
    }

    const openShift = await this.prisma.driverShift.findFirst({
      where: { organizationId, driverId: driver.id, status: "OPEN" },
      orderBy: { checkInAt: "desc" },
    });
    if (openShift) {
      await this.prisma.driverShift.update({
        where: { id: openShift.id },
        data: {
          meta: {
            ...((openShift.meta as object) || {}),
            lastLat: dto.lat,
            lastLng: dto.lng,
            lastLocationAt: new Date().toISOString(),
          },
        },
      });
    }

    return {
      driverId: driver.id,
      vehicleId: vehicle.id,
      tripId: tripId ?? null,
      lat: dto.lat,
      lng: dto.lng,
      gpsSnapshotId: snap.id,
      message: "Ubicación registrada",
    };
  }
}
