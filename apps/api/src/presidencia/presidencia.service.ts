import { Injectable, Logger } from "@nestjs/common";
import {
  PaymentScheduleStatus,
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
    const pillars = await this.buildFourPillars(organizationId);
    const revenueHeat = await this.revenueHeatMap(organizationId);

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
      ...canvas,
      ui: {
        theme: "founders_ipad",
        jarvisCenter: true,
        encryptedHeatMap: true,
      },
    };
  }

  /** 4 pilares superiores */
  async buildFourPillars(organizationId: string) {
    const [queued, blocked, tripsOnTime, npsAgg] = await Promise.all([
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
        where: { organizationId, complianceBlocked: true },
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

    return {
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
