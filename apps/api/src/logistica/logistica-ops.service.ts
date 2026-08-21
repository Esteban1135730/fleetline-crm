import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  forwardRef,
} from "@nestjs/common";
import {
  DriverNoveltyKind,
  TripAuditAction,
  TripStatus,
  VehicleStatus,
} from "@fsg/db";
import { HARD_RULES } from "@fsg/shared";
import { PrismaService } from "../prisma/prisma.service";
import {
  calculateServiceOvertime,
  DEFAULT_OVERTIME_FACTORS,
} from "./overtime/overtime-engine";
import {
  fetchDrivingRoute,
  resolveServiceEndpoints,
  reverseGeocodeColombia,
  searchPlacesColombia,
  straightRouteFallback,
} from "./routing/osrm.route";
import type {
  CreateServicioDto,
  DriverNoveltyDto,
  LinkDriverVehicleDto,
  ReassignServicioDto,
} from "./dto/logistica.dto";
import { KafkaEventsService } from "../logistics/kafka-events.service";
import { LogisticsGateway } from "../logistics/logistics.gateway";
import { LogisticsService } from "../logistics/logistics.service";
import { ComplianceGateService } from "../logistics/compliance-gate.service";
import { CommercialContractService } from "../comercial/commercial-contract.service";

const ACTIVE_STATUSES: TripStatus[] = [
  TripStatus.PENDING,
  TripStatus.ASSIGNED,
  TripStatus.AWAITING_PREOP,
  TripStatus.AWAITING_FUEC,
  TripStatus.IN_TRANSIT,
];

@Injectable()
export class LogisticaOpsService {
  constructor(
    private prisma: PrismaService,
    private kafka: KafkaEventsService,
    private gateway: LogisticsGateway,
    private logistics: LogisticsService,
    private gate: ComplianceGateService,
    @Inject(forwardRef(() => CommercialContractService))
    private commercialContracts: CommercialContractService,
  ) {}

  serverClock() {
    const now = new Date();
    return {
      iso: now.toISOString(),
      epochMs: now.getTime(),
      timezone: "America/Bogota",
    };
  }

  searchPlaces(query: string) {
    return searchPlacesColombia(query);
  }

  async reversePlace(lat: number, lng: number) {
    const hit = await reverseGeocodeColombia(lat, lng);
    return (
      hit ?? {
        lat,
        lng,
        label: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      }
    );
  }

  async previewRuta(input: {
    originLat: number;
    originLng: number;
    destLat: number;
    destLng: number;
  }) {
    const origin = { lat: input.originLat, lng: input.originLng };
    const dest = { lat: input.destLat, lng: input.destLng };
    const route = await fetchDrivingRoute(origin, dest);
    return {
      origin,
      dest,
      points: route.points.length
        ? route.points
        : straightRouteFallback(origin, dest),
      distanceM: route.distanceM,
      durationS: route.durationS,
      distanceKm: Math.round((route.distanceM / 1000) * 100) / 100,
      durationMin: Math.round(route.durationS / 60),
    };
  }

  async ensureLaborConfig(organizationId: string) {
    return this.prisma.payrollLaborConfig.upsert({
      where: { organizationId },
      create: {
        organizationId,
        baseSalary: DEFAULT_OVERTIME_FACTORS.baseSalary,
      },
      update: {},
    });
  }

