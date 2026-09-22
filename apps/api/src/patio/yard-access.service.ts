import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  FleetModule,
  ShiftStatus,
  TripStatus,
  VehicleStatus,
  YardAccessKind,
} from "@fsg/db";
import { HARD_RULES } from "@fsg/shared";
import { PrismaService } from "../prisma/prisma.service";
import type {
  GateDecisionDto,
  LprCheckDto,
  YardAccessLogDto,
  YardMoveDto,
} from "./dto/patio.dto";

export const GATE_CHECKOUT_DENIED = "GATE_CHECKOUT_DENIED_COMPLIANCE_BLOCK";
export const LPR_HARD_STOP = "LPR_HARD_STOP";
export const LPR_NO_ACTIVE_TRIP = "NO_ACTIVE_TRIP";
export const GATE_DECISION_DENIED = "GATE_DECISION_DENIED";

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
      decision: "ENTRA" as const,
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
      reasons: [] as string[],
      message: "Talanquera abierta — uplink nominal",
    };
  }

  /**
   * SCRUM-45 — Decisión unificada ENTRA / NO_ENTRA por placa o cédula.
   * No lanza 422: siempre responde payload canónico para la UI de portería.
   */
  async gateDecision(
    organizationId: string,
    dto: GateDecisionDto,
    actorUserId?: string,
  ) {
    const at = dto.at ?? new Date();
    const plate = dto.plate?.trim();
    const document = dto.document?.replace(/\D/g, "").trim();

    if (plate) {
      try {
        const opened = await this.lprCheck(
          organizationId,
          {
            plate,
            gateId: dto.gateId,
            at,
          },
          actorUserId,
        );
        return {
          decision: "ENTRA" as const,
          subjectType: "VEHICLE" as const,
          plate: opened.plate,
          vehicleId: opened.vehicleId,
          trip: opened.trip,
          reasons: [] as string[],
          accessLogId: opened.accessLogId,
          gateOpened: true,
          message: opened.message,
        };
      } catch (err) {
        const body =
          err instanceof UnprocessableEntityException
            ? (err.getResponse() as {
                blocks?: string[];
                accessLogId?: string;
                plate?: string;
                vehicleId?: string;
                message?: string;
              })
            : null;
        const reasons = body?.blocks?.length
          ? body.blocks
          : [err instanceof Error ? err.message : GATE_DECISION_DENIED];
        return {
          decision: "NO_ENTRA" as const,
          subjectType: "VEHICLE" as const,
          plate: body?.plate ?? plate.toUpperCase(),
          vehicleId: body?.vehicleId ?? null,
          trip: null,
          reasons,
          accessLogId: body?.accessLogId ?? null,
          gateOpened: false,
          message: body?.message ?? "Talanquera cerrada",
        };
      }
    }

    return this.gateDecisionByDocument(
      organizationId,
      document!,
      dto.direction ?? "OUT",
      dto.gateId,
      at,
      actorUserId,
    );
  }

  private async gateDecisionByDocument(
    organizationId: string,
    document: string,
    direction: "IN" | "OUT",
    gateId: string | undefined,
    at: Date,
    actorUserId?: string,
  ) {
    const reasons: string[] = [];

    const driver = await this.prisma.driver.findFirst({
      where: { organizationId, document },
      select: {
        id: true,
        name: true,
        document: true,
        active: true,
        dispatchBlocked: true,
        blockReason: true,
        fatigueScore: true,
      },
    });

    if (driver) {
      if (!driver.active) reasons.push("DRIVER_INACTIVE");
      if (driver.dispatchBlocked) {
        reasons.push(driver.blockReason || "DRIVER_DISPATCH_BLOCKED");
      }
      if (driver.fatigueScore >= HARD_RULES.DISPATCH_FATIGUE_MAX) {
        reasons.push("DRIVER_FATIGUE");
      }

      const alcohol = await this.findValidAlcoholCheck(
        organizationId,
        driver.id,
        "",
        at,
      );
      if (direction === "OUT" && !alcohol) {
        reasons.push("ALCOHOL_CHECK_MISSING_OR_FAILED");
      }

      const activeTrip = await this.prisma.trip.findFirst({
        where: {
          organizationId,
          driverId: driver.id,
          status: { in: ACTIVE_TRIP_STATUSES },
        },
        orderBy: { departAt: "asc" },
        select: {
          id: true,
          code: true,
          status: true,
          departAt: true,
          vehicleId: true,
        },
      });
      if (direction === "OUT" && !activeTrip) {
        reasons.push(LPR_NO_ACTIVE_TRIP);
      }

      const decision = reasons.length === 0 ? "ENTRA" : "NO_ENTRA";
      const access = await this.prisma.yardAccessLog.create({
        data: {
          organizationId,
          kind:
            direction === "IN"
              ? YardAccessKind.CHECK_IN
              : YardAccessKind.CHECK_OUT,
          plate: activeTrip?.vehicleId ? "DOC-GATE" : "DOC-GATE",
          driverId: driver.id,
          vehicleId: activeTrip?.vehicleId ?? undefined,
          gateId: gateId ?? "GATE-MAIN",
          gateOpened: decision === "ENTRA",
          denied: decision === "NO_ENTRA",
          denyReason: decision === "NO_ENTRA" ? GATE_DECISION_DENIED : null,
          meta: {
            mode: "DOCUMENT_GATE",
            document,
            actorUserId,
            reasons,
            tripId: activeTrip?.id,
          },
        },
      });

      return {
        decision: decision as "ENTRA" | "NO_ENTRA",
        subjectType: "DRIVER" as const,
        document,
        driver: {
          id: driver.id,
          name: driver.name,
          document: driver.document,
        },
        trip: activeTrip
          ? {
              id: activeTrip.id,
              code: activeTrip.code,
              status: activeTrip.status,
              departAt: activeTrip.departAt,
            }
          : null,
        reasons,
        accessLogId: access.id,
        gateOpened: decision === "ENTRA",
        message:
          decision === "ENTRA"
            ? `Acceso autorizado — conductor ${driver.name}`
            : `Acceso denegado — ${reasons.join(" · ")}`,
      };
    }

    const visitor = await this.prisma.visitor.findFirst({
      where: {
        organizationId,
        document,
        checkedOutAt: null,
      },
      orderBy: { checkedInAt: "desc" },
    });

    if (visitor) {
      if (visitor.kind === "CONTRACTOR" && !visitor.arlValid) {
        reasons.push("VISITOR_ARL_INVALID");
      }
      if (direction === "OUT" && !visitor.badgeRfid) {
        reasons.push("VISITOR_BADGE_MISSING");
      }
      const decision = reasons.length === 0 ? "ENTRA" : "NO_ENTRA";
      return {
        decision: decision as "ENTRA" | "NO_ENTRA",
        subjectType: "VISITOR" as const,
        document,
        visitor: {
          id: visitor.id,
          name: visitor.name,
          hostName: visitor.hostName,
          boardStatus: visitor.boardStatus,
        },
        reasons,
        accessLogId: null,
        gateOpened: decision === "ENTRA",
        message:
          decision === "ENTRA"
            ? `Visitante autorizado — ${visitor.name}`
            : `Visitante denegado — ${reasons.join(" · ")}`,
      };
    }

    return {
      decision: "NO_ENTRA" as const,
      subjectType: "UNKNOWN" as const,
      document,
      reasons: ["DOCUMENT_NOT_FOUND"],
      accessLogId: null,
      gateOpened: false,
      message: "Documento no registrado como conductor ni visitante activo",
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

    /** SCRUM-32: check-out = Timer 0 Logística + inicio turno RRHH */
    const sideEffects = await this.startLogisticsTimerAndRrhhShift(
      organizationId,
      {
        vehicleId: ctx.vehicle.id,
        driverId: ctx.driver?.id ?? closed.driverId ?? undefined,
        accessLogId: access.id,
        parkingLogId: closed.id,
      },
    );

    return {
      gateOpened: true,
      access,
      parking: closed,
      odometerDelta,
      logisticsTimer: sideEffects.logisticsTimer,
      rrhhShift: sideEffects.rrhhShift,
    };
  }

  /**
   * Portería CHECK_OUT → arranca reloj de viaje (IN_TRANSIT) y abre turno RRHH.
   */
  private async startLogisticsTimerAndRrhhShift(
    organizationId: string,
    ctx: {
      vehicleId: string;
      driverId?: string | null;
      accessLogId: string;
      parkingLogId: string;
    },
  ) {
    const now = new Date();
    let logisticsTimer: {
      tripId: string;
      code: string;
      startedAt: Date;
      status: TripStatus;
    } | null = null;
    let rrhhShift: {
      id: string;
      driverId: string;
      checkInAt: Date;
      created: boolean;
    } | null = null;
    let driverId = ctx.driverId ?? null;

    const trip = await this.findActiveTripForVehicle(
      organizationId,
      ctx.vehicleId,
      now,
    );

    if (trip) {
      const full = await this.prisma.trip.findFirst({
        where: { id: trip.id },
        select: { id: true, code: true, driverId: true, meta: true },
      });
      if (full) {
        const updated = await this.prisma.trip.update({
          where: { id: full.id },
          data: {
            status: TripStatus.IN_TRANSIT,
            startedAt: now,
            meta: {
              ...((full.meta as object) || {}),
              yardCheckoutAt: now.toISOString(),
              yardAccessLogId: ctx.accessLogId,
              parkingLogId: ctx.parkingLogId,
              logisticsTimerZeroAt: now.toISOString(),
            },
          },
          select: {
            id: true,
            code: true,
            startedAt: true,
            status: true,
            driverId: true,
          },
        });
        logisticsTimer = {
          tripId: updated.id,
          code: updated.code,
          startedAt: updated.startedAt ?? now,
          status: updated.status,
        };
        if (!driverId && updated.driverId) {
          driverId = updated.driverId;
        }
      }
    }

    if (driverId) {
      const open = await this.prisma.driverShift.findFirst({
        where: {
          organizationId,
          driverId,
          status: ShiftStatus.OPEN,
        },
        orderBy: { checkInAt: "desc" },
      });
      if (open) {
        rrhhShift = {
          id: open.id,
          driverId: open.driverId,
          checkInAt: open.checkInAt,
          created: false,
        };
      } else {
        const shift = await this.prisma.driverShift.create({
          data: {
            organizationId,
            driverId,
            checkInAt: now,
            status: ShiftStatus.OPEN,
            notes: "Inicio turno por CHECK_OUT portería",
            meta: {
              source: "YARD_CHECK_OUT",
              accessLogId: ctx.accessLogId,
              parkingLogId: ctx.parkingLogId,
              tripId: logisticsTimer?.tripId ?? null,
            },
          },
        });
        rrhhShift = {
          id: shift.id,
          driverId: shift.driverId,
          checkInAt: shift.checkInAt,
          created: true,
        };
      }
    }

    return { logisticsTimer, rrhhShift };
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
