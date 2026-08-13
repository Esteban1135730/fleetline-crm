import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  FleetStopKind,
  FleetStopStatus,
  TripStatus,
  VehicleStatus,
} from "@fsg/db";
import { PrismaService } from "../../prisma/prisma.service";
import { KafkaEventsService } from "../../logistics/kafka-events.service";
import { LogisticsGateway } from "../../logistics/logistics.gateway";
import type {
  AprobarParadaFlotaDto,
  CapacityPlanningQuery,
  OverrideReasignarDto,
} from "./dto/director.dto";
import {
  haversineKm,
  isGanttBlockedByFleetStop,
} from "./dto/director.dto";

/**
 * Módulo 9 — Dirección Operativa / Control Tower (Héctor).
 */
@Injectable()
export class DirectorOperativoService {
  private readonly logger = new Logger(DirectorOperativoService.name);

  constructor(
    private prisma: PrismaService,
    private kafka: KafkaEventsService,
    private gateway: LogisticsGateway,
  ) {}

  /**
   * Override de contingencia: pool GPS + reasignación entre contratos.
   */
  async overrideReasignar(
    organizationId: string,
    actorUserId: string,
    dto: OverrideReasignarDto,
  ) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: dto.tripId, organizationId },
      include: {
        vehicle: true,
        driver: true,
        customer: { select: { id: true, name: true } },
        contract: { select: { id: true, code: true } },
      },
    });
    if (!trip) throw new NotFoundException("Servicio no encontrado");

    const originLat = trip.vehicle?.lat ?? trip.originLat ?? 4.711;
    const originLng = trip.vehicle?.lng ?? trip.originLng ?? -74.0721;
    const radiusKm = dto.radiusKm ?? 15;

    const fleet = await this.prisma.vehicle.findMany({
      where: {
        organizationId,
        status: { in: [VehicleStatus.AVAILABLE, VehicleStatus.IN_SERVICE] },
        complianceBlocked: false,
        id: { not: trip.vehicleId ?? undefined },
      },
    });

    const nearby = fleet
      .map((v) => ({
        ...v,
        distanceKm: haversineKm(originLat, originLng, v.lat, v.lng),
      }))
      .filter((v) => v.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    const newVehicleId = dto.newVehicleId || nearby[0]?.id;
    if (!newVehicleId && !dto.newDriverId) {
      throw new BadRequestException(
        `Sin flota disponible en radio ${radiusKm} km para override`,
      );
    }

    if (newVehicleId) {
      const stops = await this.prisma.fleetStop.findMany({
        where: {
          organizationId,
          vehicleId: newVehicleId,
          status: { in: [FleetStopStatus.APPROVED, FleetStopStatus.ACTIVE] },
        },
      });
      const block = isGanttBlockedByFleetStop(
        newVehicleId,
        trip.departAt,
        trip.arriveAt,
        stops.map((s) => ({
          vehicleId: s.vehicleId,
          status: s.status,
          blocksGantt: s.blocksGantt,
          windowStart: s.windowStart,
          windowEnd: s.windowEnd,
        })),
      );
      if (block.blocked && !dto.forceOverride) {
        throw new UnprocessableEntityException({
          error: "GANTT_FLEET_STOP_BLOCKED",
          message: block.reason,
        });
      }
      if (block.blocked && dto.forceOverride) {
        this.logger.warn(
          `Override forzado sobre parada flota vehículo ${newVehicleId}`,
        );
      }
    }

    const data: {
      vehicleId?: string;
      driverId?: string;
      status?: TripStatus;
    } = {};
    if (newVehicleId) data.vehicleId = newVehicleId;
    if (dto.newDriverId) data.driverId = dto.newDriverId;
    if (trip.status === TripStatus.PENDING) data.status = TripStatus.ASSIGNED;

    const updated = await this.prisma.trip.update({
      where: { id: trip.id },
      data,
      include: {
        vehicle: true,
        driver: true,
        customer: { select: { id: true, name: true } },
      },
    });

    const notify = [
      dto.notifyDrivers !== false && trip.driverId
        ? {
            role: "outgoing_driver",
            targetId: trip.driverId,
            message: `Override operativo: servicio ${trip.code} reasignado — ${dto.reason}`,
          }
        : null,
      dto.notifyDrivers !== false && updated.driverId
        ? {
            role: "incoming_driver",
            targetId: updated.driverId,
            message: `Override: asume servicio ${trip.code}`,
          }
        : null,
      dto.notifyCustomers !== false && trip.customerId
        ? {
            role: "customer",
            targetId: trip.customerId,
            message: `Unidad de relevo asignada a su servicio ${trip.code}`,
          }
        : null,
    ].filter(Boolean);

    await this.kafka.emit("ops.director.override", {
      organizationId,
      tripId: trip.id,
      code: trip.code,
      fromVehicleId: trip.vehicleId,
      toVehicleId: newVehicleId,
      fromDriverId: trip.driverId,
      toDriverId: dto.newDriverId || updated.driverId,
      reason: dto.reason,
      actorUserId,
      notify,
    });

    if (updated.driverId && trip.driverId !== updated.driverId) {
      await this.kafka.emitTripReassigned({
        organizationId,
        tripId: trip.id,
        code: trip.code,
        fromDriverId: trip.driverId,
        toDriverId: updated.driverId,
        notify: [
          {
            role: "outgoing",
            driverId: trip.driverId,
            message: `Override: ya no eres titular de ${trip.code}`,
          },
          {
            role: "incoming",
            driverId: updated.driverId,
            message: `Override: titular de ${trip.code}`,
          },
        ],
      });
    }

    this.gateway.emitUpdate(organizationId);

    return {
      trip: updated,
      contingencyPool: nearby.slice(0, 8).map((v) => ({
        id: v.id,
        plate: v.plate,
        status: v.status,
        distanceKm: v.distanceKm,
        capacity: v.capacity,
      })),
      radiusKm,
      notify,
      override: true,
    };
  }

  /**
   * Capacidad real: flota − taller − descansos RRHH + sugerencias de pico.
   */
  async capacityPlanning(
    organizationId: string,
    query: CapacityPlanningQuery,
  ) {
    const from = query.from || new Date();
    const to =
      query.to || new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
    const peak = query.demandPeakFactor ?? 1.2;

    const [vehicles, fleetStops, drivers, novelties, trips] = await Promise.all([
      this.prisma.vehicle.findMany({ where: { organizationId } }),
      this.prisma.fleetStop.findMany({
        where: {
          organizationId,
          status: { in: [FleetStopStatus.APPROVED, FleetStopStatus.ACTIVE] },
          windowStart: { lte: to },
          windowEnd: { gte: from },
        },
      }),
      this.prisma.driver.findMany({
        where: { organizationId, active: true },
      }),
      this.prisma.driverNovelty.findMany({
        where: {
          organizationId,
          kind: {
            in: ["VACATION_PAID", "INCAPACITY", "REST", "UNJUSTIFIED_ABSENCE"],
          },
          dateFrom: { lte: to },
          dateTo: { gte: from },
        },
      }),
      this.prisma.trip.findMany({
        where: {
          organizationId,
          departAt: { gte: from, lte: to },
          status: {
            notIn: [TripStatus.CANCELLED, TripStatus.COMPLETED],
          },
        },
        include: {
          vehicle: { select: { plate: true, capacity: true } },
          route: { select: { code: true, name: true } },
        },
      }),
    ]);

    const stoppedVehicleIds = new Set(fleetStops.map((s) => s.vehicleId));
    const availableVehicles = vehicles.filter(
      (v) =>
        !stoppedVehicleIds.has(v.id) &&
        v.status !== VehicleStatus.MAINTENANCE &&
        v.status !== VehicleStatus.OUT_OF_SERVICE &&
        !v.complianceBlocked,
    );

    const restingDriverIds = new Set(
      (novelties as Array<{ driverId: string }>).map((n) => n.driverId),
    );
    const availableDrivers = drivers.filter(
      (d) =>
        !d.dispatchBlocked &&
        !restingDriverIds.has(d.id) &&
        d.fatigueScore < 80,
    );

    const seatsAvailable = availableVehicles.reduce(
      (s, v) => s + (v.capacity || 0),
      0,
    );
    const seatsDemanded = trips.reduce(
      (s, t) => s + (t.vehicle?.capacity || 20),
      0,
    );
    const peakDemand = Math.ceil(seatsDemanded * peak);
    const shortfall = Math.max(0, peakDemand - seatsAvailable);

    const routeProfit = new Map<
      string,
      { route: string; revenue: number; trips: number; km: number }
    >();
    for (const t of trips) {
      const key = t.route?.code || t.code;
      const cur = routeProfit.get(key) || {
        route: t.route?.name || key,
        revenue: 0,
        trips: 0,
        km: 0,
      };
      cur.revenue += Number(t.fareAmount || 0);
      cur.trips += 1;
      cur.km += t.distanceKm || 0;
      routeProfit.set(key, cur);
    }

    const suggestions: string[] = [];
    if (shortfall > 0) {
      suggestions.push(
        `Pico demanda: faltan ~${shortfall} asientos — reasignar rutas de baja ocupación antes de alquilar flota externa`,
      );
    } else {
      suggestions.push(
        "Capacidad nominal cubre pico — optimizar solapes de Gantt sin flota externa",
      );
    }
    if (fleetStops.length > 0) {
      suggestions.push(
        `${fleetStops.length} parada(s) de flota aprobadas descontadas del pool`,
      );
    }
    if (restingDriverIds.size > 0) {
      suggestions.push(
        `${restingDriverIds.size} conductor(es) en descanso/novedad RRHH`,
      );
    }

    return {
      period: { from, to },
      fleet: {
        total: vehicles.length,
        available: availableVehicles.length,
        inFleetStop: stoppedVehicleIds.size,
        seatsAvailable,
      },
      drivers: {
        total: drivers.length,
        available: availableDrivers.length,
        resting: restingDriverIds.size,
      },
      demand: {
        scheduledTrips: trips.length,
        seatsDemanded,
        peakFactor: peak,
        peakDemand,
        shortfall,
      },
      routeRentabilidad: [...routeProfit.values()]
        .map((r) => ({
          ...r,
          revenuePerKm:
            r.km > 0 ? Number((r.revenue / r.km).toFixed(2)) : null,
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 12),
      suggestions,
      ganttBlocks: fleetStops.map((s) => ({
        id: s.id,
        vehicleId: s.vehicleId,
        windowStart: s.windowStart,
        windowEnd: s.windowEnd,
        status: s.status,
      })),
    };
  }

  /**
   * Aprueba parada de flota (taller/patio) y bloquea Gantt en la ventana.
   */
  async aprobarParadaFlota(
    organizationId: string,
    actorUserId: string,
    dto: AprobarParadaFlotaDto,
  ) {
    let stop = dto.fleetStopId
      ? await this.prisma.fleetStop.findFirst({
          where: { id: dto.fleetStopId, organizationId },
          include: { vehicle: true },
        })
      : null;

    if (!stop) {
      if (!dto.vehicleId) {
        throw new BadRequestException(
          "Indique fleetStopId o vehicleId para crear la parada",
        );
      }
      const vehicle = await this.prisma.vehicle.findFirst({
        where: { id: dto.vehicleId, organizationId },
      });
      if (!vehicle) throw new NotFoundException("Vehículo no encontrado");

      let windowStart = dto.windowStart || new Date();
      let windowEnd =
        dto.windowEnd ||
        new Date(windowStart.getTime() + 4 * 60 * 60 * 1000);

      if (dto.preferLowDemandWindow !== false) {
        const low = await this.findLowDemandWindow(
          organizationId,
          windowStart,
          4,
        );
        if (low) {
          windowStart = low.start;
          windowEnd = low.end;
        }
      }

      const count = await this.prisma.fleetStop.count({
        where: { organizationId },
      });
      stop = await this.prisma.fleetStop.create({
        data: {
          organizationId,
          code: `FS-${String(count + 1).padStart(4, "0")}`,
          kind: (dto.kind || "PREVENTIVE_MAINTENANCE") as FleetStopKind,
          status: FleetStopStatus.PENDING,
          reason: dto.reason || "Solicitud mantenimiento Taller",
          windowStart,
          windowEnd,
          vehicleId: dto.vehicleId,
          workOrderId: dto.workOrderId,
          requestedById: actorUserId,
          blocksGantt: true,
        },
        include: { vehicle: true },
      });
    }

    if (dto.approve === false) {
      const rejected = await this.prisma.fleetStop.update({
        where: { id: stop.id },
        data: {
          status: FleetStopStatus.REJECTED,
          approvedById: actorUserId,
          approvedAt: new Date(),
        },
        include: { vehicle: true },
      });
      return { fleetStop: rejected, approved: false };
    }

    const approved = await this.prisma.fleetStop.update({
      where: { id: stop.id },
      data: {
        status: FleetStopStatus.APPROVED,
        approvedById: actorUserId,
        approvedAt: new Date(),
        blocksGantt: true,
      },
      include: { vehicle: true },
    });

    await this.prisma.vehicle.update({
      where: { id: approved.vehicleId },
      data: {
        status: VehicleStatus.MAINTENANCE,
        complianceReason: `FLEET_STOP:${approved.code}`,
      },
    });

    // Cancelar / marcar conflictos en Gantt (trips solapados)
    const conflicts = await this.prisma.trip.findMany({
      where: {
        organizationId,
        vehicleId: approved.vehicleId,
        status: {
          notIn: [TripStatus.CANCELLED, TripStatus.COMPLETED],
        },
        departAt: { lt: approved.windowEnd },
        OR: [
          { arriveAt: { gt: approved.windowStart } },
          { arriveAt: null },
        ],
      },
    });

    await this.kafka.emit("ops.fleet.stop.approved", {
      organizationId,
      fleetStopId: approved.id,
      code: approved.code,
      vehicleId: approved.vehicleId,
      plate: approved.vehicle.plate,
      windowStart: approved.windowStart.toISOString(),
      windowEnd: approved.windowEnd.toISOString(),
      conflictTripIds: conflicts.map((t) => t.id),
    });

    this.gateway.emitUpdate(organizationId);

    return {
      fleetStop: approved,
      approved: true,
      vehicleStatus: VehicleStatus.MAINTENANCE,
      ganttConflicts: conflicts.map((t) => ({
        id: t.id,
        code: t.code,
        departAt: t.departAt,
      })),
      message: `Parada ${approved.code} aprobada — Gantt bloqueado · ${conflicts.length} conflicto(s)`,
    };
  }

  /** Ventana de menor demanda (próximas 48h, bloque de `hours`). */
  private async findLowDemandWindow(
    organizationId: string,
    from: Date,
    hours: number,
  ) {
    const horizon = new Date(from.getTime() + 48 * 60 * 60 * 1000);
    const trips = await this.prisma.trip.findMany({
      where: {
        organizationId,
        departAt: { gte: from, lte: horizon },
        status: { not: TripStatus.CANCELLED },
      },
      select: { departAt: true },
    });

    let bestStart = from;
    let bestCount = Number.POSITIVE_INFINITY;
    for (let h = 0; h < 48 - hours; h += 2) {
      const start = new Date(from.getTime() + h * 60 * 60 * 1000);
      const end = new Date(start.getTime() + hours * 60 * 60 * 1000);
      const count = trips.filter(
        (t) => t.departAt >= start && t.departAt < end,
      ).length;
      if (count < bestCount) {
        bestCount = count;
        bestStart = start;
      }
    }
    return {
      start: bestStart,
      end: new Date(bestStart.getTime() + hours * 60 * 60 * 1000),
      demandCount: bestCount,
    };
  }

  async tacticalDashboard(organizationId: string) {
    const now = new Date();
    const dayEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const [trips, stops, incidents, vehicles, preopsPending] =
      await Promise.all([
        this.prisma.trip.findMany({
          where: {
            organizationId,
            departAt: { gte: new Date(now.getTime() - 4 * 60 * 60 * 1000), lte: dayEnd },
          },
          include: {
            vehicle: { select: { id: true, plate: true, status: true } },
            driver: { select: { id: true, name: true } },
          },
          orderBy: { departAt: "asc" },
          take: 80,
        }),
        this.prisma.fleetStop.findMany({
          where: {
            organizationId,
            status: {
              in: [
                FleetStopStatus.PENDING,
                FleetStopStatus.APPROVED,
                FleetStopStatus.ACTIVE,
              ],
            },
          },
          include: { vehicle: { select: { plate: true } } },
          orderBy: { windowStart: "asc" },
          take: 30,
        }),
        this.prisma.tripFieldIncident.findMany({
          where: { organizationId },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            category: true,
            notes: true,
            createdAt: true,
          },
        }),
        this.prisma.vehicle.findMany({ where: { organizationId } }),
        this.prisma.preoperational.count({
          where: { approved: false, driver: { organizationId } },
        }),
      ]);

    const gantt = trips.map((t) => {
      const stopBlock = isGanttBlockedByFleetStop(
        t.vehicleId || "",
        t.departAt,
        t.arriveAt,
        stops.map((s) => ({
          vehicleId: s.vehicleId,
          status: s.status,
          blocksGantt: s.blocksGantt,
          windowStart: s.windowStart,
          windowEnd: s.windowEnd,
        })),
      );
      return {
        id: t.id,
        code: t.code,
        vehicleId: t.vehicleId,
        plate: t.vehicle?.plate,
        driverName: t.driver?.name,
        departAt: t.departAt,
        arriveAt: t.arriveAt,
        status: t.status,
        ganttBlocked: stopBlock.blocked,
        blockReason: stopBlock.reason,
      };
    });

    const available = vehicles.filter(
      (v) =>
        v.status === VehicleStatus.AVAILABLE ||
        v.status === VehicleStatus.IN_SERVICE,
    ).length;
    const onTime = trips.filter((t) =>
      ["ASSIGNED", "IN_TRANSIT", "COMPLETED"].includes(t.status),
    ).length;
    const punctualityPct =
      trips.length > 0 ? Math.round((onTime / trips.length) * 100) : 100;
    const availabilityPct =
      vehicles.length > 0
        ? Math.round((available / vehicles.length) * 100)
        : 100;

    const novedades = [
      ...stops
        .filter((s) => s.status === FleetStopStatus.PENDING)
        .map((s) => ({
          id: s.id,
          kind: "FLEET_STOP_PENDING",
          title: `Parada pendiente ${s.code} · ${s.vehicle.plate}`,
          severity: "WATCH",
          at: s.createdAt,
        })),
      ...(incidents as Array<{
        id: string;
        category: string;
        notes: string | null;
        createdAt: Date;
      }>).map((i) => ({
        id: i.id,
        kind: i.category || "FIELD_INCIDENT",
        title: i.notes || `Incidente ${i.category}`,
        severity: "ALERT",
        at: i.createdAt,
      })),
      ...(preopsPending > 0
        ? [
            {
              id: "preop-pending",
              kind: "CHECKIN",
              title: `${preopsPending} preoperacional(es) sin check-in`,
              severity: "WATCH",
              at: now,
            },
          ]
        : []),
    ].slice(0, 25);

    return {
      gantt,
      fleetStops: stops,
      novedades,
      sla: {
        punctualityPct,
        availabilityPct,
        tripsToday: trips.length,
        fleetStopsActive: stops.filter((s) =>
          ["APPROVED", "ACTIVE"].includes(s.status),
        ).length,
      },
    };
  }

  /** Expuesto para tests / assign gate */
  assertGanttAssignable(
    vehicleId: string,
    departAt: Date,
    arriveAt: Date | null | undefined,
    stops: Parameters<typeof isGanttBlockedByFleetStop>[3],
  ) {
    return isGanttBlockedByFleetStop(vehicleId, departAt, arriveAt, stops);
  }
}
