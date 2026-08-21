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
  YardAccessKind,
} from "@fsg/db";
import { HARD_RULES } from "@fsg/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { LprCheckDto, YardAccessLogDto, YardMoveDto } from "./dto/patio.dto";

export const GATE_CHECKOUT_DENIED = "GATE_CHECKOUT_DENIED_COMPLIANCE_BLOCK";
export const LPR_HARD_STOP = "LPR_HARD_STOP";
export const LPR_NO_ACTIVE_TRIP = "NO_ACTIVE_TRIP";

/** Ventana horaria (± horas) alrededor de departAt para viaje "activo" en talanquera */
const LPR_TRIP_WINDOW_HOURS = 4;

const ACTIVE_TRIP_STATUSES: TripStatus[] = [
  TripStatus.ASSIGNED,
  TripStatus.AWAITING_PREOP,
  TripStatus.AWAITING_FUEC,
  TripStatus.IN_TRANSIT,
  TripStatus.PENDING_SUPERVISOR_APPROVAL,
];

/**
 * Smart Gate / Talanquera — CHECK_IN / CHECK_OUT con kill-switch compliance.
 */
@Injectable()
export class YardAccessService {
  constructor(private prisma: PrismaService) {}

  async recordAccess(
    organizationId: string,
    dto: YardAccessLogDto,
    actorUserId?: string,
  ) {
    const vehicle = await this.resolveVehicle(organizationId, dto);
    const plate = (dto.plate || vehicle.plate).toUpperCase().trim();
    const kind =
      dto.kind === "CHECK_OUT"
        ? YardAccessKind.CHECK_OUT
        : YardAccessKind.CHECK_IN;

    let driver: {
      id: string;
      name: string;
      dispatchBlocked: boolean;
      blockReason: string | null;
      fatigueScore: number;
      active: boolean;
    } | null = null;
    if (dto.driverId) {
      driver = await this.loadDriver(organizationId, dto.driverId);
    }

    if (kind === YardAccessKind.CHECK_OUT) {
      const denial = this.evaluateCheckoutDenial(vehicle, driver);
      if (denial) {
        const deniedLog = await this.prisma.yardAccessLog.create({
          data: {
            organizationId,
            kind,
            plate,
            vehicleId: vehicle.id,
            driverId: driver?.id,
            odometerKm: dto.odometerKm,
            gateId: dto.gateId,
            cameraRef: dto.cameraRef,
            lprConfidence: dto.lprConfidence,
            gateOpened: false,
            denied: true,
            denyReason: denial.reason,
            meta: { blocks: denial.blocks, actorUserId },
          },
        });

        await this.prisma.yardEvent.create({
          data: {
            organizationId,
            vehicleId: vehicle.id,
            kind: "GATE_DENY",
            payload: {
              accessLogId: deniedLog.id,
              reason: denial.reason,
              blocks: denial.blocks,
            },
          },
        });

        await this.prisma.auditLog.create({
          data: {
            organizationId,
            action: GATE_CHECKOUT_DENIED,
            entity: "YardAccessLog",
            entityId: deniedLog.id,
            module: FleetModule.PARQUEADERO,
            userId: actorUserId,
            meta: { plate, vehicleId: vehicle.id, blocks: denial.blocks },
          },
        });

        throw new UnprocessableEntityException({
          statusCode: 422,
          error: GATE_CHECKOUT_DENIED,
          message:
            "Talanquera cerrada — unidad con Hard-Stop de compliance / fatiga / taller",
          blocks: denial.blocks,
          accessLogId: deniedLog.id,
          vehicleId: vehicle.id,
          plate,
        });
      }
    }

    if (kind === YardAccessKind.CHECK_IN) {
      const result = await this.checkIn(organizationId, {
        vehicle,
        plate,
        driver,
        dto,
        actorUserId,
      });
      let lifo: Awaited<
        ReturnType<YardAccessService["assignParkingLifo"]>
      > | null = null;
      try {
        const depart =
          dto.scheduledDepartAt ?? new Date(Date.now() + 2 * 3600_000);
        lifo = await this.assignParkingLifo(
          organizationId,
          plate,
          new Date(depart),
        );
      } catch {
        lifo = null;
      }
      return {
        ...result,
        lifo,
        message: lifo
          ? `Ingreso OK · ${lifo.message}`
          : "Ingreso OK — asigne bahía LIFO manualmente",
      };
    }

    return this.checkOut(organizationId, {
      vehicle,
      plate,
      driver,
      dto,
      actorUserId,
    });
  }

