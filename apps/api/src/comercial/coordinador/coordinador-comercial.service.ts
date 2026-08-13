import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  BiddingProjectStatus,
  BiddingTaskDept,
  BiddingTaskStatus,
  LeadSlaStatus,
  QuoteStatus,
  RoleCode,
  SalesPipelineStage,
} from "@fsg/db";
import { HARD_RULES } from "@fsg/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { KafkaEventsService } from "../../logistics/kafka-events.service";
import {
  coordinatorCanApproveDiscount,
  estimateEbitdaImpactPct,
  evaluateLeadSla,
  pickRoundRobinAgent,
  type AprobarDescuentoDto,
  type CrearLicitacionDto,
  type DistribuirRoundRobinDto,
  type RoundRobinAgent,
} from "./dto/coordinador-comercial.dto";

const DEFAULT_BIDDING_TASKS: Array<{
  department: BiddingTaskDept;
  title: string;
  daysBeforeClose: number;
}> = [
  {
    department: BiddingTaskDept.JURIDICO,
    title: "Revisión pliego y garantías",
    daysBeforeClose: 10,
  },
  {
    department: BiddingTaskDept.ARCHIVO,
    title: "Expediente documental completo",
    daysBeforeClose: 7,
  },
  {
    department: BiddingTaskDept.FINANZAS,
    title: "Propuesta económica y flujo de caja",
    daysBeforeClose: 5,
  },
  {
    department: BiddingTaskDept.COMERCIAL,
    title: "Carta de intención y oferta técnica",
    daysBeforeClose: 3,
  },
];

/**
 * Módulo 15 — Coordinación Comercial / Licitaciones (Sergio).
 */
@Injectable()
export class CoordinadorComercialService {
  private readonly logger = new Logger(CoordinadorComercialService.name);

  constructor(
    private prisma: PrismaService,
    private kafka: KafkaEventsService,
  ) {}