  async createServicio(
    organizationId: string,
    dto: CreateServicioDto,
    actorUserId?: string,
  ) {
    if (dto.arriveAt && dto.arriveAt < dto.departAt) {
      throw new BadRequestException("arriveAt anterior a departAt");
    }

    let customerId = dto.customerId;
    let fareAmount = dto.fareAmount;
    let driverId = dto.driverId;
    let vehicleId = dto.vehicleId;
    const dispatchNotes: string[] = [];

    if (dto.contractId) {
      const contract =
        await this.commercialContracts.assertAssignableForDispatch(
          organizationId,
          dto.contractId,
          {
            departAt: dto.departAt,
            estimatedFare: fareAmount,
          },
        );
      if (!customerId) customerId = contract.customerId;
      if (fareAmount == null && contract.monthlyValue != null) {
        fareAmount = Number(contract.monthlyValue);
      }
    }

    // Soft-assign: el servicio siempre se crea; bloqueos solo omiten asignación
    if (driverId) {
      const d = await this.prisma.driver.findFirst({
        where: { id: driverId, organizationId },
      });
      if (!d) throw new NotFoundException("Conductor no encontrado");
      if (d.dispatchBlocked) {
        dispatchNotes.push(
          `Conductor no asignado — bloqueado: ${d.blockReason || "DISPATCH_BLOCKED"}`,
        );
        driverId = undefined;
      } else if (d.fatigueScore >= HARD_RULES.FATIGUE_BLOCK_SCORE) {
        dispatchNotes.push(
          `Conductor no asignado — fatiga ${d.fatigueScore}/${HARD_RULES.FATIGUE_BLOCK_SCORE}`,
        );
        driverId = undefined;
      }
    }

    if (vehicleId) {
      const v = await this.prisma.vehicle.findFirst({
        where: { id: vehicleId, organizationId },
      });
      if (!v) throw new NotFoundException("Vehículo no encontrado");
      if (
        v.status === VehicleStatus.MAINTENANCE ||
        v.status === VehicleStatus.OUT_OF_SERVICE
      ) {
        dispatchNotes.push(
          `Vehículo ${v.plate} no asignado — estado ${v.status}`,
        );
        vehicleId = undefined;
      } else if (v.complianceBlocked) {
        dispatchNotes.push(
          `Vehículo ${v.plate} no asignado — ${v.complianceReason || "COMPLIANCE_BLOCKED"}`,
        );
        vehicleId = undefined;
      }
    }

    if (vehicleId && driverId) {
      try {
        await this.assertDriverVehicleAuthorized(
          organizationId,
          driverId,
          vehicleId,
        );
      } catch {
        dispatchNotes.push(
          "Asignación omitida — pareja no autorizada en matriz conductor/vehículo",
        );
        driverId = undefined;
        vehicleId = undefined;
      }
    }

    if (vehicleId && driverId) {
      const gate = await this.gate.evaluate({
        organizationId,
        vehicleId,
        driverId,
        departAt: dto.departAt,
        requireFuec: false,
      });
      if (!gate.ok) {
        const detail = gate.violations
          .map((v) => v.message)
          .filter(Boolean)
          .join(" · ");
        dispatchNotes.push(
          `Asignación omitida por normativa: ${detail || "docs incompletos"}`,
        );
        driverId = undefined;
        vehicleId = undefined;
      }
    } else if (!(driverId && vehicleId)) {
      if (driverId && !vehicleId) {
        dispatchNotes.push(
          "Conductor pendiente: falta vehículo apto (servicio creado sin asignar)",
        );
      }
      if (vehicleId && !driverId) {
        dispatchNotes.push(
          "Vehículo pendiente: falta conductor apto (servicio creado sin asignar)",
        );
      }
      driverId = undefined;
      vehicleId = undefined;
    }

    const { origin, dest } = await resolveServiceEndpoints({
      origin: dto.origin,
      destination: dto.destination,
      originLat: dto.originLat,
      originLng: dto.originLng,
      destLat: dto.destLat,
      destLng: dto.destLng,
    });
    const route = await fetchDrivingRoute(origin, dest);
    const poly = route.points.length
      ? route.points
      : straightRouteFallback(origin, dest);

    const count = await this.prisma.trip.count({ where: { organizationId } });
    const assigned = Boolean(driverId && vehicleId);

    const trip = await this.prisma.trip.create({
      data: {
        code: `SRV-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`,
        origin: dto.origin,
        destination: dto.destination,
        departAt: dto.departAt,
        arriveAt: dto.arriveAt ?? null,
        officerName: dto.officerName ?? null,
        officerDocument: dto.officerDocument ?? null,
        originLat: origin.lat,
        originLng: origin.lng,
        destLat: dest.lat,
        destLng: dest.lng,
        suggestedPolyline: JSON.stringify(poly),
        customerId,
        contractId: dto.contractId,
        vehicleId,
        driverId,
        fareAmount: fareAmount ?? 0,
        status: assigned ? TripStatus.ASSIGNED : TripStatus.PENDING,
        organizationId,
      },
      include: {
        driver: true,
        vehicle: true,
        customer: true,
      },
    });

    await this.appendAudit(organizationId, trip.id, TripAuditAction.CREATED, {
      message: `Servicio ${trip.code} creado`,
      actorUserId,
      meta: {
        status: trip.status,
        routePoints: poly.length,
        distanceM: route.distanceM,
        durationS: route.durationS,
        routing: route.distanceM > 0 ? "OSRM" : "FALLBACK",
        dispatchNotes,
      },
    });
    if (assigned) {
      await this.appendAudit(
        organizationId,
        trip.id,
        TripAuditAction.ASSIGNED,
        {
          message: "Asignado conductor/vehículo",
          actorUserId,
          meta: { driverId, vehicleId },
        },
      );
      if (trip.vehicleId && trip.driverId) {
        await this.kafka.emitTripDispatched({
          tripId: trip.id,
          organizationId,
          vehicleId: trip.vehicleId,
          driverId: trip.driverId,
          code: trip.code,
          departAt: trip.departAt.toISOString(),
        });
      }
    } else if (dispatchNotes.length) {
      await this.appendAudit(organizationId, trip.id, TripAuditAction.CREATED, {
        message: dispatchNotes.join(" · "),
        actorUserId,
        meta: { softAssign: true, dispatchNotes },
      });
    }
    this.gateway.emitUpdate(organizationId);

    return {
      ...trip,
      dispatchNotes,
      assigned,
      message: assigned
        ? `Servicio ${trip.code} creado y asignado`
        : `Servicio ${trip.code} creado sin asignación${
            dispatchNotes.length ? " — " + dispatchNotes.join(" · ") : ""
          }`,
    };
  }

