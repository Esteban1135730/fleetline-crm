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
  suggestedRoutePolyline,
} from "./overtime/overtime-engine";
import type {
  CreateServicioDto,
  DriverNoveltyDto,
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

    // —— Hard-Stop Comercial (M03): vigencia / cupo / presupuesto ——
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

    if (dto.driverId) {
      const d = await this.prisma.driver.findFirst({
        where: { id: dto.driverId, organizationId },
      });
      if (!d) throw new NotFoundException("Conductor no encontrado");
      if (d.dispatchBlocked) {
        throw new UnprocessableEntityException({
          error: "COMPLIANCE_GATE_BLOCKED",
          message: `Hard-Stop RRHH/Fatiga: ${d.blockReason || "DISPATCH_BLOCKED"}`,
          blocks: ["DRIVER_DISPATCH_BLOCKED"],
        });
      }
      if (d.fatigueScore >= HARD_RULES.FATIGUE_BLOCK_SCORE) {
        throw new UnprocessableEntityException({
          error: "COMPLIANCE_GATE_BLOCKED",
          message: `Hard-Stop fatiga: score ${d.fatigueScore}/${HARD_RULES.FATIGUE_BLOCK_SCORE}`,
          blocks: ["DRIVER_FATIGUE"],
        });
      }
    }

    if (dto.vehicleId) {
      const v = await this.prisma.vehicle.findFirst({
        where: { id: dto.vehicleId, organizationId },
      });
      if (!v) throw new NotFoundException("Vehículo no encontrado");
      if (
        v.status === VehicleStatus.MAINTENANCE ||
        v.status === VehicleStatus.OUT_OF_SERVICE
      ) {
        throw new UnprocessableEntityException({
          error: "COMPLIANCE_GATE_BLOCKED",
          message: `Hard-Stop Taller: vehículo ${v.plate} en ${v.status}`,
          blocks:
            v.status === VehicleStatus.MAINTENANCE
              ? ["VEHICLE_MAINTENANCE"]
              : ["VEHICLE_OUT_OF_SERVICE"],
        });
      }
      if (v.complianceBlocked) {
        throw new UnprocessableEntityException({
          error: "COMPLIANCE_GATE_BLOCKED",
          message: `Hard-Stop unidad: ${v.complianceReason || "COMPLIANCE_BLOCKED"}`,
          blocks: ["VEHICLE_COMPLIANCE_BLOCKED"],
        });
      }
    }

    // —— Compliance Gate completo (docs, FUEC opcional en alta, fatiga, noche) ——
    if (dto.vehicleId && dto.driverId) {
      const gate = await this.gate.evaluate({
        organizationId,
        vehicleId: dto.vehicleId,
        driverId: dto.driverId,
        departAt: dto.departAt,
        requireFuec: false,
      });
      if (!gate.ok) {
        throw new UnprocessableEntityException({
          error: "COMPLIANCE_GATE_BLOCKED",
          message:
            "Hard-Stop: el servicio no puede asignarse por incumplimiento normativo",
          blocks: gate.violations.map((v) => v.code),
          violations: gate.violations,
        });
      }
    }

    const originLat = dto.originLat ?? 4.711;
    const originLng = dto.originLng ?? -74.072;
    const destLat = dto.destLat ?? 4.65;
    const destLng = dto.destLng ?? -74.1;
    const poly = suggestedRoutePolyline(
      originLat,
      originLng,
      destLat,
      destLng,
    );

    const count = await this.prisma.trip.count({ where: { organizationId } });
    const assigned = Boolean(dto.driverId && dto.vehicleId);

    const trip = await this.prisma.trip.create({
      data: {
        code: `SRV-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`,
        origin: dto.origin,
        destination: dto.destination,
        departAt: dto.departAt,
        arriveAt: dto.arriveAt ?? null,
        officerName: dto.officerName ?? null,
        officerDocument: dto.officerDocument ?? null,
        originLat,
        originLng,
        destLat,
        destLng,
        suggestedPolyline: JSON.stringify(poly),
        customerId,
        contractId: dto.contractId,
        vehicleId: dto.vehicleId,
        driverId: dto.driverId,
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
      meta: { status: trip.status },
    });
    if (assigned) {
      await this.appendAudit(
        organizationId,
        trip.id,
        TripAuditAction.ASSIGNED,
        {
          message: `Asignado conductor/vehículo`,
          actorUserId,
          meta: { driverId: dto.driverId, vehicleId: dto.vehicleId },
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
      this.gateway.emitUpdate(organizationId);
    }

    return trip;
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
      orderBy: { departAt: "desc" },
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
    if (!suggested.length && trip.originLat != null && trip.destLat != null) {
      suggested = suggestedRoutePolyline(
        trip.originLat,
        trip.originLng ?? -74.072,
        trip.destLat,
        trip.destLng ?? -74.1,
      );
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
        baseSalary: Number(cfg.baseSalary),
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

    let reassigned = null;
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
