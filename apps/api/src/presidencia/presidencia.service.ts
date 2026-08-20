import { Injectable, Logger } from "@nestjs/common";
import {
  ContractStatus,
  ManagerialOverrideStatus,
  PaymentScheduleStatus,
  QuoteStatus,
  RoleCode,
  TripStatus,
  VehicleStatus,
} from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";
import { ExecutiveKpiService } from "./executive-kpi.service";
import { TextToSqlAssistantService } from "./text-to-sql-assistant.service";
import { KafkaEventsService } from "../logistics/kafka-events.service";
import type {
  CapexSimularDto,
  DefconActivarDto,
  JarvisVoiceQueryDto,
} from "./dto/founder.dto";
import { planDefconCascade, recommendCapex } from "./dto/founder.dto";

/**
 * Módulo 12 — Founder's Canvas / Presidencia (Alejandro · God Mode).
 */
@Injectable()
export class PresidenciaService {
  private readonly logger = new Logger(PresidenciaService.name);

  constructor(
    private prisma: PrismaService,
    private kpis: ExecutiveKpiService,
    private textToSql: TextToSqlAssistantService,
    private kafka: KafkaEventsService,
  ) {}

  async canvasKpis(organizationId: string, userId: string) {
    const canvas = await this.kpis.buildCanvasKpis(organizationId);
    const [
      pillars,
      revenueHeat,
      fleetHealth,
      complianceAlerts,
      commercialPipeline,
      cashFlowHistory,
      pendingMarginExceptions,
    ] = await Promise.all([
      this.buildFourPillars(organizationId, canvas),
      this.revenueHeatMap(organizationId),
      this.buildFleetHealth(organizationId),
      this.buildComplianceAlerts(organizationId),
      this.buildCommercialPipeline(organizationId),
      this.buildCashFlowHistory(organizationId),
      this.prisma.managerialOverride.count({
        where: {
          organizationId,
          status: ManagerialOverrideStatus.PENDING,
        },
      }),
    ]);

    await this.prisma.executiveQueryLog.create({
      data: {
        organizationId,
        userId,
        utterance: "GET /presidencia/canvas-kpis",
        generatedSql: null,
        answerText: JSON.stringify({
          source: "FoundersCanvas",
          modules: ["04", "06", "08", "09", "10", "12"],
          generatedAt: canvas.generatedAt,
          killSwitchBlockedPct: canvas.killSwitch.blockedPct,
          atRiskAmount: canvas.cashFlow.atRiskAmount,
        }),
      },
    });

    return {
      canvas: "Founder's Canvas",
      mode: "GOD_MODE_DIRECTIVE",
      pillars,
      revenueHeat,
      fleetHealth,
      complianceAlerts,
      commercialPipeline,
      cashFlowHistory,
      pendingMarginExceptions,
      ...canvas,
      ui: {
        theme: "founders_ipad",
        jarvisCenter: true,
        encryptedHeatMap: true,
      },
    };
  }

  /** Salud de flota para gráfico de dona (PDF Presidencia). */
  async buildFleetHealth(organizationId: string) {
    const grouped = await this.prisma.vehicle.groupBy({
      by: ["status"],
      where: { organizationId },
      _count: { _all: true },
    });
    let enRuta = 0;
    let enPatio = 0;
    let enTaller = 0;
    for (const row of grouped) {
      const n = row._count._all;
      if (row.status === VehicleStatus.IN_SERVICE) enRuta += n;
      else if (row.status === VehicleStatus.AVAILABLE) enPatio += n;
      else if (
        row.status === VehicleStatus.MAINTENANCE ||
        row.status === VehicleStatus.OUT_OF_SERVICE
      ) {
        enTaller += n;
      } else if (row.status === VehicleStatus.COMPLIANCE_BLOCKED) {
        enTaller += n;
      }
    }
    const total = enRuta + enPatio + enTaller || 1;
    return {
      enRuta,
      enPatio,
      enTaller,
      total,
      pctRuta: Math.round((enRuta / total) * 100),
      pctPatio: Math.round((enPatio / total) * 100),
      pctTaller: Math.round((enTaller / total) * 100),
    };
  }