  async listServicios(organizationId: string) {
    return this.prisma.trip.findMany({
      where: { organizationId },
      include: {
        driver: {
          select: {
            id: true,
            name: true,
            document: true,
            fatigueScore: true,
            dispatchBlocked: true,
          },
        },
        vehicle: { select: { id: true, plate: true, lat: true, lng: true } },
        customer: { select: { id: true, name: true } },
        auditLogs: { orderBy: { createdAt: "desc" }, take: 5 },
        _count: { select: { trackPoints: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async tracking(organizationId: string, tripId: string) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, organizationId },
      include: {
        vehicle: { select: { id: true, plate: true, lat: true, lng: true } },
        driver: { select: { id: true, name: true } },
        trackPoints: { orderBy: { recordedAt: "asc" }, take: 2000 },
        auditLogs: { orderBy: { createdAt: "desc" }, take: 40 },
      },
    });
    if (!trip) throw new NotFoundException("Servicio no encontrado");

    let suggested: Array<{ lat: number; lng: number }> = [];
    try {
      suggested = trip.suggestedPolyline
        ? (JSON.parse(trip.suggestedPolyline) as Array<{
            lat: number;
            lng: number;
          }>)
        : [];
    } catch {
      suggested = [];
    }
    if (
      suggested.length <= 3 &&
      trip.originLat != null &&
      trip.destLat != null
    ) {
      const origin = {
        lat: trip.originLat,
        lng: trip.originLng ?? -74.072,
      };
      const dest = {
        lat: trip.destLat,
        lng: trip.destLng ?? -74.1,
      };
      const route = await fetchDrivingRoute(origin, dest);
      suggested = route.points;
      if (suggested.length >= 2) {
        await this.prisma.trip.update({
          where: { id: trip.id },
          data: { suggestedPolyline: JSON.stringify(suggested) },
        });
      }
    }

    const live =
      trip.status === TripStatus.IN_TRANSIT && trip.vehicle
        ? { lat: trip.vehicle.lat, lng: trip.vehicle.lng }
        : null;

    return {
      trip: {
        id: trip.id,
        code: trip.code,
        status: trip.status,
        origin: trip.origin,
        destination: trip.destination,
        departAt: trip.departAt,
        arriveAt: trip.arriveAt,
        startedAt: trip.startedAt,
        completedAt: trip.completedAt,
        officerName: trip.officerName,
        driver: trip.driver,
        vehicle: trip.vehicle,
      },
      mode:
        trip.status === TripStatus.IN_TRANSIT
          ? "LIVE_GPS"
          : trip.status === TripStatus.COMPLETED
            ? "HISTORY"
            : "SUGGESTED",
      suggestedRoute: suggested,
      live,
      history: trip.trackPoints.map((p) => ({
        lat: p.lat,
        lng: p.lng,
        speedKph: p.speedKph,
        recordedAt: p.recordedAt,
      })),
      audit: trip.auditLogs,
      serverClock: this.serverClock(),
    };
  }

  async appendAudit(
    organizationId: string,
    tripId: string,
    action: TripAuditAction,
    opts: { message: string; actorUserId?: string; meta?: unknown },
  ) {
    return this.prisma.tripAuditLog.create({
      data: {
        organizationId,
        tripId,
        action,
        message: opts.message,
        actorUserId: opts.actorUserId,
        meta: opts.meta as object | undefined,
        serverTime: new Date(),
      },
    });
  }

  async recordGpsForVehicle(
    organizationId: string,
    vehicleId: string,
    lat: number,
    lng: number,
    speedKph?: number,
  ) {
    const active = await this.prisma.trip.findFirst({
      where: {
        organizationId,
        vehicleId,
        status: TripStatus.IN_TRANSIT,
      },
      orderBy: { startedAt: "desc" },
    });
    if (!active) return null;
    const point = await this.prisma.tripTrackPoint.create({
      data: {
        tripId: active.id,
        vehicleId,
        lat,
        lng,
        speedKph,
      },
    });
    return { tripId: active.id, point };
  }

  async markStarted(
    organizationId: string,
    tripId: string,
    actorUserId?: string,
  ) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, organizationId },
    });
    if (!trip) throw new NotFoundException();
    const updated = await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        status: TripStatus.IN_TRANSIT,
        startedAt: new Date(),
      },
    });
    await this.appendAudit(organizationId, tripId, TripAuditAction.STARTED, {
      message: "Servicio iniciado — uplink GPS activo",
      actorUserId,
    });
    this.gateway.emitUpdate(organizationId);
    return updated;
  }

  async markCompleted(
    organizationId: string,
    tripId: string,
    actorUserId?: string,
  ) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, organizationId },
    });
    if (!trip) throw new NotFoundException();
    const completedAt = new Date();
    const startedAt = trip.startedAt ?? trip.departAt;
    const updated = await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        status: TripStatus.COMPLETED,
        completedAt,
      },
    });
    await this.appendAudit(organizationId, tripId, TripAuditAction.COMPLETED, {
      message: "Servicio cerrado — liquidación extras",
      actorUserId,
    });

    if (trip.driverId) {
      const line = await this.persistOvertimeLine(
        organizationId,
        trip.id,
        trip.driverId,
        startedAt,
        completedAt,
      );
      await this.kafka.emitPayrollCalculated({
        organizationId,
        payrollRunId: `pre-${line.id}`,
        amount: Number(line.totalAmount),
        totalOvertime: Number(line.totalAmount),
        totalNight: Number(line.rnAmount) + Number(line.rnfAmount),
        totalCommissions: 0,
        periodStart: startedAt.toISOString(),
        periodEnd: completedAt.toISOString(),
      });
      await this.kafka.emitTripCompleted({
        organizationId,
        amount: Number(trip.fareAmount ?? 0),
        tripId: trip.id,
        code: trip.code,
        contractId: trip.contractId,
      });
    }
    this.gateway.emitUpdate(organizationId);
    return updated;
  }

  async persistOvertimeLine(
    organizationId: string,
    tripId: string,
    driverId: string,
    start: Date,
    end: Date,
  ) {
    const cfg = await this.ensureLaborConfig(organizationId);
    const driver = await this.prisma.driver.findFirst({
      where: { id: driverId, organizationId },
      include: { employee: true },
    });
    const empBase =
      driver?.employee && Number(driver.employee.baseSalary) > 0
        ? Number(driver.employee.baseSalary)
        : Number(cfg.baseSalary);
    const empHourly =
      driver?.employee && Number(driver.employee.hourlyRate) > 0
        ? Number(driver.employee.hourlyRate)
        : undefined;

    const weekStart = startOfWeekMonday(start);
    const prior = await this.prisma.tripOvertimeLine.aggregate({
      where: {
        driverId,
        workDate: { gte: weekStart, lt: start },
      },
      _sum: { ordinaryHours: true },
    });
    const breakdown = calculateServiceOvertime(
      start,
      end,
      {
        baseSalary: empHourly
          ? empHourly * (cfg.monthlyHoursDivisor || 230)
          : empBase,
        monthlyHoursDivisor: cfg.monthlyHoursDivisor,
        weeklyOrdinaryHours: cfg.weeklyOrdinaryHours,
        rnFactor: cfg.rnFactor,
        hedFactor: cfg.hedFactor,
        henFactor: cfg.henFactor,
        rodFestFactor: cfg.rodFestFactor,
        hedfFactor: cfg.hedfFactor,
        henfFactor: cfg.henfFactor,
        rnfFactor: cfg.rnfFactor,
      },
      prior._sum.ordinaryHours ?? 0,
    );

    return this.prisma.tripOvertimeLine.upsert({
      where: { tripId },
      create: {
        tripId,
        driverId,
        workDate: start,
        ordinaryHours: breakdown.ordinaryHours,
        rnHours: breakdown.rnHours,
        hedHours: breakdown.hedHours,
        henHours: breakdown.henHours,
        rodFestHours: breakdown.rodFestHours,
        hedfHours: breakdown.hedfHours,
        henfHours: breakdown.henfHours,
        rnfHours: breakdown.rnfHours,
        hourlyRate: breakdown.hourlyRate,
        rnAmount: breakdown.rnAmount,
        hedAmount: breakdown.hedAmount,
        henAmount: breakdown.henAmount,
        rodFestAmount: breakdown.rodFestAmount,
        hedfAmount: breakdown.hedfAmount,
        henfAmount: breakdown.henfAmount,
        rnfAmount: breakdown.rnfAmount,
        totalAmount: breakdown.totalAmount,
        breakdown: breakdown as object,
      },
      update: {
        ordinaryHours: breakdown.ordinaryHours,
        rnHours: breakdown.rnHours,
        hedHours: breakdown.hedHours,
        henHours: breakdown.henHours,
        rodFestHours: breakdown.rodFestHours,
        hedfHours: breakdown.hedfHours,
        henfHours: breakdown.henfHours,
        rnfHours: breakdown.rnfHours,
        hourlyRate: breakdown.hourlyRate,
        rnAmount: breakdown.rnAmount,
        hedAmount: breakdown.hedAmount,
        henAmount: breakdown.henAmount,
        rodFestAmount: breakdown.rodFestAmount,
        hedfAmount: breakdown.hedfAmount,
        henfAmount: breakdown.henfAmount,
        rnfAmount: breakdown.rnfAmount,
        totalAmount: breakdown.totalAmount,
        breakdown: breakdown as object,
      },
    });
  }

  async liquidacionExtras(
    organizationId: string,
    driverId: string,
    month?: number,
    year?: number,
  ) {
    const now = new Date();
    const y = year ?? now.getFullYear();
    const m = month ?? now.getMonth() + 1;
    const from = new Date(y, m - 1, 1);
    const to = new Date(y, m, 1);

    const driver = await this.prisma.driver.findFirst({
      where: { id: driverId, organizationId },
    });
    if (!driver) throw new NotFoundException("Conductor no encontrado");

    const lines = await this.prisma.tripOvertimeLine.findMany({
      where: {
        driverId,
        workDate: { gte: from, lt: to },
        trip: { organizationId },
      },
      include: {
        trip: {
          select: { id: true, code: true, origin: true, destination: true },
        },
      },
      orderBy: { workDate: "asc" },
    });

    const sum = (key: keyof (typeof lines)[0]) =>
      lines.reduce((s, l) => s + Number(l[key] ?? 0), 0);

    return {
      driver: { id: driver.id, name: driver.name, document: driver.document },
      period: { month: m, year: y },
      daily: lines,
      totals: {
        ordinaryHours: sum("ordinaryHours"),
        rnHours: sum("rnHours"),
        hedHours: sum("hedHours"),
        henHours: sum("henHours"),
        rodFestHours: sum("rodFestHours"),
        hedfHours: sum("hedfHours"),
        henfHours: sum("henfHours"),
        rnfHours: sum("rnfHours"),
        totalAmount: sum("totalAmount"),
      },
      laborConfig: await this.ensureLaborConfig(organizationId),
    };
  }

  async calendarMonth(
    organizationId: string,
    year: number,
    month: number,
  ) {
    await this.logistics.syncDriversFromHr(organizationId);
    const from = new Date(year, month - 1, 1);
    const to = new Date(year, month, 1);
    const drivers = await this.prisma.driver.findMany({
      where: { organizationId, active: true },
      select: {
        id: true,
        name: true,
        document: true,
        fatigueScore: true,
        dispatchBlocked: true,
      },
      orderBy: { name: "asc" },
    });
    const novelties = await this.prisma.driverNovelty.findMany({
      where: {
        organizationId,
        dateFrom: { lt: to },
        dateTo: { gte: from },
      },
    });
    const trips = await this.prisma.trip.findMany({
      where: {
        organizationId,
        departAt: { gte: from, lt: to },
        driverId: { not: null },
      },
      select: {
        id: true,
        driverId: true,
        departAt: true,
        arriveAt: true,
        status: true,
        code: true,
        origin: true,
        destination: true,
        officerName: true,
        vehicle: { select: { plate: true } },
      },
    });

    return { year, month, drivers, novelties, trips };
  }

  async registerNovelty(
    organizationId: string,
    dto: DriverNoveltyDto,
    actorUserId?: string,
  ) {
    if (dto.dateTo < dto.dateFrom) {
      throw new BadRequestException("dateTo anterior a dateFrom");
    }
    const driver = await this.prisma.driver.findFirst({
      where: { id: dto.driverId, organizationId },
    });
    if (!driver) throw new NotFoundException("Conductor no encontrado");

    const novelty = await this.prisma.driverNovelty.create({
      data: {
        organizationId,
        driverId: dto.driverId,
        kind: dto.kind as DriverNoveltyKind,
        dateFrom: dto.dateFrom,
        dateTo: dto.dateTo,
        notes: dto.notes,
        createdById: actorUserId,
      },
    });

    const impacted = await this.prisma.trip.findMany({
      where: {
        organizationId,
        driverId: dto.driverId,
        status: { in: ACTIVE_STATUSES },
        departAt: { lte: dto.dateTo },
        OR: [
          { arriveAt: { gte: dto.dateFrom } },
          { arriveAt: null, departAt: { gte: dto.dateFrom } },
        ],
      },
      include: {
        vehicle: { select: { id: true, plate: true } },
      },
    });

    const substitutes = await this.suggestSubstitutes(
      organizationId,
      dto.dateFrom,
      dto.dateTo,
      dto.driverId,
    );

    for (const t of impacted) {
      await this.appendAudit(organizationId, t.id, TripAuditAction.NOVELTY, {
        message: `Novedad ${dto.kind} en conductor asignado`,
        actorUserId,
        meta: { noveltyId: novelty.id, kind: dto.kind },
      });
    }

    let reassigned: Awaited<
      ReturnType<LogisticaOpsService["reassignServicio"]>
    > | null = null;
    if (dto.reassignTripId && dto.substituteDriverId) {
      reassigned = await this.reassignServicio(
        organizationId,
        {
          tripId: dto.reassignTripId,
          newDriverId: dto.substituteDriverId,
        },
        actorUserId,
      );
    }

    return {
      novelty,
      impactedServices: impacted,
      substitutes,
      reassigned,
      warning:
        substitutes.some((s) => s.fatigueWarning)
          ? "PESV: uno o más sustitutos están cerca del límite de fatiga"
          : null,
    };
  }

  async suggestSubstitutes(
    organizationId: string,
    from: Date,
    to: Date,
    excludeDriverId: string,
  ) {
    const drivers = await this.prisma.driver.findMany({
      where: {
        organizationId,
        active: true,
        id: { not: excludeDriverId },
        dispatchBlocked: false,
      },
    });

    const busy = await this.prisma.trip.findMany({
      where: {
        organizationId,
        status: { in: ACTIVE_STATUSES },
        driverId: { in: drivers.map((d) => d.id) },
        departAt: { lte: to },
        OR: [
          { arriveAt: { gte: from } },
          { arriveAt: null, departAt: { gte: from } },
        ],
      },
      select: { driverId: true },
    });
    const busyIds = new Set(busy.map((b) => b.driverId));

    const blockedByNovelty = await this.prisma.driverNovelty.findMany({
      where: {
        organizationId,
        driverId: { in: drivers.map((d) => d.id) },
        kind: {
          in: [
            DriverNoveltyKind.INCAPACITY,
            DriverNoveltyKind.VACATION_PAID,
            DriverNoveltyKind.REST,
            DriverNoveltyKind.UNJUSTIFIED_ABSENCE,
          ],
        },
        dateFrom: { lte: to },
        dateTo: { gte: from },
      },
      select: { driverId: true },
    });
    const noveltyIds = new Set(blockedByNovelty.map((n) => n.driverId));

    return drivers
      .filter((d) => !busyIds.has(d.id) && !noveltyIds.has(d.id))
      .map((d) => {
        const fatigueWarning =
          d.fatigueScore >= HARD_RULES.FATIGUE_BLOCK_SCORE - 20;
        return {
          id: d.id,
          name: d.name,
          document: d.document,
          fatigueScore: d.fatigueScore,
          fatigueWarning,
          pesvMessage: fatigueWarning
            ? "Warning PESV: cerca del límite de horas/fatiga continua"
            : null,
        };
      })
      .sort((a, b) => a.fatigueScore - b.fatigueScore);
  }

  async reassignServicio(
    organizationId: string,
    dto: ReassignServicioDto,
    actorUserId?: string,
  ) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: dto.tripId, organizationId },
      include: { driver: true },
    });
    if (!trip) throw new NotFoundException("Servicio no encontrado");
    const neu = await this.prisma.driver.findFirst({
      where: { id: dto.newDriverId, organizationId, active: true },
    });
    if (!neu) throw new NotFoundException("Sustituto no encontrado");
    if (neu.dispatchBlocked) {
      throw new UnprocessableEntityException({
        error: "COMPLIANCE_GATE_BLOCKED",
        message: `Hard-Stop sustituto: ${neu.blockReason || "BLOCKED"}`,
        blocks: ["DRIVER_DISPATCH_BLOCKED"],
      });
    }
    if (neu.fatigueScore >= HARD_RULES.FATIGUE_BLOCK_SCORE) {
      throw new UnprocessableEntityException({
        error: "COMPLIANCE_GATE_BLOCKED",
        message: `Hard-Stop fatiga PESV: score ${neu.fatigueScore}`,
        blocks: ["DRIVER_FATIGUE"],
      });
    }

    if (trip.vehicleId) {
      await this.assertDriverVehicleAuthorized(
        organizationId,
        neu.id,
        trip.vehicleId,
      );
      const gate = await this.gate.evaluate({
        organizationId,
        vehicleId: trip.vehicleId,
        driverId: neu.id,
        departAt: trip.departAt,
        requireFuec: false,
      });
      if (!gate.ok) {
        throw new UnprocessableEntityException({
          error: "COMPLIANCE_GATE_BLOCKED",
          message: "Hard-Stop: relevo bloqueado por compliance",
          blocks: gate.violations.map((v) => v.code),
          violations: gate.violations,
        });
      }
    }

    const updated = await this.prisma.trip.update({
      where: { id: trip.id },
      data: { driverId: neu.id },
      include: { driver: true, vehicle: true },
    });

    await this.appendAudit(
      organizationId,
      trip.id,
      TripAuditAction.REASSIGNED,
      {
        message: `Relevo: ${trip.driver?.name ?? "—"} → ${neu.name}`,
        actorUserId,
        meta: {
          fromDriverId: trip.driverId,
          toDriverId: neu.id,
        },
      },
    );

    const notify = [
      {
        role: "outgoing" as const,
        driverId: trip.driverId,
        message: `Servicio ${trip.code} reasignado — ya no eres titular`,
      },
      {
        role: "incoming" as const,
        driverId: neu.id,
        message: `Servicio ${trip.code} asignado por relevo`,
      },
    ];

    await this.kafka.emitTripReassigned({
      organizationId,
      tripId: trip.id,
      code: trip.code,
      fromDriverId: trip.driverId,
      toDriverId: neu.id,
      notify,
    });
    this.gateway.emitReassign(organizationId, {
      tripId: trip.id,
      code: trip.code,
      fromDriverId: trip.driverId,
      toDriverId: neu.id,
      notify,
    });
    this.gateway.emitUpdate(organizationId);

    return {
      trip: updated,
      notify,
    };
  }

  /** Pool de despacho: conductores + vehículos con checklist normativo + matriz N:N */
  async listDispatchPool(organizationId: string) {
    const [drivers, vehicles, auths] = await Promise.all([
      this.prisma.driver.findMany({
        where: { organizationId, active: true },
        include: { complianceDocs: true },
        orderBy: { name: "asc" },
      }),
      this.prisma.vehicle.findMany({
        where: { organizationId },
        include: { complianceDocs: true },
        orderBy: { plate: "asc" },
      }),
      this.prisma.driverVehicleAuth.findMany({
        where: { organizationId, active: true },
        select: {
          driverId: true,
          vehicleId: true,
          isPrimary: true,
        },
      }),
    ]);

    const vehicleIdsByDriver = new Map<string, string[]>();
    const driverIdsByVehicle = new Map<string, string[]>();
    const primaryVehicleByDriver = new Map<string, string>();
    for (const a of auths) {
      const vd = vehicleIdsByDriver.get(a.driverId) ?? [];
      vd.push(a.vehicleId);
      vehicleIdsByDriver.set(a.driverId, vd);
      const dv = driverIdsByVehicle.get(a.vehicleId) ?? [];
      dv.push(a.driverId);
      driverIdsByVehicle.set(a.vehicleId, dv);
      if (a.isPrimary) primaryVehicleByDriver.set(a.driverId, a.vehicleId);
    }

    const now = new Date();
    const docOk = (
      docs: Array<{ type: string; status: string; expiresAt: Date | null }>,
      type: string,
    ) => {
      const d = docs
        .filter((x) => x.type === type)
        .sort(
          (a, b) =>
            (b.expiresAt?.getTime() ?? 0) - (a.expiresAt?.getTime() ?? 0),
        )[0];
      if (!d) return { ok: false, label: `${type} faltante` };
      if (
        d.status === "EXPIRED" ||
        d.status === "REJECTED" ||
        (d.expiresAt && d.expiresAt <= now)
      ) {
        return { ok: false, label: `${type} vencido` };
      }
      return { ok: true, label: `${type} OK` };
    };

    return {
      drivers: drivers.map((d) => {
        const licenseFieldOk = Boolean(
          d.licenseNumber?.trim() &&
            d.licenseExpiresAt &&
            d.licenseExpiresAt > now,
        );
        const licDoc = docOk(d.complianceDocs, "LICENCIA_CONDUCCION");
        const licenseOk = licenseFieldOk || licDoc.ok;
        const fatigueOk = d.fatigueScore < HARD_RULES.FATIGUE_BLOCK_SCORE;
        const blockers: string[] = [];
        if (d.dispatchBlocked)
          blockers.push(d.blockReason || "Conductor bloqueado");
        if (!fatigueOk) blockers.push(`Fatiga ${d.fatigueScore}`);
        if (!licenseOk) blockers.push(licDoc.label || "Licencia faltante");
        const authorizedVehicleIds = vehicleIdsByDriver.get(d.id) ?? [];
        return {
          id: d.id,
          name: d.name,
          document: d.document,
          fatigueScore: d.fatigueScore,
          dispatchBlocked: d.dispatchBlocked,
          ready: blockers.length === 0,
          blockers,
          authorizedVehicleIds,
          primaryVehicleId: primaryVehicleByDriver.get(d.id) ?? null,
        };
      }),
      vehicles: vehicles.map((v) => {
        const soat = docOk(v.complianceDocs, "SOAT");
        const tecno = docOk(v.complianceDocs, "TECNOMECANICA");
        const blockers: string[] = [];
        if (v.status === "MAINTENANCE" || v.status === "OUT_OF_SERVICE") {
          blockers.push(`Estado ${v.status}`);
        }
        if (v.complianceBlocked) {
          blockers.push(v.complianceReason || "Compliance bloqueado");
        }
        if (!soat.ok) blockers.push(soat.label);
        if (!tecno.ok) blockers.push(tecno.label);
        const authorizedDriverIds = driverIdsByVehicle.get(v.id) ?? [];
        return {
          id: v.id,
          plate: v.plate,
          status: v.status,
          complianceBlocked: v.complianceBlocked,
          ready: blockers.length === 0,
          blockers,
          authorizedDriverIds,
        };
      }),
      authLinks: auths,
    };
  }

  /**
   * Si el conductor o el vehículo ya tienen roster, la pareja debe estar autorizada.
   * Si ninguno tiene vínculos aún → permite (migración gradual).
   */
  async assertDriverVehicleAuthorized(
    organizationId: string,
    driverId: string,
    vehicleId: string,
  ) {
    const [forDriver, forVehicle, pair] = await Promise.all([
      this.prisma.driverVehicleAuth.count({
        where: { organizationId, driverId, active: true },
      }),
      this.prisma.driverVehicleAuth.count({
        where: { organizationId, vehicleId, active: true },
      }),
      this.prisma.driverVehicleAuth.findFirst({
        where: {
          organizationId,
          driverId,
          vehicleId,
          active: true,
        },
      }),
    ]);

    if (forDriver === 0 && forVehicle === 0) return { ok: true as const };
    if (pair) return { ok: true as const, authId: pair.id };

    throw new UnprocessableEntityException({
      error: "DRIVER_VEHICLE_NOT_AUTHORIZED",
      message:
        "Esta pareja conductor/vehículo no está en la matriz de autorización. Vincúlela en Logística → Unidades autorizadas.",
      driverId,
      vehicleId,
    });
  }

  async listDriverVehicleAuths(
    organizationId: string,
    filter?: { driverId?: string; vehicleId?: string },
  ) {
    return this.prisma.driverVehicleAuth.findMany({
      where: {
        organizationId,
        active: true,
        ...(filter?.driverId ? { driverId: filter.driverId } : {}),
        ...(filter?.vehicleId ? { vehicleId: filter.vehicleId } : {}),
      },
      include: {
        driver: {
          select: {
            id: true,
            name: true,
            document: true,
            active: true,
            fatigueScore: true,
          },
        },
        vehicle: {
          select: {
            id: true,
            plate: true,
            brand: true,
            model: true,
            status: true,
          },
        },
      },
      orderBy: [{ isPrimary: "desc" }, { assignedAt: "desc" }],
    });
  }

  async driverVehicleAuthMatrix(organizationId: string) {
    const [drivers, vehicles, links] = await Promise.all([
      this.prisma.driver.findMany({
        where: { organizationId, active: true },
        select: {
          id: true,
          name: true,
          document: true,
          fatigueScore: true,
          dispatchBlocked: true,
        },
        orderBy: { name: "asc" },
      }),
      this.prisma.vehicle.findMany({
        where: { organizationId },
        select: {
          id: true,
          plate: true,
          brand: true,
          model: true,
          status: true,
          complianceBlocked: true,
        },
        orderBy: { plate: "asc" },
      }),
      this.listDriverVehicleAuths(organizationId),
    ]);

    return {
      drivers,
      vehicles,
      links,
      byDriver: drivers.map((d) => ({
        ...d,
        vehicles: links
          .filter((l) => l.driverId === d.id)
          .map((l) => ({
            linkId: l.id,
            isPrimary: l.isPrimary,
            notes: l.notes,
            vehicle: l.vehicle,
          })),
      })),
      byVehicle: vehicles.map((v) => ({
        ...v,
        drivers: links
          .filter((l) => l.vehicleId === v.id)
          .map((l) => ({
            linkId: l.id,
            isPrimary: l.isPrimary,
            notes: l.notes,
            driver: l.driver,
          })),
      })),
    };
  }

  async linkDriverVehicle(
    organizationId: string,
    dto: LinkDriverVehicleDto,
    actorUserId?: string,
  ) {
    const [driver, vehicle] = await Promise.all([
      this.prisma.driver.findFirst({
        where: { id: dto.driverId, organizationId },
      }),
      this.prisma.vehicle.findFirst({
        where: { id: dto.vehicleId, organizationId },
      }),
    ]);
    if (!driver) throw new NotFoundException("Conductor no encontrado");
    if (!vehicle) throw new NotFoundException("Vehículo no encontrado");

    if (dto.isPrimary) {
      await this.prisma.driverVehicleAuth.updateMany({
        where: { organizationId, driverId: dto.driverId, active: true },
        data: { isPrimary: false },
      });
    }

    const link = await this.prisma.driverVehicleAuth.upsert({
      where: {
        organizationId_driverId_vehicleId: {
          organizationId,
          driverId: dto.driverId,
          vehicleId: dto.vehicleId,
        },
      },
      create: {
        organizationId,
        driverId: dto.driverId,
        vehicleId: dto.vehicleId,
        isPrimary: dto.isPrimary ?? false,
        notes: dto.notes,
        assignedById: actorUserId,
        active: true,
      },
      update: {
        active: true,
        isPrimary: dto.isPrimary ?? false,
        notes: dto.notes,
        assignedById: actorUserId,
        assignedAt: new Date(),
      },
      include: {
        driver: { select: { id: true, name: true } },
        vehicle: { select: { id: true, plate: true } },
      },
    });

    return {
      ...link,
      message: `${link.driver.name} autorizado en ${link.vehicle.plate}`,
    };
  }

  async setPrimaryDriverVehicle(organizationId: string, linkId: string) {
    const link = await this.prisma.driverVehicleAuth.findFirst({
      where: { id: linkId, organizationId, active: true },
    });
    if (!link) throw new NotFoundException("Vínculo no encontrado");

    await this.prisma.driverVehicleAuth.updateMany({
      where: {
        organizationId,
        driverId: link.driverId,
        active: true,
      },
      data: { isPrimary: false },
    });

    return this.prisma.driverVehicleAuth.update({
      where: { id: link.id },
      data: { isPrimary: true },
    });
  }

  async unlinkDriverVehicle(organizationId: string, linkId: string) {
    const link = await this.prisma.driverVehicleAuth.findFirst({
      where: { id: linkId, organizationId },
    });
    if (!link) throw new NotFoundException("Vínculo no encontrado");

    await this.prisma.driverVehicleAuth.update({
      where: { id: link.id },
      data: { active: false, isPrimary: false },
    });

    return { ok: true, id: link.id };
  }

  async assignServicio(
    organizationId: string,
    tripId: string,
    input: { driverId: string; vehicleId: string },
    actorUserId?: string,
  ) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, organizationId },
    });
    if (!trip) throw new NotFoundException("Servicio no encontrado");
    if (
      trip.status === TripStatus.COMPLETED ||
      trip.status === TripStatus.CANCELLED
    ) {
      throw new BadRequestException("No se puede asignar un servicio cerrado");
    }

    await this.assertDriverVehicleAuthorized(
      organizationId,
      input.driverId,
      input.vehicleId,
    );

    const gate = await this.gate.evaluate({
      organizationId,
      vehicleId: input.vehicleId,
      driverId: input.driverId,
      departAt: trip.departAt,
      requireFuec: false,
    });
    if (!gate.ok) {
      const detail = gate.violations.map((v) => v.message).join(" · ");
      throw new UnprocessableEntityException({
        error: "COMPLIANCE_GATE_BLOCKED",
        message: `No se puede asignar: ${detail}`,
        violations: gate.violations,
      });
    }

    const updated = await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        driverId: input.driverId,
        vehicleId: input.vehicleId,
        status: TripStatus.ASSIGNED,
      },
      include: { driver: true, vehicle: true },
    });
    await this.appendAudit(organizationId, tripId, TripAuditAction.ASSIGNED, {
      message: `Asignado ${updated.driver?.name} / ${updated.vehicle?.plate}`,
      actorUserId,
      meta: input,
    });
    this.gateway.emitUpdate(organizationId);
    return updated;
  }

  /** Lista conductores (delegado a LogisticsService). */
  listDrivers(organizationId: string) {
    return this.logistics.listDrivers(organizationId);
  }
}

function startOfWeekMonday(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}