  /**
   * Talanquera LPR / QR — valida viaje activo + docs jurídicos + alcoholimetría.
   * Abre barrera o Hard-Stop con alarma.
   */
  async lprCheck(
    organizationId: string,
    dto: LprCheckDto,
    actorUserId?: string,
  ) {
    const at = dto.at ?? new Date();
    const vehicle = await this.resolveVehicle(organizationId, {
      kind: "CHECK_OUT",
      plate: dto.plate,
      vehicleId: dto.vehicleId,
    });
    const plate = (dto.plate || vehicle.plate).toUpperCase().trim();
    const driverId = dto.driverId;

    const blocks: string[] = [];
    const activeTrip = await this.findActiveTripForVehicle(
      organizationId,
      vehicle.id,
      at,
    );
    if (!activeTrip) {
      blocks.push(LPR_NO_ACTIVE_TRIP);
    }

    if (vehicle.complianceBlocked) {
      blocks.push(
        vehicle.complianceReason || "VEHICLE_DOCS_EXPIRED_JURIDICO",
      );
    }

    const alcohol = await this.findValidAlcoholCheck(
      organizationId,
      driverId ?? activeTrip?.driverId ?? undefined,
      plate,
      at,
    );
    if (!alcohol) {
      blocks.push("ALCOHOL_CHECK_MISSING_OR_FAILED");
    }

    const gateOpened = blocks.length === 0;

    const access = await this.prisma.yardAccessLog.create({
      data: {
        organizationId,
        kind: YardAccessKind.CHECK_OUT,
        plate,
        vehicleId: vehicle.id,
        driverId: driverId ?? activeTrip?.driverId ?? undefined,
        gateId: dto.gateId ?? "GATE-MAIN",
        cameraRef: dto.cameraRef,
        lprConfidence: dto.lprConfidence,
        gateOpened,
        denied: !gateOpened,
        denyReason: gateOpened ? null : LPR_HARD_STOP,
        meta: {
          actorUserId,
          blocks,
          tripId: activeTrip?.id,
          tripCode: activeTrip?.code,
          alcoholCheckId: alcohol?.id,
          qrPayload: dto.qrPayload,
          mode: "LPR_CHECK",
        },
      },
    });

    await this.prisma.yardEvent.create({
      data: {
        organizationId,
        vehicleId: vehicle.id,
        kind: gateOpened ? "EXIT" : "GATE_DENY",
        payload: {
          accessLogId: access.id,
          blocks,
          tripId: activeTrip?.id,
          hardStop: !gateOpened,
        },
      },
    });

    if (!gateOpened) {
      await this.prisma.auditLog.create({
        data: {
          organizationId,
          action: LPR_HARD_STOP,
          entity: "YardAccessLog",
          entityId: access.id,
          module: FleetModule.PARQUEADERO,
          userId: actorUserId,
          meta: { plate, blocks, tripId: activeTrip?.id },
        },
      });

      throw new UnprocessableEntityException({
        statusCode: 422,
        error: LPR_HARD_STOP,
        message:
          blocks.includes(LPR_NO_ACTIVE_TRIP)
            ? "Hard-Stop — sin viaje activo asignado para la hora actual"
            : "Hard-Stop talanquera — documentación / alcoholimetría / logística",
        blocks,
        gateOpened: false,
        alarm: true,
        accessLogId: access.id,
        plate,
        vehicleId: vehicle.id,
      });
    }

    return {
      gateOpened: true,
      alarm: false,
      plate,
      vehicleId: vehicle.id,
      trip: activeTrip
        ? {
            id: activeTrip.id,
            code: activeTrip.code,
            status: activeTrip.status,
            departAt: activeTrip.departAt,
          }
        : null,
      alcoholCheckId: alcohol?.id,
      accessLogId: access.id,
      message: "Talanquera abierta — uplink nominal",
    };
  }