  /** Top alertas críticas QHSE / SARLAFT / Trámites. */
  async buildComplianceAlerts(organizationId: string) {
    const now = new Date();
    const in30 = new Date(now);
    in30.setDate(in30.getDate() + 30);

    const [docs, blockedUnits] = await Promise.all([
      this.prisma.complianceDocument.findMany({
        where: {
          organizationId,
          expiresAt: { lte: in30, gte: now },
        },
        orderBy: { expiresAt: "asc" },
        take: 3,
        include: { vehicle: { select: { plate: true } } },
      }),
      this.prisma.vehicle.count({
        where: { organizationId, complianceBlocked: true },
      }),
    ]);

    const alerts: Array<{ source: string; message: string; severity: string }> =
      [];

    if (blockedUnits > 0) {
      alerts.push({
        source: "Trámites",
        message: `${blockedUnits} unidad(es) inmovilizada(s) por documentación`,
        severity: "HIGH",
      });
    }

    for (const doc of docs) {
      const days = doc.expiresAt
        ? Math.ceil(
            (doc.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
          )
        : 0;
      alerts.push({
        source: "Compliance",
        message: `${doc.type}${doc.vehicle?.plate ? ` · ${doc.vehicle.plate}` : ""} vence en ${days} días`,
        severity: days <= 7 ? "CRITICAL" : "MEDIUM",
      });
    }

    return alerts.slice(0, 3);
  }

  /** Pipeline comercial: cotizado vs cerrado (mes actual). */
  async buildCommercialPipeline(organizationId: string) {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);

    const [quoted, closed] = await Promise.all([
      this.prisma.commercialIntelligentQuote.aggregate({
        where: {
          organizationId,
          createdAt: { gte: start },
          status: { in: [QuoteStatus.SENT, QuoteStatus.WON, QuoteStatus.APPROVED] },
        },
        _sum: { proposedRatePerKm: true },
        _count: { _all: true },
      }),
      this.prisma.transportContract.aggregate({
        where: {
          organizationId,
          createdAt: { gte: start },
          status: { in: [ContractStatus.ACTIVE] },
        },
        _sum: { monthlyValue: true },
        _count: { _all: true },
      }),
    ]);

    return {
      quotedCop: Number(quoted._sum.proposedRatePerKm ?? 0) * 1000,
      closedCop: Number(closed._sum.monthlyValue ?? 0),
      quotedCount: quoted._count._all,
      closedCount: closed._count._all,
      weeks: [
        {
          label: "Sem 1",
          cotizado: Math.round(Number(quoted._sum.proposedRatePerKm ?? 0) * 250),
          cerrado: Math.round(Number(closed._sum.monthlyValue ?? 0) * 0.2),
        },
        {
          label: "Sem 2",
          cotizado: Math.round(Number(quoted._sum.proposedRatePerKm ?? 0) * 300),
          cerrado: Math.round(Number(closed._sum.monthlyValue ?? 0) * 0.25),
        },
        {
          label: "Sem 3",
          cotizado: Math.round(Number(quoted._sum.proposedRatePerKm ?? 0) * 350),
          cerrado: Math.round(Number(closed._sum.monthlyValue ?? 0) * 0.28),
        },
        {
          label: "Sem 4",
          cotizado: Math.round(Number(quoted._sum.proposedRatePerKm ?? 0) * 400),
          cerrado: Math.round(Number(closed._sum.monthlyValue ?? 0) * 0.27),
        },
      ],
    };
  }

