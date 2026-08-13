import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  ComplianceDocType,
  TripStatus,
  VehicleStatus,
} from "@fsg/db";
import { HARD_RULES } from "@fsg/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { KafkaEventsService } from "../../logistics/kafka-events.service";
import { LogisticsGateway } from "../../logistics/logistics.gateway";
import type {
  AsignarViajeDto,
  BuscarRelevoFlashDto,
} from "./dto/despacho.dto";
import {
  evaluateDispatchFatigue,
  evaluateLegalRestHours,
  haversineKm,
} from "./dto/despacho.dto";

/**
 * Módulo 9.1 — Micro-Dispatch 4.0 (Gestor Operativo · Luis).
 * Triple candado: Tarjeta Operación + Extintor + Fatiga/Descanso legal.
 */
@Injectable()
export class DespachoService {
  private readonly logger = new Logger(DespachoService.name);

  constructor(
    private prisma: PrismaService,
    private kafka: KafkaEventsService,
    private gateway: LogisticsGateway,
  ) {}

  /**
   * Asignación inteligente con publicación silenciosa a App conductor.
   */
  async asignarViaje(
    organizationId: string,
    actorUserId: string,
    dto: AsignarViajeDto,
  ) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: dto.tripId, organizationId },
      include: {
        customer: { select: { id: true, name: true } },
        route: true,
      },
    });
    if (!trip) throw new NotFoundException("Viaje no encontrado");
    if (
      trip.status === TripStatus.COMPLETED ||
      trip.status === TripStatus.CANCELLED
    ) {
      throw new BadRequestException("No se puede asignar un viaje cerrado");
    }

    const [driver, vehicle] = await Promise.all([
      this.prisma.driver.findFirst({
        where: { id: dto.driverId, organizationId, active: true },
      }),
      this.prisma.vehicle.findFirst({
        where: { id: dto.vehicleId, organizationId },
        include: { complianceDocs: true, fleetStops: true },
      }),
    ]);
    if (!driver) throw new NotFoundException("Conductor no encontrado");
    if (!vehicle) throw new NotFoundException("Vehículo no encontrado");

    const locks = await this.evaluateTripleLock({
      organizationId,
      driver,
      vehicle,
      departAt: trip.departAt,
    });
    if (!locks.ok) {
      throw new BadRequestException({
        error: "TRIPLE_LOCK_BLOCKED",
        message: locks.message,
        blocks: locks.blocks,
        statusCode: 400,
      });
    }

    const publishedAt = new Date().toISOString();
    const meta = {
      ...(typeof trip.meta === "object" && trip.meta
        ? (trip.meta as object)
        : {}),
      publishedToApp: dto.publishToApp !== false,
      publishedAt,
      itineraryAckAt: null as string | null,
      passengerList: dto.passengerList || [],
      mapPolyline: dto.mapPolyline || trip.suggestedPolyline || null,
      publishedById: actorUserId,
      tripleLock: locks.checks,
    };

    const updated = await this.prisma.trip.update({
      where: { id: trip.id },
      data: {
        driverId: driver.id,
        vehicleId: vehicle.id,
        status: TripStatus.ASSIGNED,
        meta,
      },
      include: {
        driver: true,
        vehicle: true,
        customer: { select: { name: true } },
      },
    });

    if (dto.publishToApp !== false) {
      await this.kafka.emit("dispatch.itinerary.published", {
        organizationId,
        tripId: trip.id,
        code: trip.code,
        driverId: driver.id,
        vehicleId: vehicle.id,
        plate: vehicle.plate,
        passengerCount: (dto.passengerList || []).length,
        silent: true,
        channel: "APP_CONDUCTOR",
      });
    }

    this.gateway.emitUpdate(organizationId);
    this.logger.log(
      `Asignación ${trip.code} · ${driver.name} / ${vehicle.plate} · publish=${dto.publishToApp !== false}`,
    );

    return {
      trip: updated,
      tripleLock: locks.checks,
      published: dto.publishToApp !== false,
      message: `Viaje ${trip.code} asignado y publicado a App conductor`,
    };
  }

  /**
   * Viaje descubierto por incapacidad → retén GPS + reasignación 1-clic.
   */
  async buscarRelevoFlash(
    organizationId: string,
    actorUserId: string,
    dto: BuscarRelevoFlashDto,
  ) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: dto.tripId, organizationId },
      include: {
        vehicle: true,
        driver: true,
      },
    });
    if (!trip) throw new NotFoundException("Viaje no encontrado");

    const originLat = trip.vehicle?.lat ?? trip.originLat ?? 4.711;
    const originLng = trip.vehicle?.lng ?? trip.originLng ?? -74.0721;
    const radiusKm = dto.radiusKm ?? 12;

    const drivers = await this.prisma.driver.findMany({
      where: {
        organizationId,
        active: true,
        dispatchBlocked: false,
        id: { not: trip.driverId ?? undefined },
        fatigueScore: { lt: HARD_RULES.DISPATCH_FATIGUE_MAX },
      },
      include: {
        user: { select: { id: true } },
        novelties: {
          where: {
            kind: { in: ["INCAPACITY", "UNJUSTIFIED_ABSENCE"] },
            dateFrom: { lte: trip.departAt },
            dateTo: { gte: trip.departAt },
          },
          take: 1,
        },
      },
    });

    const eligible: Array<{
      driverId: string;
      name: string;
      document: string;
      fatigueScore: number;
      distanceKm: number;
      restHours: number | null;
      pushTargetUserId: string | null;
    }> = [];
    for (const d of drivers) {
      if (d.novelties?.length) continue;
      const rest = await this.getLastDutyEndedAt(organizationId, d.id);
      const restEval = evaluateLegalRestHours({
        lastDutyEndedAt: rest,
        departAt: trip.departAt,
      });
      if (!restEval.ok) continue;

      // Geolocalización aproximada vía último viaje del conductor o vehículo asignado reciente
      const lastTrip = await this.prisma.trip.findFirst({
        where: {
          organizationId,
          driverId: d.id,
          vehicle: { isNot: null },
        },
        include: { vehicle: { select: { lat: true, lng: true } } },
        orderBy: { departAt: "desc" },
      });
      const lat = lastTrip?.vehicle?.lat ?? originLat;
      const lng = lastTrip?.vehicle?.lng ?? originLng;
      const distanceKm = haversineKm(originLat, originLng, lat, lng);
      if (distanceKm > radiusKm) continue;

      eligible.push({
        driverId: d.id,
        name: d.name,
        document: d.document,
        fatigueScore: d.fatigueScore,
        distanceKm,
        restHours: restEval.restHours,
        pushTargetUserId: d.user?.id || null,
      });
    }

    eligible.sort(
      (a, b) =>
        a.distanceKm - b.distanceKm || a.fatigueScore - b.fatigueScore,
    );

    await this.kafka.emit("dispatch.viaje.descubierto", {
      organizationId,
      tripId: trip.id,
      code: trip.code,
      alert: "VIAJE_DESCUBIERTO",
      sound: true,
      candidateCount: eligible.length,
    });

    let assigned = null as Awaited<ReturnType<DespachoService["asignarViaje"]>> | null;
    const pickId = dto.substituteDriverId || (dto.assignBest ? eligible[0]?.driverId : null);
    if (pickId && trip.vehicleId) {
      assigned = await this.asignarViaje(organizationId, actorUserId, {
        tripId: trip.id,
        driverId: pickId,
        vehicleId: trip.vehicleId,
        publishToApp: true,
      });
      const pick = eligible.find((e) => e.driverId === pickId);
      if (pick?.pushTargetUserId) {
        await this.kafka.emit("push.notify", {
          organizationId,
          userId: pick.pushTargetUserId,
          title: `Relevo flash · ${trip.code}`,
          body: `Eres titular de relevo del servicio ${trip.code}`,
        });
      }
    }

    return {
      alert: {
        type: "VIAJE_DESCUBIERTO",
        sound: true,
        message: `Viaje descubierto ${trip.code} — ${eligible.length} retén(es) en ${radiusKm} km`,
      },
      candidates: eligible.slice(0, 10),
      assigned,
    };
  }

  async dashboard(organizationId: string, filters?: {
    customerId?: string;
    vehicleType?: string;
  }) {
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const trips = await this.prisma.trip.findMany({
      where: {
        organizationId,
        departAt: { gte: dayStart, lt: dayEnd },
        ...(filters?.customerId ? { customerId: filters.customerId } : {}),
      },
      include: {
        vehicle: {
          select: {
            id: true,
            plate: true,
            status: true,
            brand: true,
            model: true,
            capacity: true,
          },
        },
        driver: {
          select: {
            id: true,
            name: true,
            fatigueScore: true,
            dispatchBlocked: true,
          },
        },
        customer: { select: { id: true, name: true } },
      },
      orderBy: { departAt: "asc" },
      take: 120,
    });

    const filtered = filters?.vehicleType
      ? trips.filter((t) =>
          `${t.vehicle?.brand || ""} ${t.vehicle?.model || ""}`
            .toLowerCase()
            .includes(filters.vehicleType!.toLowerCase()),
        )
      : trips;

    const gantt = filtered.map((t) => {
      const meta = (t.meta || {}) as {
        publishedToApp?: boolean;
        itineraryAckAt?: string | null;
        publishedAt?: string;
      };
      let color: "blue" | "green" | "gray" | "red" = "blue";
      if (
        t.vehicle?.status === VehicleStatus.MAINTENANCE ||
        t.vehicle?.status === VehicleStatus.OUT_OF_SERVICE
      ) {
        color = "gray";
      } else if (
        t.driver?.dispatchBlocked ||
        (t.driver &&
          t.driver.fatigueScore >= HARD_RULES.DISPATCH_FATIGUE_MAX)
      ) {
        color = "red";
      } else if (t.status === TripStatus.IN_TRANSIT) {
        color = "green";
      } else if (t.status === TripStatus.ASSIGNED) {
        color = "blue";
      } else if (t.status === TripStatus.PENDING) {
        color = "red";
      }

      return {
        id: t.id,
        code: t.code,
        plate: t.vehicle?.plate || "SIN-PLACA",
        vehicleId: t.vehicleId,
        vehicleLabel: t.vehicle
          ? `${t.vehicle.brand} ${t.vehicle.model}`
          : null,
        customerId: t.customerId,
        customerName: t.customer?.name,
        driverName: t.driver?.name,
        fatigueScore: t.driver?.fatigueScore,
        departAt: t.departAt,
        arriveAt: t.arriveAt,
        status: t.status,
        color,
        appMonitor: {
          published: !!meta.publishedToApp,
          publishedAt: meta.publishedAt || null,
          acknowledged: !!meta.itineraryAckAt,
          ackAt: meta.itineraryAckAt || null,
        },
      };
    });

    const customers = [
      ...new Map(
        filtered
          .filter((t) => t.customer)
          .map((t) => [t.customer!.id, t.customer!.name]),
      ),
    ].map(([id, name]) => ({ id, name }));

    return {
      gantt,
      filters: {
        customers,
        vehicleTypes: [
          ...new Set(
            filtered
              .map((t) => t.vehicle?.brand)
              .filter(Boolean) as string[],
          ),
        ],
      },
      stats: {
        assigned: gantt.filter((g) => g.color === "blue").length,
        inRoute: gantt.filter((g) => g.color === "green").length,
        workshop: gantt.filter((g) => g.color === "gray").length,
        blocked: gantt.filter((g) => g.color === "red").length,
        ackRate:
          gantt.filter((g) => g.appMonitor.published).length > 0
            ? Math.round(
                (gantt.filter((g) => g.appMonitor.acknowledged).length /
                  gantt.filter((g) => g.appMonitor.published).length) *
                  100,
              )
            : 0,
      },
      rules: {
        dispatchFatigueMax: HARD_RULES.DISPATCH_FATIGUE_MAX,
        minLegalRestHours: HARD_RULES.MIN_LEGAL_REST_HOURS,
      },
    };
  }

  private async evaluateTripleLock(input: {
    organizationId: string;
    driver: {
      id: string;
      fatigueScore: number;
      dispatchBlocked: boolean;
      blockReason: string | null;
    };
    vehicle: {
      id: string;
      status: VehicleStatus;
      complianceBlocked: boolean;
      complianceDocs: Array<{
        type: ComplianceDocType;
        status: string;
        expiresAt: Date | null;
      }>;
      fleetStops: Array<{ status: string; windowStart: Date; windowEnd: Date }>;
    };
    departAt: Date;
  }) {
    const blocks: string[] = [];
    const checks: Record<string, boolean | string | number | null> = {};

    // Vehículos inmovilizados / vencidos ocultos del pool
    if (
      input.vehicle.status === VehicleStatus.MAINTENANCE ||
      input.vehicle.status === VehicleStatus.OUT_OF_SERVICE ||
      input.vehicle.status === VehicleStatus.COMPLIANCE_BLOCKED
    ) {
      blocks.push("VEHICLE_IMMOBILIZED");
    }
    if (input.vehicle.complianceBlocked) {
      blocks.push("VEHICLE_COMPLIANCE_BLOCKED");
    }
    const stopActive = input.vehicle.fleetStops?.some(
      (s) =>
        (s.status === "APPROVED" || s.status === "ACTIVE") &&
        s.windowStart <= input.departAt &&
        s.windowEnd >= input.departAt,
    );
    if (stopActive) blocks.push("VEHICLE_FLEET_STOP");

    const now = new Date();
    const docOk = (type: ComplianceDocType) => {
      const docs = input.vehicle.complianceDocs.filter((d) => d.type === type);
      if (!docs.length) return false;
      return docs.some((d) => {
        const st = String(d.status);
        const statusOk = st === "VALID" || st === "EXPIRING";
        return statusOk && (!d.expiresAt || d.expiresAt > now);
      });
    };

    const tarjetaOk = docOk(ComplianceDocType.TARJETA_OPERACION);
    checks.tarjetaOperacion = tarjetaOk;
    if (!tarjetaOk) blocks.push("VEHICLE_TARJETA_OPERACION");

    const extintorOk =
      docOk(ComplianceDocType.EXTINTOR) ||
      docOk(ComplianceDocType.REVISION_PREVENTIVA);
    checks.extintor = extintorOk;
    if (!extintorOk) blocks.push("VEHICLE_EXTINTOR");

    if (input.driver.dispatchBlocked) {
      blocks.push("DRIVER_DISPATCH_BLOCKED");
      checks.dispatchBlocked = input.driver.blockReason;
    }

    const fatigue = evaluateDispatchFatigue(input.driver.fatigueScore);
    checks.fatigueScore = input.driver.fatigueScore;
    if (!fatigue.ok) blocks.push(fatigue.code!);

    const lastDuty = await this.getLastDutyEndedAt(
      input.organizationId,
      input.driver.id,
    );
    const rest = evaluateLegalRestHours({
      lastDutyEndedAt: lastDuty,
      departAt: input.departAt,
    });
    checks.restHours = rest.restHours;
    checks.minRestHours = rest.required;
    if (!rest.ok) blocks.push(rest.code!);

    return {
      ok: blocks.length === 0,
      blocks: [...new Set(blocks)],
      checks,
      message:
        blocks.length > 0
          ? `Triple candado: ${blocks.join(" · ")}`
          : "Triple candado OK",
    };
  }

  private async getLastDutyEndedAt(
    organizationId: string,
    driverId: string,
  ): Promise<Date | null> {
    const [lastShift, lastTrip] = await Promise.all([
      this.prisma.driverShift.findFirst({
        where: {
          organizationId,
          driverId,
          checkOutAt: { not: null },
        },
        orderBy: { checkOutAt: "desc" },
      }),
      this.prisma.trip.findFirst({
        where: {
          organizationId,
          driverId,
          status: TripStatus.COMPLETED,
          completedAt: { not: null },
        },
        orderBy: { completedAt: "desc" },
      }),
    ]);
    const a = lastShift?.checkOutAt?.getTime() ?? 0;
    const b = lastTrip?.completedAt?.getTime() ?? 0;
    if (!a && !b) return null;
    return new Date(Math.max(a, b));
  }
}