  async dashboard(organizationId: string) {
    const gestores = await this.prisma.user.findMany({
      where: {
        organizationId,
        role: {
          in: [RoleCode.GESTOR_COMERCIAL, RoleCode.COORDINADOR_COMERCIAL],
        },
        active: true,
      },
      select: { id: true, name: true, email: true, role: true },
    });

    const deals = await this.prisma.commercialDeal.findMany({
      where: { organizationId },
      include: {
        quotes: {
          where: { discountEscalationPending: true },
          take: 5,
        },
      },
    });

    const leaderboard = gestores.map((g) => {
      const owned = deals.filter((d) => d.ownerUserId === g.id);
      const won = owned.filter(
        (d) => d.stage === SalesPipelineStage.CERRADO_GANADO,
      );
      const pipelineValue = owned.reduce(
        (acc, d) => acc + Number(d.estimatedMonthlyValue),
        0,
      );
      const wonValue = won.reduce(
        (acc, d) => acc + Number(d.estimatedMonthlyValue),
        0,
      );
      const conversion =
        owned.length > 0 ? Number(((won.length / owned.length) * 100).toFixed(1)) : 0;
      return {
        userId: g.id,
        name: g.name,
        email: g.email,
        openDeals: owned.filter(
          (d) =>
            d.stage !== SalesPipelineStage.CERRADO_GANADO &&
            d.stage !== SalesPipelineStage.CERRADO_PERDIDO,
        ).length,
        wonDeals: won.length,
        pipelineValue,
        wonValue,
        conversionRate: conversion,
      };
    });
    leaderboard.sort((a, b) => b.wonValue - a.wonValue);

    const funnel = {
      NUEVO_LEAD: deals.filter((d) => d.stage === "NUEVO_LEAD").length,
      REUNION_AGENDADA: deals.filter((d) => d.stage === "REUNION_AGENDADA")
        .length,
      COTIZACION_ENVIADA: deals.filter(
        (d) => d.stage === "COTIZACION_ENVIADA",
      ).length,
      EN_NEGOCIACION: deals.filter((d) => d.stage === "EN_NEGOCIACION").length,
      CERRADO_GANADO: deals.filter((d) => d.stage === "CERRADO_GANADO").length,
    };

    const weightedForecast =
      deals
        .filter(
          (d) =>
            d.stage !== SalesPipelineStage.CERRADO_PERDIDO &&
            d.stage !== SalesPipelineStage.CERRADO_GANADO,
        )
        .reduce((acc, d) => {
          const w =
            d.stage === "EN_NEGOCIACION"
              ? 0.65
              : d.stage === "COTIZACION_ENVIADA"
                ? 0.4
                : d.stage === "REUNION_AGENDADA"
                  ? 0.25
                  : 0.1;
          return acc + Number(d.estimatedMonthlyValue) * w;
        }, 0) +
      deals
        .filter((d) => d.stage === "CERRADO_GANADO")
        .reduce((acc, d) => acc + Number(d.estimatedMonthlyValue), 0);

    const pendingDiscounts = await this.prisma.commercialIntelligentQuote.findMany({
      where: {
        organizationId,
        discountEscalationPending: true,
        coordinatorApproved: false,
        escalatedToCfo: false,
      },
      include: {
        deal: { select: { id: true, code: true, accountName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const bidding = await this.prisma.biddingProject.findMany({
      where: { organizationId },
      include: { tasks: { orderBy: { dueAt: "asc" } } },
      orderBy: { closeAt: "asc" },
      take: 15,
    });

    const now = new Date();
    const slaAlerts = deals
      .filter(
        (d) =>
          d.stage === SalesPipelineStage.NUEVO_LEAD ||
          d.stage === SalesPipelineStage.REUNION_AGENDADA,
      )
      .map((d) => {
        const eval_ = evaluateLeadSla({
          assignedAt: d.assignedAt,
          firstContactAt: d.firstContactAt,
        });
        return {
          dealId: d.id,
          code: d.code,
          accountName: d.accountName,
          ownerUserId: d.ownerUserId,
          slaStatus: eval_.status,
          hoursElapsed: eval_.hoursElapsed,
          reassign: eval_.reassign,
        };
      })
      .filter((a) => a.slaStatus !== "OK");

    return {
      leaderboard,
      funnel,
      forecast: {
        weightedMonthlyCop: Math.round(weightedForecast),
        openDeals: deals.filter(
          (d) =>
            d.stage !== "CERRADO_GANADO" && d.stage !== "CERRADO_PERDIDO",
        ).length,
      },
      pendingDiscounts: pendingDiscounts.map((q) => ({
        ...q,
        ebitdaImpactPct:
          q.ebitdaImpactPct ??
          estimateEbitdaImpactPct(q.discountPct, q.marginPct || 15),
      })),
      bidding: bidding.map((p) => ({
        ...p,
        daysToClose: Math.ceil(
          (p.closeAt.getTime() - now.getTime()) / 86_400_000,
        ),
        estimatedValue: Number(p.estimatedValue ?? 0),
      })),
      slaAlerts,
      limits: {
        maxDiscountPct: HARD_RULES.COORDINADOR_COMERCIAL_MAX_DISCOUNT_PCT,
        slaHours: HARD_RULES.COMERCIAL_LEAD_SLA_HOURS,
      },
    };
  }

  /**
   * Aprobación Nivel 1 de descuentos. Si excede tope → escala a CFO.
   */
  async aprobarDescuento(
    organizationId: string,
    coordinatorId: string,
    dto: AprobarDescuentoDto,
  ) {
    const quote = await this.prisma.commercialIntelligentQuote.findFirst({
      where: { id: dto.quoteId, organizationId },
      include: { deal: true },
    });
    if (!quote) throw new NotFoundException("Cotización no encontrada");

    const ebitdaImpact = estimateEbitdaImpactPct(
      quote.discountPct,
      quote.marginPct || 15,
    );

    if (!dto.approve) {
      const rejected = await this.prisma.commercialIntelligentQuote.update({
        where: { id: quote.id },
        data: {
          discountEscalationPending: false,
          status: QuoteStatus.REJECTED,
          ebitdaImpactPct: ebitdaImpact,
          calcJson: {
            ...(typeof quote.calcJson === "object" && quote.calcJson
              ? (quote.calcJson as object)
              : {}),
            rejectedBy: coordinatorId,
            notes: dto.notes,
          },
        },
      });
      return {
        status: "DISCOUNT_REJECTED",
        quote: rejected,
        ebitdaImpactPct: ebitdaImpact,
        message: "Descuento rechazado por Coordinación Comercial",
      };
    }

    if (!coordinatorCanApproveDiscount(quote.discountPct)) {
      const escalated = await this.prisma.commercialIntelligentQuote.update({
        where: { id: quote.id },
        data: {
          escalatedToCfo: true,
          requiresCfoApproval: true,
          discountEscalationPending: true,
          ebitdaImpactPct: ebitdaImpact,
          calcJson: {
            ...(typeof quote.calcJson === "object" && quote.calcJson
              ? (quote.calcJson as object)
              : {}),
            escalateTo: "DIRECTOR_FINANCIERO",
            coordinatorNotes: dto.notes,
            maxCoordinatorPct:
              HARD_RULES.COORDINADOR_COMERCIAL_MAX_DISCOUNT_PCT,
          },
        },
      });

      await this.kafka.emit("comercial.coordinador.discount_cfo_escalation", {
        organizationId,
        quoteId: quote.id,
        discountPct: quote.discountPct,
        ebitdaImpact,
      });

      return {
        status: "ESCALATED_TO_CFO",
        quote: escalated,
        ebitdaImpactPct: ebitdaImpact,
        message: `Descuento ${quote.discountPct}% supera tope Nivel 1 (${HARD_RULES.COORDINADOR_COMERCIAL_MAX_DISCOUNT_PCT}%) — escala a CFO`,
      };
    }

    const conditions = dto.requireContractYears
      ? { requireContractYears: dto.requireContractYears, notes: dto.notes }
      : dto.notes
        ? { notes: dto.notes }
        : null;

    const approved = await this.prisma.commercialIntelligentQuote.update({
      where: { id: quote.id },
      data: {
        coordinatorApproved: true,
        coordinatorApprovedAt: new Date(),
        coordinatorApprovedById: coordinatorId,
        discountEscalationPending: false,
        approvalConditions: conditions ?? undefined,
        ebitdaImpactPct: ebitdaImpact,
        status: QuoteStatus.APPROVED,
        pdfRef: quote.pdfRef ?? `quotes/approved/${quote.deal.code}.pdf`,
      },
    });

    await this.kafka.emit("comercial.coordinador.discount_approved", {
      organizationId,
      quoteId: quote.id,
      conditions,
    });

    return {
      status: conditions ? "APPROVED_CONDITIONAL" : "APPROVED",
      quote: approved,
      ebitdaImpactPct: ebitdaImpact,
      conditions,
      message: conditions
        ? `Aprobado condicionado — exigir firma a ${dto.requireContractYears} años · EBITDA ${ebitdaImpact}%`
        : `Descuento aprobado · impacto EBITDA ${ebitdaImpact}%`,
    };
  }

  /**
   * Bidding Tracker B2G — proyecto SECOP con tareas interdepartamentales.
   */
  async crearProyectoLicitacion(
    organizationId: string,
    createdById: string,
    dto: CrearLicitacionDto,
  ) {
    if (dto.closeAt.getTime() <= Date.now()) {
      throw new BadRequestException("closeAt debe ser futuro (deadline inamovible)");
    }

    const count = await this.prisma.biddingProject.count({
      where: { organizationId },
    });
    const code = `BID-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;

    const taskDefs =
      dto.tasks?.map((t) => ({
        department: t.department as BiddingTaskDept,
        title: t.title,
        dueAt: t.dueAt,
        assigneeHint: t.assigneeHint,
        immutableDue: true,
        status: BiddingTaskStatus.PENDING,
      })) ??
      DEFAULT_BIDDING_TASKS.map((t) => {
        const due = new Date(dto.closeAt);
        due.setDate(due.getDate() - t.daysBeforeClose);
        return {
          department: t.department,
          title: t.title,
          dueAt: due < new Date() ? new Date(Date.now() + 86_400_000) : due,
          assigneeHint: t.department,
          immutableDue: true,
          status: BiddingTaskStatus.PENDING,
        };
      });

    for (const t of taskDefs) {
      if (t.dueAt.getTime() > dto.closeAt.getTime()) {
        throw new BadRequestException(
          `Tarea "${t.title}" no puede vencer después del closeAt del proceso`,
        );
      }
    }

    const project = await this.prisma.biddingProject.create({
      data: {
        organizationId,
        code,
        title: dto.title,
        processId: dto.processId,
        entityName: dto.entityName,
        modality: dto.modality,
        category: dto.category,
        estimatedValue: dto.estimatedValue,
        closeAt: dto.closeAt,
        status: BiddingProjectStatus.IN_PROGRESS,
        progressPct: 0,
        secopOpportunityId: dto.secopOpportunityId,
        createdById,
        notes: dto.notes,
        tasks: { create: taskDefs },
      },
      include: { tasks: { orderBy: { dueAt: "asc" } } },
    });

    await this.kafka.emit("comercial.coordinador.bidding_created", {
      organizationId,
      projectId: project.id,
      code,
      closeAt: dto.closeAt,
    });

    const now = new Date();
    return {
      status: "BIDDING_PROJECT_CREATED",
      project: {
        ...project,
        daysToClose: Math.ceil(
          (project.closeAt.getTime() - now.getTime()) / 86_400_000,
        ),
        progressPct: 0,
      },
      message: `Proyecto ${code} creado · ${taskDefs.length} tareas interdepartamentales`,
    };
  }

  /**
   * Round-robin + reasignación SLA 2h sin contacto.
   */
  async distribuirRoundRobin(
    organizationId: string,
    actorId: string,
    dto: DistribuirRoundRobinDto,
  ) {
    const agents = await this.buildAgentPool(organizationId, dto.agentUserIds);
    if (!agents.length) {
      throw new BadRequestException("No hay gestores disponibles para round-robin");
    }

    const reassigned: Array<{
      dealId: string;
      from: string | null;
      to: string;
      reason: string;
    }> = [];
    const assigned: Array<{ dealId: string; to: string }> = [];

    if (dto.reassignSlaBreached) {
      const breached = await this.reassignSlaBreachedLeads(
        organizationId,
        agents,
      );
      reassigned.push(...breached);
    }

    let dealIds = dto.dealIds ?? [];
    if (dto.includeUnassigned) {
      const unassigned = await this.prisma.commercialDeal.findMany({
        where: {
          organizationId,
          ownerUserId: null,
          ...(dto.sector ? { sector: dto.sector } : {}),
          stage: {
            in: [
              SalesPipelineStage.NUEVO_LEAD,
              SalesPipelineStage.REUNION_AGENDADA,
            ],
          },
        },
        take: 50,
      });
      dealIds = [...new Set([...dealIds, ...unassigned.map((d) => d.id)])];
    }

    for (const dealId of dealIds) {
      const deal = await this.prisma.commercialDeal.findFirst({
        where: { id: dealId, organizationId },
      });
      if (!deal || deal.ownerUserId) continue;

      const pick = pickRoundRobinAgent(
        agents.map((a) => ({
          ...a,
          sectorAffinity:
            dto.sector && a.name
              ? a.sectorAffinity
              : deal.sector
                ? a.sectorAffinity
                : 0.5,
        })),
      );
      if (!pick) continue;

      const now = new Date();
      const slaDeadline = new Date(
        now.getTime() + HARD_RULES.COMERCIAL_LEAD_SLA_HOURS * 3_600_000,
      );

      await this.prisma.commercialDeal.update({
        where: { id: deal.id },
        data: {
          ownerUserId: pick.userId,
          assignedAt: now,
          slaDeadlineAt: slaDeadline,
          slaStatus: LeadSlaStatus.OK,
          slaBreached: false,
          sector: dto.sector ?? deal.sector,
        },
      });

      pick.openLoad += 1;
      assigned.push({ dealId: deal.id, to: pick.userId });
    }

    await this.kafka.emit("comercial.coordinador.round_robin", {
      organizationId,
      actorId,
      assigned: assigned.length,
      reassigned: reassigned.length,
    });

    return {
      status: "ROUND_ROBIN_DONE",
      assigned,
      reassigned,
      message: `Asignados ${assigned.length} · Reasignados SLA ${reassigned.length}`,
    };
  }

  /**
   * Reasignación automática cuando vence SLA 2h sin primer contacto.
   * Extraído para unit tests.
   */
  async reassignSlaBreachedLeads(
    organizationId: string,
    agents?: RoundRobinAgent[],
    now: Date = new Date(),
  ) {
    const pool =
      agents ?? (await this.buildAgentPool(organizationId));
    const candidates = await this.prisma.commercialDeal.findMany({
      where: {
        organizationId,
        firstContactAt: null,
        ownerUserId: { not: null },
        stage: {
          in: [
            SalesPipelineStage.NUEVO_LEAD,
            SalesPipelineStage.REUNION_AGENDADA,
          ],
        },
      },
    });

    const results: Array<{
      dealId: string;
      from: string | null;
      to: string;
      reason: string;
    }> = [];

    for (const deal of candidates) {
      const eval_ = evaluateLeadSla(
        {
          assignedAt: deal.assignedAt ?? deal.createdAt,
          firstContactAt: deal.firstContactAt,
        },
        now,
      );
      if (!eval_.reassign) continue;

      const others = pool.filter((a) => a.userId !== deal.ownerUserId);
      const pick = pickRoundRobinAgent(others.length ? others : pool);
      if (!pick || pick.userId === deal.ownerUserId) {
        await this.prisma.commercialDeal.update({
          where: { id: deal.id },
          data: {
            slaStatus: LeadSlaStatus.RED,
            slaBreached: true,
          },
        });
        continue;
      }

      const slaDeadline = new Date(
        now.getTime() + HARD_RULES.COMERCIAL_LEAD_SLA_HOURS * 3_600_000,
      );

      await this.prisma.commercialDeal.update({
        where: { id: deal.id },
        data: {
          reassignedFromUserId: deal.ownerUserId,
          reassignedAt: now,
          ownerUserId: pick.userId,
          assignedAt: now,
          slaDeadlineAt: slaDeadline,
          slaStatus: LeadSlaStatus.REASSIGNED,
          slaBreached: true,
        },
      });

      pick.openLoad += 1;
      results.push({
        dealId: deal.id,
        from: deal.ownerUserId,
        to: pick.userId,
        reason: `SLA_${eval_.slaHours}H_BREACHED`,
      });

      this.logger.log(
        `SLA reassign ${deal.code}: ${deal.ownerUserId} → ${pick.userId}`,
      );
    }

    return results;
  }

  private async buildAgentPool(
    organizationId: string,
    agentUserIds?: string[],
  ): Promise<RoundRobinAgent[]> {
    const users = await this.prisma.user.findMany({
      where: {
        organizationId,
        active: true,
        role: RoleCode.GESTOR_COMERCIAL,
        ...(agentUserIds?.length ? { id: { in: agentUserIds } } : {}),
      },
      select: { id: true, name: true },
    });

    const agents: RoundRobinAgent[] = [];
    for (const u of users) {
      const owned = await this.prisma.commercialDeal.findMany({
        where: { organizationId, ownerUserId: u.id },
        select: { stage: true, sector: true },
      });
      const won = owned.filter(
        (d) => d.stage === SalesPipelineStage.CERRADO_GANADO,
      ).length;
      const open = owned.filter(
        (d) =>
          d.stage !== SalesPipelineStage.CERRADO_GANADO &&
          d.stage !== SalesPipelineStage.CERRADO_PERDIDO,
      ).length;
      agents.push({
        userId: u.id,
        name: u.name,
        openLoad: open,
        conversionRate: owned.length ? won / owned.length : 0.35,
        available: true,
        sectorAffinity: 0.5,
      });
    }
    return agents;
  }
}