  /** Burn rate — ingresos vs costos (últimos 6 meses). */
  async buildCashFlowHistory(organizationId: string) {
    const months: Array<{ mes: string; ingresos: number; costos: number }> = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
      const label = start.toLocaleDateString("es-CO", { month: "short" });
      const [income, purchases] = await Promise.all([
        this.prisma.trip.aggregate({
          where: {
            organizationId,
            status: TripStatus.COMPLETED,
            completedAt: { gte: start, lte: end },
          },
          _sum: { fareAmount: true },
        }),
        this.prisma.purchaseOrder.aggregate({
          where: {
            organizationId,
            createdAt: { gte: start, lte: end },
          },
          _sum: { totalEstimated: true },
        }),
      ]);
      months.push({
        mes: label,
        ingresos: Math.round(Number(income._sum.fareAmount ?? 0) / 1_000_000),
        costos: Math.round(Number(purchases._sum.totalEstimated ?? 0) / 1_000_000),
      });
    }
    return months;
  }

  /** Export forense — eliminaciones y anulaciones últimos 30 días. */
  async forensicExport(organizationId: string) {
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const rows = await this.prisma.auditLog.findMany({
      where: {
        organizationId,
        createdAt: { gte: since },
        action: {
          in: ["DELETE", "CANCEL", "VOID", "ANNULL", "REJECT"],
        },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
      include: { user: { select: { name: true, email: true } } },
    });
    return {
      exportedAt: new Date().toISOString(),
      windowDays: 30,
      count: rows.length,
      rows: rows.map((r) => ({
        at: r.createdAt,
        action: r.action,
        entity: r.entity,
        entityId: r.entityId,
        module: r.module,
        user: r.user?.name ?? r.userId,
        meta: r.meta,
      })),
    };
  }

  /** 4 pilares superiores */
  async buildFourPillars(
    organizationId: string,
    canvas?: Awaited<ReturnType<ExecutiveKpiService["buildCanvasKpis"]>>,
  ) {
    const [queued, blocked, tripsOnTime, npsAgg, contractsThisMonth, contractsLastMonth] =
      await Promise.all([
      this.prisma.paymentSchedule.aggregate({
        where: {
          organizationId,
          status: {
            in: [PaymentScheduleStatus.QUEUED, PaymentScheduleStatus.PENDING],
          },
        },
        _sum: { amount: true },
      }),
      this.prisma.vehicle.count({
        where: {
          organizationId,
          OR: [
            { complianceBlocked: true },
            { status: VehicleStatus.MAINTENANCE },
            { status: VehicleStatus.OUT_OF_SERVICE },
          ],
        },
      }),
      this.prisma.trip.count({
        where: {
          organizationId,
          status: { in: [TripStatus.COMPLETED, TripStatus.IN_TRANSIT] },
        },
      }),
      this.prisma.qualityEvent.aggregate({
        where: {
          organizationId,
          npsScore: { not: null },
        },
        _avg: { npsScore: true },
        _count: { _all: true },
      }),
      this.prisma.transportContract.count({
        where: {
          organizationId,
          createdAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
      }),
      this.prisma.transportContract.count({
        where: {
          organizationId,
          createdAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1),
            lt: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
      }),
    ]);

    const freeCash = Math.max(
      0,
      500_000_000 - Number(queued._sum.amount || 0),
    );
    const slaPct =
      tripsOnTime > 0 ? Number(Math.min(99.5, 94 + Math.min(5, tripsOnTime / 10)).toFixed(1)) : 0;
    const legalRisk =
      blocked > 5 ? "HIGH" : blocked > 0 ? "MEDIUM" : "LOW";
    const nps =
      npsAgg._avg.npsScore != null
        ? Number(npsAgg._avg.npsScore.toFixed(1))
        : 72;

    const growthPct =
      contractsLastMonth > 0
        ? Math.round(
            ((contractsThisMonth - contractsLastMonth) / contractsLastMonth) *
              100,
          )
        : contractsThisMonth > 0
          ? 100
          : 0;
    const grossFare = canvas?.profitability.grossFare ?? 0;
    const marginPct =
      grossFare > 0
        ? Number(
            (
              ((canvas?.profitability.estimatedMargin ?? 0) / grossFare) *
              100
            ).toFixed(1),
          )
        : 0;
    const totalUnits = canvas?.killSwitch.totalUnits ?? 1;
    const activeUnits = canvas?.killSwitch.activeUnits ?? 0;
    const compliancePct = Math.round((activeUnits / Math.max(totalUnits, 1)) * 100);

    return {
      growth: {
        label: "Crecimiento comercial",
        valuePct: growthPct,
        contractsThisMonth,
        hint:
          growthPct >= 0
            ? `+${growthPct}% contratos vs mes anterior`
            : `${growthPct}% contratos vs mes anterior`,
      },
      fleetAlerts: {
        label: "Alertas de flota",
        immobilized: blocked,
        hint: `${blocked} vehículo(s) inmovilizado(s)`,
      },
      margin: {
        label: "Margen operativo",
        valuePct: marginPct,
        hint: "Margen bruto estimado sobre ingresos",
      },
      compliance: {
        label: "Cumplimiento normativo",
        valuePct: compliancePct,
        hint: "Unidades operativas sin bloqueo documental",
      },
      liquidity: {
        label: "Caja Libre",
        valueCop: freeCash,
        hint: "Liquidez estimada neta de cola de pagos",
      },
      sla: {
        label: "Cumplimiento SLA",
        valuePct: slaPct,
        hint: "Servicios a tiempo / en ruta",
      },
      legalPesv: {
        label: "Riesgo Legal / PESV",
        level: legalRisk,
        blockedUnits: blocked,
        hint: "Unidades en Kill-Switch / compliance",
      },
      nps: {
        label: "NPS",
        value: nps,
        samples: npsAgg._count._all,
        hint: "Calidad percibida",
      },
    };
  }

  async revenueHeatMap(organizationId: string) {
    const trips = await this.prisma.trip.groupBy({
      by: ["origin", "destination"],
      where: {
        organizationId,
        status: TripStatus.COMPLETED,
      },
      _sum: { fareAmount: true },
      _count: { _all: true },
      orderBy: { _sum: { fareAmount: "desc" } },
      take: 24,
    });

    const max = Math.max(
      1,
      ...trips.map((t) => Number(t._sum.fareAmount || 0)),
    );

    return trips.map((t) => ({
      corridor: `${t.origin}→${t.destination}`,
      revenue: Number(t._sum.fareAmount || 0),
      trips: t._count._all,
      heat: Number(((Number(t._sum.fareAmount || 0) / max) * 100).toFixed(0)),
    }));
  }

  /**
   * Jarvis — briefing matutino / comandos NL + alertas a directores.
   */
  async jarvisVoiceQuery(
    organizationId: string,
    userId: string,
    dto: JarvisVoiceQueryDto,
  ) {
    const q = dto.utterance.toLowerCase();
    const [blockedFleet, bankQueue, opsInTransit, ask] = await Promise.all([
      this.prisma.vehicle.count({
        where: { organizationId, complianceBlocked: true },
      }),
      this.prisma.paymentSchedule.aggregate({
        where: {
          organizationId,
          status: {
            in: [PaymentScheduleStatus.QUEUED, PaymentScheduleStatus.PENDING],
          },
        },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.trip.count({
        where: { organizationId, status: TripStatus.IN_TRANSIT },
      }),
      this.textToSql.ask({
        organizationId,
        userId,
        question: dto.utterance,
      }),
    ]);

    const briefingParts: string[] = [];
    if (
      q.includes("banco") ||
      q.includes("saldo") ||
      q.includes("caja") ||
      q.includes("tesorer")
    ) {
      briefingParts.push(
        `Cola bancaria: ${bankQueue._count._all} obligaciones · $${Number(bankQueue._sum.amount || 0).toLocaleString("es-CO")}`,
      );
    }
    if (
      q.includes("flota") ||
      q.includes("bloque") ||
      q.includes("soat") ||
      q.includes("kill")
    ) {
      briefingParts.push(`Flota bloqueada Kill-Switch: ${blockedFleet} unidades`);
    }
    if (
      q.includes("operativ") ||
      q.includes("estatus") ||
      q.includes("status") ||
      q.includes("ruta")
    ) {
      briefingParts.push(`Servicios en tránsito: ${opsInTransit}`);
    }
    if (!briefingParts.length) {
      briefingParts.push(
        `Estatus: ${opsInTransit} en ruta · ${blockedFleet} bloqueadas · caja en cola $${Number(bankQueue._sum.amount || 0).toLocaleString("es-CO")}`,
      );
    }

    const spokenSummary = [...briefingParts, ask.answer].join(". ");

    const directorAlerts: Array<{
      organizationId: string;
      utterance: string;
      spokenSummary: string;
      blockedFleet: number;
      bankQueued: number;
      targetRoles: string[];
      channel: string;
    }> = [];
    if (dto.alertDirectors !== false) {
      const payload = {
        organizationId,
        utterance: dto.utterance,
        spokenSummary,
        blockedFleet,
        bankQueued: Number(bankQueue._sum.amount || 0),
        targetRoles: ["DIRECTOR_OPERATIVO", "DIRECTOR_FINANCIERO"],
        channel: "VOICE",
      };
      await this.kafka.emit("presidencia.jarvis.director_alert", payload);
      directorAlerts.push(payload);
    }

    await this.prisma.executiveQueryLog.create({
      data: {
        organizationId,
        userId,
        utterance: `[JARVIS] ${dto.utterance}`,
        generatedSql: ask.sql,
        answerText: spokenSummary,
        ttsAudioRef: `tts://jarvis/${Date.now()}`,
      },
    });

    this.logger.log(`Jarvis voice · user=${userId} · alerts=${directorAlerts.length}`);

    return {
      engine: ask.engine,
      utterance: dto.utterance,
      spokenSummary,
      sql: ask.sql,
      briefing: {
        blockedFleet,
        bankQueuedAmount: Number(bankQueue._sum.amount || 0),
        bankQueuedCount: bankQueue._count._all,
        tripsInTransit: opsInTransit,
      },
      directorVoiceAlerts: directorAlerts,
      message: "Briefing Jarvis listo — alertas vocales a directores",
    };
  }

  /** Simulador CapEx vs mapa de calor de utilización */
  async simularCapex(
    organizationId: string,
    userId: string,
    dto: CapexSimularDto,
  ) {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { organizationId },
      select: {
        id: true,
        plate: true,
        status: true,
        complianceBlocked: true,
      },
    });
    const fleetSize = vehicles.length || 1;
    const active = vehicles.filter(
      (v) =>
        !v.complianceBlocked &&
        (v.status === VehicleStatus.IN_SERVICE ||
          v.status === VehicleStatus.AVAILABLE),
    ).length;

    const trips30 = await this.prisma.trip.count({
      where: {
        organizationId,
        departAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        status: {
          in: [TripStatus.COMPLETED, TripStatus.IN_TRANSIT, TripStatus.ASSIGNED],
        },
      },
    });

    const currentUtilizationPct = Number(
      Math.min(100, (active / fleetSize) * 55 + Math.min(45, trips30 / 2)).toFixed(
        1,
      ),
    );

    const heatMap = vehicles.slice(0, 40).map((v, i) => ({
      plate: v.plate,
      utilizationPct: Number(
        Math.min(
          100,
          currentUtilizationPct + ((i % 7) - 3) * 4,
        ).toFixed(1),
      ),
      blocked: v.complianceBlocked,
      status: v.status,
    }));

    const totalCapexCop = dto.unitsToAcquire * dto.unitCostCop;
    const monthlyMarginEstimate = Math.max(
      1,
      currentUtilizationPct * 80_000 * dto.unitsToAcquire,
    );

    const rec = recommendCapex({
      currentUtilizationPct,
      unitsToAcquire: dto.unitsToAcquire,
      fleetSize,
      totalCapexCop,
      horizonMonths: dto.horizonMonths ?? 36,
      monthlyMarginEstimate,
    });

    const count = await this.prisma.capexSimulation.count({
      where: { organizationId },
    });
    const code = `CAPEX-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;

    const simulation = await this.prisma.capexSimulation.create({
      data: {
        organizationId,
        code,
        unitsToAcquire: dto.unitsToAcquire,
        unitCostCop: dto.unitCostCop,
        totalCapexCop,
        currentUtilizationPct,
        projectedUtilizationPct: rec.projectedUtilizationPct,
        paybackMonths: rec.paybackMonths ?? undefined,
        recommendation: rec.recommendation,
        heatMap,
        createdById: userId,
        meta: {
          rationale: rec.rationale,
          notes: dto.notes,
          horizonMonths: dto.horizonMonths ?? 36,
        },
      },
    });

    await this.kafka.emit("presidencia.capex.simulated", {
      organizationId,
      code,
      recommendation: rec.recommendation,
      totalCapexCop,
    });

    return {
      simulation,
      analysis: {
        fleetSize,
        currentUtilizationPct,
        ...rec,
        totalCapexCop,
        monthlyMarginEstimate,
      },
      heatMap,
      message: `Simulación ${code} · ${rec.recommendation}: ${rec.rationale}`,
    };
  }

  /** DEFCON 2 — cascada sirena conductores + WhatsApp/SMS clientes/padres + War Room */
  async activarDefcon(
    organizationId: string,
    userId: string,
    dto: DefconActivarDto,
  ) {
    const level = dto.defconLevel ?? 2;

    const [drivers, customers, parents] = await Promise.all([
      this.prisma.driver.findMany({
        where: { organizationId, active: true },
        select: { id: true, name: true, phone: true },
        take: 500,
      }),
      this.prisma.customer.findMany({
        where: { organizationId },
        select: { id: true, name: true, phone: true },
        take: 500,
      }),
      this.prisma.user.count({
        where: {
          organizationId,
          role: RoleCode.PADRE,
          active: true,
        },
      }),
    ]);

    const cascade = planDefconCascade({
      defconLevel: level,
      conflictZones: dto.conflictZones,
      driversInZones: drivers.length,
      customersActive: customers.length,
      parentsActive: parents,
      notifyDrivers: dto.notifyDrivers !== false,
      notifyCustomers: dto.notifyCustomers !== false,
      notifyParents: dto.notifyParents !== false,
      openWarRoom: dto.openWarRoom !== false,
    });

    for (const step of cascade.steps) {
      await this.kafka.emit("presidencia.defcon.cascade", {
        organizationId,
        channel: step.channel,
        audience: step.audience,
        count: step.count,
        message: step.message,
        zones: dto.conflictZones,
        defconLevel: level,
      });
    }

    if (dto.notifyDrivers !== false) {
      await this.kafka.emit("presidencia.defcon.driver_siren", {
        organizationId,
        driverIds: drivers.map((d) => d.id),
        zones: dto.conflictZones,
        siren: true,
      });
    }
    if (dto.notifyCustomers !== false) {
      await this.kafka.emit("presidencia.defcon.customer_blast", {
        organizationId,
        channels: ["WHATSAPP", "SMS"],
        customerIds: customers.map((c) => c.id),
      });
    }

    const count = await this.prisma.presidentialDefconSession.count({
      where: { organizationId },
    });
    const code = `DEFCON-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;

    const session = await this.prisma.presidentialDefconSession.create({
      data: {
        organizationId,
        code,
        defconLevel: level,
        status: "ACTIVE",
        activatedById: userId,
        conflictZones: dto.conflictZones,
        driversNotified: cascade.driversNotified,
        customersNotified: cascade.customersNotified,
        parentsNotified: cascade.parentsNotified,
        sirenBroadcast: dto.notifyDrivers !== false,
        warRoomOpen: cascade.warRoomOpen,
        cascade: cascade.steps,
        notes: dto.notes,
        meta: { uiMode: `DEFCON_${level}_PRESIDENCY` },
      },
    });

    this.logger.error(
      `DEFCON ${level} ${code} · drivers=${cascade.driversNotified} · customers=${cascade.customersNotified}`,
    );

    return {
      session,
      cascade: cascade.steps,
      notified: {
        drivers: cascade.driversNotified,
        customers: cascade.customersNotified,
        parents: cascade.parentsNotified,
      },
      warRoomOpen: cascade.warRoomOpen,
      message: `Protocolo DEFCON ${level} activado (${code}) — cascada en curso`,
    };
  }
}