  /**
   * ¿Hay viaje activo en ventana horaria alrededor de `at`?
   * Exportado para pruebas unitarias.
   */
  async findActiveTripForVehicle(
    organizationId: string,
    vehicleId: string,
    at: Date = new Date(),
  ) {
    const windowMs = LPR_TRIP_WINDOW_HOURS * 3600_000;
    const from = new Date(at.getTime() - windowMs);
    const to = new Date(at.getTime() + windowMs);

    return this.prisma.trip.findFirst({
      where: {
        organizationId,
        vehicleId,
        status: { in: ACTIVE_TRIP_STATUSES },
        departAt: { gte: from, lte: to },
      },
      orderBy: { departAt: "asc" },
      select: {
        id: true,
        code: true,
        status: true,
        departAt: true,
        driverId: true,
      },
    });
  }

  private async findValidAlcoholCheck(
    organizationId: string,
    driverId: string | undefined,
    plate: string,
    at: Date,
  ) {
    const whereBase = {
      organizationId,
      passed: true,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: at } },
      ],
    };

    if (driverId) {
      const byDriver = await this.prisma.alcoholCheck.findFirst({
        where: { ...whereBase, driverId },
        orderBy: { checkedAt: "desc" },
      });
      if (byDriver) return byDriver;
    }

    return this.prisma.alcoholCheck.findFirst({
      where: { ...whereBase, plate },
      orderBy: { checkedAt: "desc" },
    });
  }

  /** Parqueo LIFO — bahías por hora de salida programada (más temprano → más cerca de salida) */
  async assignParkingLifo(
    organizationId: string,
    plate: string,
    scheduledDepartAt: Date,
  ) {
    const normalized = plate.toUpperCase().trim();
    const free = await this.prisma.yardParkingSlot.findMany({
      where: { organizationId, status: "FREE" },
      orderBy: [{ laneCode: "asc" }, { bayCode: "asc" }],
    });

    let slot = free[0];
    if (!slot) {
      slot = await this.prisma.yardParkingSlot.create({
        data: {
          organizationId,
          laneCode: "LIFO-A",
          bayCode: `B${String(Date.now()).slice(-4)}`,
          status: "FREE",
        },
      });
    }

    const occupied = await this.prisma.yardParkingSlot.update({
      where: { id: slot.id },
      data: {
        plate: normalized,
        scheduledDepartAt,
        occupiedAt: new Date(),
        status: "OCCUPIED",
        meta: { strategy: "LIFO", assignedForDepart: scheduledDepartAt },
      },
    });

    return {
      strategy: "LIFO" as const,
      laneCode: occupied.laneCode,
      bayCode: occupied.bayCode,
      plate: normalized,
      scheduledDepartAt,
      message: `Carril ${occupied.laneCode} · Bahía ${occupied.bayCode} — salida ${scheduledDepartAt.toISOString()}`,
    };
  }

  async yardMove(
    organizationId: string,
    dto: YardMoveDto,
    actorUserId?: string,
  ) {
    const plate = dto.plate.toUpperCase().trim();
    await this.prisma.yardParkingSlot.updateMany({
      where: { organizationId, plate, status: "OCCUPIED" },
      data: { status: "FREE", plate: null, vehicleId: null, occupiedAt: null },
    });

    const slot = await this.prisma.yardParkingSlot.upsert({
      where: {
        organizationId_laneCode_bayCode: {
          organizationId,
          laneCode: dto.toLane,
          bayCode: dto.toBay,
        },
      },
      create: {
        organizationId,
        laneCode: dto.toLane,
        bayCode: dto.toBay,
        plate,
        scheduledDepartAt: dto.scheduledDepartAt,
        occupiedAt: new Date(),
        status: "OCCUPIED",
        meta: { actorUserId, fromLane: dto.fromLane },
      },
      update: {
        plate,
        scheduledDepartAt: dto.scheduledDepartAt,
        occupiedAt: new Date(),
        status: "OCCUPIED",
        meta: { actorUserId, fromLane: dto.fromLane },
      },
    });

    await this.prisma.yardEvent.create({
      data: {
        organizationId,
        kind: "YARD_MOVE",
        payload: {
          plate,
          toLane: dto.toLane,
          toBay: dto.toBay,
          slotId: slot.id,
          actorUserId,
        },
      },
    });

    return { ok: true, slot, message: `Yard Move ${plate} → ${dto.toLane}/${dto.toBay}` };
  }

  async coordinadorDashboard(organizationId: string) {
    const [inventory, slots, washQueue, recentAccess] = await Promise.all([
      this.currentInventory(organizationId),
      this.prisma.yardParkingSlot.findMany({
        where: { organizationId },
        orderBy: [{ laneCode: "asc" }, { bayCode: "asc" }],
      }),
      this.prisma.yardWashJob.findMany({
        where: { organizationId, status: { in: ["QUEUED", "WASHING"] } },
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
        take: 30,
      }),
      this.prisma.yardAccessLog.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        take: 12,
      }),
    ]);

    return {
      hub: "Smart Yard",
      role: "COORDINADOR_PATIO",
      inventory,
      yardMap: slots,
      washQueue,
      talanquera: recentAccess.map((a) => {
        const meta = (a.meta ?? {}) as {
          blocks?: string[];
          tripCode?: string;
          mode?: string;
        };
        return {
          id: a.id,
          plate: a.plate,
          kind: a.kind,
          gateOpened: a.gateOpened,
          denied: a.denied,
          denyReason: a.denyReason,
          blocks: Array.isArray(meta.blocks) ? meta.blocks : [],
          tripCode: meta.tripCode ?? null,
          mode: meta.mode ?? null,
          createdAt: a.createdAt,
        };
      }),
    };
  }

  async auxiliarYardApp(organizationId: string) {
    const [washQueue, moves] = await Promise.all([
      this.prisma.yardWashJob.findMany({
        where: { organizationId, status: { in: ["QUEUED", "WASHING"] } },
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
        take: 40,
      }),
      this.prisma.yardParkingSlot.findMany({
        where: { organizationId, status: "OCCUPIED" },
        orderBy: { scheduledDepartAt: "asc" },
        take: 40,
      }),
    ]);
    return {
      hub: "Smart Yard App",
      role: "AUXILIAR_PATIO",
      washQueue,
      yardMoves: moves,
      ui: "WET_FINGER",
    };
  }

  async completeWash(
    organizationId: string,
    washJobId: string,
    notes?: string,
  ) {
    const job = await this.prisma.yardWashJob.findFirst({
      where: { id: washJobId, organizationId },
    });
    if (!job) throw new NotFoundException("Job de lavado no encontrado");
    return this.prisma.yardWashJob.update({
      where: { id: job.id },
      data: {
        status: "DONE",
        completedAt: new Date(),
        notes: notes ?? job.notes,
      },
    });
  }

  async currentInventory(organizationId: string) {
    const open = await this.prisma.parkingLog.findMany({
      where: { organizationId, checkedOutAt: null },
      include: {
        vehicle: {
          select: {
            id: true,
            plate: true,
            brand: true,
            model: true,
            status: true,
            complianceBlocked: true,
            complianceReason: true,
            odometerKm: true,
          },
        },
        driver: {
          select: {
            id: true,
            name: true,
            dispatchBlocked: true,
            blockReason: true,
            fatigueScore: true,
          },
        },
      },
      orderBy: { checkedInAt: "desc" },
    });

    return {
      count: open.length,
      inYard: open.map((p) => ({
        parkingLogId: p.id,
        plate: p.plate,
        checkedInAt: p.checkedInAt,
        odometerInKm: p.odometerInKm,
        guardName: p.guardName,
        vehicle: p.vehicle,
        driver: p.driver,
      })),
    };
  }

  /**
   * Evalúa bloqueos de salida (compliance vehículo, mantenimiento, fatiga conductor).
   */
  evaluateCheckoutDenial(
    vehicle: {
      id: string;
      complianceBlocked: boolean;
      complianceReason: string | null;
      status: VehicleStatus;
    },
    driver: {
      id: string;
      dispatchBlocked: boolean;
      blockReason: string | null;
      fatigueScore: number;
      active: boolean;
    } | null,
  ): { reason: string; blocks: string[] } | null {
    const blocks: string[] = [];

    if (vehicle.complianceBlocked) {
      blocks.push(
        vehicle.complianceReason || "VEHICLE_COMPLIANCE_BLOCKED",
      );
    }
    if (
      vehicle.status === VehicleStatus.MAINTENANCE ||
      vehicle.status === VehicleStatus.COMPLIANCE_BLOCKED ||
      vehicle.status === VehicleStatus.OUT_OF_SERVICE
    ) {
      blocks.push(`VEHICLE_STATUS_${vehicle.status}`);
    }
    if (driver) {
      if (!driver.active) blocks.push("DRIVER_INACTIVE");
      if (driver.dispatchBlocked) {
        blocks.push(driver.blockReason || "DRIVER_DISPATCH_BLOCKED");
      }
      if (driver.fatigueScore >= HARD_RULES.FATIGUE_BLOCK_SCORE) {
        blocks.push("DRIVER_FATIGUE");
      }
    }

    if (!blocks.length) return null;
    return {
      reason: GATE_CHECKOUT_DENIED,
      blocks,
    };
  }

  private async checkIn(
    organizationId: string,
    ctx: {
      vehicle: { id: string; plate: string; odometerKm: number };
      plate: string;
      driver: { id: string; name: string } | null;
      dto: YardAccessLogDto;
      actorUserId?: string;
    },
  ) {
    const existing = await this.prisma.parkingLog.findFirst({
      where: {
        organizationId,
        vehicleId: ctx.vehicle.id,
        checkedOutAt: null,
      },
    });
    if (existing) {
      throw new BadRequestException({
        error: "ALREADY_IN_YARD",
        message: "La unidad ya figura en patio — cierre el CHECK_IN previo",
        parkingLogId: existing.id,
      });
    }

    const odometerKm = ctx.dto.odometerKm ?? ctx.vehicle.odometerKm;
    const parking = await this.prisma.parkingLog.create({
      data: {
        organizationId,
        vehicleId: ctx.vehicle.id,
        plate: ctx.plate,
        driverId: ctx.driver?.id,
        driverName: ctx.dto.driverName || ctx.driver?.name,
        guardName: ctx.dto.guardName,
        odometerInKm: odometerKm,
        checkedInAt: new Date(),
      },
    });

    if (ctx.dto.odometerKm != null) {
      await this.prisma.vehicle.update({
        where: { id: ctx.vehicle.id },
        data: { odometerKm: ctx.dto.odometerKm },
      });
    }

    const access = await this.prisma.yardAccessLog.create({
      data: {
        organizationId,
        kind: YardAccessKind.CHECK_IN,
        plate: ctx.plate,
        vehicleId: ctx.vehicle.id,
        driverId: ctx.driver?.id,
        parkingLogId: parking.id,
        odometerKm,
        gateId: ctx.dto.gateId,
        cameraRef: ctx.dto.cameraRef,
        lprConfidence: ctx.dto.lprConfidence,
        gateOpened: true,
        denied: false,
        meta: { actorUserId: ctx.actorUserId },
      },
    });

    await this.prisma.yardEvent.create({
      data: {
        organizationId,
        vehicleId: ctx.vehicle.id,
        kind: "ENTRY",
        payload: { accessLogId: access.id, parkingLogId: parking.id, odometerKm },
      },
    });

    return {
      gateOpened: true,
      access,
      parking,
      odometerDelta: null as number | null,
    };
  }

  private async checkOut(
    organizationId: string,
    ctx: {
      vehicle: { id: string; plate: string; odometerKm: number };
      plate: string;
      driver: { id: string; name: string } | null;
      dto: YardAccessLogDto;
      actorUserId?: string;
    },
  ) {
    const parking = await this.prisma.parkingLog.findFirst({
      where: {
        organizationId,
        vehicleId: ctx.vehicle.id,
        checkedOutAt: null,
      },
      orderBy: { checkedInAt: "desc" },
    });
    if (!parking) {
      throw new NotFoundException({
        error: "NOT_IN_YARD",
        message: "No hay CHECK_IN abierto para esta unidad",
      });
    }

    const odometerKm = ctx.dto.odometerKm ?? ctx.vehicle.odometerKm;
    const odometerDelta =
      parking.odometerInKm != null
        ? odometerKm - parking.odometerInKm
        : null;

    const closed = await this.prisma.parkingLog.update({
      where: { id: parking.id },
      data: {
        checkedOutAt: new Date(),
        odometerOutKm: odometerKm,
        driverId: ctx.driver?.id ?? parking.driverId,
        driverName:
          ctx.dto.driverName || ctx.driver?.name || parking.driverName,
      },
    });

    if (ctx.dto.odometerKm != null) {
      await this.prisma.vehicle.update({
        where: { id: ctx.vehicle.id },
        data: { odometerKm: ctx.dto.odometerKm },
      });
    }

    const access = await this.prisma.yardAccessLog.create({
      data: {
        organizationId,
        kind: YardAccessKind.CHECK_OUT,
        plate: ctx.plate,
        vehicleId: ctx.vehicle.id,
        driverId: ctx.driver?.id,
        parkingLogId: closed.id,
        odometerKm,
        gateId: ctx.dto.gateId,
        cameraRef: ctx.dto.cameraRef,
        lprConfidence: ctx.dto.lprConfidence,
        gateOpened: true,
        denied: false,
        meta: {
          actorUserId: ctx.actorUserId,
          odometerDelta,
          odometerInKm: parking.odometerInKm,
        },
      },
    });

    await this.prisma.yardEvent.create({
      data: {
        organizationId,
        vehicleId: ctx.vehicle.id,
        kind: "EXIT",
        payload: {
          accessLogId: access.id,
          parkingLogId: closed.id,
          odometerKm,
          odometerDelta,
        },
      },
    });

    return {
      gateOpened: true,
      access,
      parking: closed,
      odometerDelta,
    };
  }

  private async resolveVehicle(
    organizationId: string,
    dto: YardAccessLogDto,
  ) {
    if (dto.vehicleId) {
      const v = await this.prisma.vehicle.findFirst({
        where: { id: dto.vehicleId, organizationId },
      });
      if (!v) throw new NotFoundException("Vehículo no encontrado");
      return v;
    }
    if (!dto.plate) {
      throw new BadRequestException("Indique vehicleId o plate (LPR)");
    }
    const plate = dto.plate.toUpperCase().trim();
    const v = await this.prisma.vehicle.findFirst({
      where: { organizationId, plate },
    });
    if (!v) {
      throw new NotFoundException({
        error: "PLATE_NOT_IN_FLEET",
        message: `Placa ${plate} no registrada en flota`,
      });
    }
    return v;
  }

  private async loadDriver(organizationId: string, driverId: string) {
    const d = await this.prisma.driver.findFirst({
      where: { id: driverId, organizationId },
    });
    if (!d) throw new NotFoundException("Conductor no encontrado");
    return d;
  }
}
