import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { randomBytes } from "crypto";
import {
  CommercialChannel,
  ContractRateType,
  ContractStatus,
  DocuSignEnvelopeStatus,
  QuoteStatus,
  SalesPipelineStage,
} from "@fsg/db";
import {
  COMERCIAL_ZONE_SALARY_PER_KM,
  HARD_RULES,
  QUOTE_VEHICLE_COSTS,
  resolveQuoteVehicleType,
  type QuoteVehicleType,
} from "@fsg/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { KafkaEventsService } from "../../logistics/kafka-events.service";
import type {
  CotizarDto,
  CreateDealDto,
  FirmarDocusignDto,
} from "./dto/director-comercial.dto";

const PIPELINE_STAGES: SalesPipelineStage[] = [
  SalesPipelineStage.NUEVO_LEAD,
  SalesPipelineStage.REUNION_AGENDADA,
  SalesPipelineStage.COTIZACION_ENVIADA,
  SalesPipelineStage.EN_NEGOCIACION,
  SalesPipelineStage.CERRADO_GANADO,
];

/**
 * Módulo 14 — Dirección Comercial / Cotizador Inteligente (Felipe).
 */
@Injectable()
export class DirectorComercialService {
  private readonly logger = new Logger(DirectorComercialService.name);

  constructor(
    private prisma: PrismaService,
    private kafka: KafkaEventsService,
  ) {}

  async dashboard(organizationId: string) {
    const deals = await this.prisma.commercialDeal.findMany({
      where: { organizationId },
      include: {
        customer: { select: { id: true, name: true, nit: true } },
        contract: {
          select: {
            id: true,
            code: true,
            endsAt: true,
            monthlyValue: true,
            status: true,
          },
        },
        costCenter: { select: { id: true, code: true, plate: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    const kanban = Object.fromEntries(
      PIPELINE_STAGES.map((s) => [s, [] as typeof deals]),
    ) as Record<SalesPipelineStage, typeof deals>;

    for (const d of deals) {
      if (kanban[d.stage]) kanban[d.stage].push(d);
    }

    const wonMonthly = deals
      .filter((d) => d.stage === SalesPipelineStage.CERRADO_GANADO)
      .reduce((acc, d) => acc + Number(d.estimatedMonthlyValue), 0);

    const quota = HARD_RULES.COMERCIAL_MONTHLY_QUOTA_COP;
    const quotaPct = Math.min(100, Math.round((wonMonthly / quota) * 100));

    const radar = await this.renovacionesRadar(organizationId);

    const keyAccounts = deals
      .filter(
        (d) =>
          d.stage === SalesPipelineStage.EN_NEGOCIACION ||
          d.stage === SalesPipelineStage.CERRADO_GANADO,
      )
      .slice(0, 8)
      .map((d) => ({
        id: d.id,
        code: d.code,
        accountName: d.accountName,
        stage: d.stage,
        estimatedMonthlyValue: Number(d.estimatedMonthlyValue),
        npsScore: d.npsScore,
        portfolioCompliancePct: d.portfolioCompliancePct,
        endsAt: d.contract?.endsAt ?? null,
      }));

    return {
      kanban,
      metrics: {
        quotaCop: quota,
        wonMonthlyCop: wonMonthly,
        quotaPct,
        openDeals: deals.filter(
          (d) =>
            d.stage !== SalesPipelineStage.CERRADO_GANADO &&
            d.stage !== SalesPipelineStage.CERRADO_PERDIDO,
        ).length,
        wonDeals: deals.filter(
          (d) => d.stage === SalesPipelineStage.CERRADO_GANADO,
        ).length,
        minMarginPct: HARD_RULES.COMERCIAL_MIN_MARGIN_PCT,
      },
      keyAccounts,
      renewals: radar.items,
    };
  }

  async createDeal(
    organizationId: string,
    ownerUserId: string,
    dto: CreateDealDto,
  ) {
    const count = await this.prisma.commercialDeal.count({
      where: { organizationId },
    });
    const code = `B2B-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;

    return this.prisma.commercialDeal.create({
      data: {
        organizationId,
        code,
        accountName: dto.accountName,
        customerId: dto.customerId,
        stage: dto.stage as SalesPipelineStage,
        estimatedMonthlyValue: dto.estimatedMonthlyValue,
        zone: dto.zone.toUpperCase(),
        vehicleType: dto.vehicleType,
        distanceKm: dto.distanceKm,
        ownerUserId,
      },
    });
  }

  /**
   * Costo real $/km: combustible + llantas + salario zona + taller.
   * Guardrail: margen < 12% exige autorización CFO.
   */
  async cotizar(organizationId: string, userId: string, dto: CotizarDto) {
    let deal = dto.dealId
      ? await this.prisma.commercialDeal.findFirst({
          where: { id: dto.dealId, organizationId },
        })
      : null;

    if (!deal) {
      if (!dto.accountName) {
        throw new BadRequestException(
          "Se requiere dealId o accountName para cotizar",
        );
      }
      deal = await this.createDeal(organizationId, userId, {
        accountName: dto.accountName,
        customerId: dto.customerId,
        stage: "COTIZACION_ENVIADA",
        estimatedMonthlyValue: dto.estimatedMonthlyValue ?? 0,
        zone: dto.zone,
        vehicleType: dto.vehicleType,
        distanceKm: dto.distanceKm,
      });
    }

    const costs = await this.resolveRealCostPerKm(
      organizationId,
      dto.zone.toUpperCase(),
      dto.vehicleType,
    );

    const costPerKmReal =
      costs.fuelCostPerKm +
      costs.tireCostPerKm +
      costs.salaryCostPerKm +
      costs.workshopCostPerKm;

    const targetMargin =
      dto.targetMarginPct ?? HARD_RULES.COMERCIAL_MIN_MARGIN_PCT + 8;

    let proposed =
      dto.proposedRatePerKm ??
      costPerKmReal / (1 - Math.min(0.79, targetMargin / 100));

    if (dto.discountPct > 0) {
      proposed = proposed * (1 - dto.discountPct / 100);
    }

    const marginPct =
      proposed > 0
        ? Number((((proposed - costPerKmReal) / proposed) * 100).toFixed(2))
        : 0;

    const minMargin = HARD_RULES.COMERCIAL_MIN_MARGIN_PCT;
    const requiresCfoApproval = marginPct < minMargin;
    const cfoApproved = Boolean(dto.cfoApproved);

    if (requiresCfoApproval && !cfoApproved) {
      const quote = await this.prisma.commercialIntelligentQuote.create({
        data: {
          organizationId,
          dealId: deal.id,
          costPerKmReal,
          proposedRatePerKm: proposed,
          marginPct,
          discountPct: dto.discountPct,
          fuelCostPerKm: costs.fuelCostPerKm,
          tireCostPerKm: costs.tireCostPerKm,
          salaryCostPerKm: costs.salaryCostPerKm,
          workshopCostPerKm: costs.workshopCostPerKm,
          requiresCfoApproval: true,
          cfoApproved: false,
          status: QuoteStatus.DRAFT,
          calcJson: {
            zone: dto.zone,
            vehicleType: dto.vehicleType,
            distanceKm: dto.distanceKm,
            sources: costs.sources,
            blockedReason: "MARGIN_BELOW_GUARDRAIL",
            escalateTo: "DIRECTOR_FINANCIERO",
          },
        },
      });

      await this.prisma.commercialDeal.update({
        where: { id: deal.id },
        data: {
          stage: SalesPipelineStage.EN_NEGOCIACION,
          zone: dto.zone.toUpperCase(),
          vehicleType: dto.vehicleType,
          distanceKm: dto.distanceKm,
        },
      });

      await this.kafka.emit("comercial.quote.cfo_escalation", {
        organizationId,
        dealId: deal.id,
        quoteId: quote.id,
        marginPct,
        minMargin,
      });

      return {
        status: "PENDING_CFO_APPROVAL",
        message: `Margen ${marginPct}% bajo el piso ${minMargin}% — escala a Dirección Financiera`,
        quote,
        dealId: deal.id,
        costBreakdown: costs,
        pdfGenerated: false,
      };
    }

    const pdfRef = `quotes/${deal.code}-${Date.now()}.pdf`;
    const quote = await this.prisma.commercialIntelligentQuote.create({
      data: {
        organizationId,
        dealId: deal.id,
        costPerKmReal,
        proposedRatePerKm: proposed,
        marginPct,
        discountPct: dto.discountPct,
        fuelCostPerKm: costs.fuelCostPerKm,
        tireCostPerKm: costs.tireCostPerKm,
        salaryCostPerKm: costs.salaryCostPerKm,
        workshopCostPerKm: costs.workshopCostPerKm,
        requiresCfoApproval,
        cfoApproved: requiresCfoApproval ? true : false,
        cfoApprovedAt: requiresCfoApproval ? new Date() : null,
        pdfRef,
        status: QuoteStatus.SENT,
        calcJson: {
          zone: dto.zone,
          vehicleType: dto.vehicleType,
          distanceKm: dto.distanceKm,
          sources: costs.sources,
          corporatePdf: true,
        },
      },
    });

    await this.prisma.commercialDeal.update({
      where: { id: deal.id },
      data: {
        stage: SalesPipelineStage.COTIZACION_ENVIADA,
        zone: dto.zone.toUpperCase(),
        vehicleType: dto.vehicleType,
        distanceKm: dto.distanceKm,
        estimatedMonthlyValue:
          dto.estimatedMonthlyValue ??
          (Number(deal.estimatedMonthlyValue) ||
            proposed * (dto.distanceKm || 45) * 22),
      },
    });

    return {
      status: "QUOTE_READY",
      message: "Propuesta PDF corporativo generada",
      quote,
      dealId: deal.id,
      costBreakdown: costs,
      pdfGenerated: true,
      pdfRef,
    };
  }

  /**
   * Firma DocuSign → Cerrado/Ganado → Centro de Costos + Capacity + facturación recurrente.
   */
  async firmarDocusign(
    organizationId: string,
    userId: string,
    dto: FirmarDocusignDto,
  ) {
    const deal = await this.prisma.commercialDeal.findFirst({
      where: { id: dto.dealId, organizationId },
      include: { customer: true, contract: true, costCenter: true },
    });
    if (!deal) throw new NotFoundException("Oportunidad B2B no encontrada");

    if (deal.stage === SalesPipelineStage.CERRADO_GANADO && deal.costCenterId) {
      return {
        status: "ALREADY_WON",
        deal,
        costCenterId: deal.costCenterId,
        message: "Negocio ya cerrado — Centro de Costos existente",
      };
    }

    let customerId = deal.customerId;
    if (!customerId) {
      const nit = `900${String(Date.now()).slice(-6)}-1`;
      const customer = await this.prisma.customer.create({
        data: {
          organizationId,
          name: deal.accountName,
          nit,
          segment: "B2B",
        },
      });
      customerId = customer.id;
      await this.prisma.commercialDeal.update({
        where: { id: deal.id },
        data: { customerId },
      });
    }

    const monthlyValue =
      dto.monthlyValue ?? (Number(deal.estimatedMonthlyValue) || 0);
    if (monthlyValue <= 0) {
      throw new BadRequestException(
        "monthlyValue / estimatedMonthlyValue requerido para contrato",
      );
    }

    const startsAt = dto.startsAt ?? new Date();
    const endsAt =
      dto.endsAt ??
      new Date(startsAt.getTime() + 365 * 24 * 60 * 60 * 1000);

    let contract = deal.contract;
    if (!contract) {
      const ctrCount = await this.prisma.transportContract.count({
        where: { organizationId },
      });
      contract = await this.prisma.transportContract.create({
        data: {
          organizationId,
          customerId,
          code: `CTR-${new Date().getFullYear()}-${String(ctrCount + 1).padStart(4, "0")}`,
          name: dto.contractName ?? `Contrato ${deal.accountName}`,
          channel: CommercialChannel.PRIVATE,
          routeLabel: dto.routeLabel ?? deal.zone ?? "Ruta B2B",
          monthlyValue,
          rateType: ContractRateType.FIXED,
          fixedFare: monthlyValue,
          startsAt,
          endsAt,
          status: ContractStatus.DRAFT,
          vehicleQuota: dto.vehiclesRequired,
          npsScore: deal.npsScore,
          portfolioCompliancePct: deal.portfolioCompliancePct,
        },
      });
      await this.prisma.commercialDeal.update({
        where: { id: deal.id },
        data: { contractId: contract.id },
      });
    }

    const externalEnvelopeId = `ENV-${randomBytes(8).toString("hex").toUpperCase()}`;
    let envelope = await this.prisma.docuSignEnvelope.create({
      data: {
        organizationId,
        dealId: deal.id,
        contractId: contract.id,
        provider: dto.provider,
        externalEnvelopeId,
        status: DocuSignEnvelopeStatus.SENT,
        signerEmail: dto.signerEmail,
        meta: {
          signerName: dto.signerName,
          createdBy: userId,
        },
      },
    });

    if (!dto.completeSign) {
      return {
        status: "ENVELOPE_SENT",
        envelope,
        contract,
        message: "Sobre DocuSign enviado — pendiente de firma",
      };
    }

    const won = await this.markDealWon({
      organizationId,
      dealId: deal.id,
      contractId: contract.id,
      envelopeId: envelope.id,
      provider: dto.provider,
      vehiclesRequired: dto.vehiclesRequired,
      routeLabel: dto.routeLabel ?? contract.routeLabel,
      monthlyValue,
      customerId,
    });

    return {
      status: "CLOSED_WON",
      message:
        "Firma completada — Centro de Costos, Capacity Planning y facturación recurrente activados",
      envelope: won.envelope ?? envelope,
      contract: won.contract,
      costCenter: won.costCenter,
      capacityRequest: won.capacityRequest,
      recurringBilling: won.recurringBilling,
      deal: won.deal,
    };
  }

  /**
   * Pase de balón: Cerrado/Ganado → Contabilidad + Torre + Tesorería.
   * Extraído para unit tests.
   */
  async markDealWon(input: {
    organizationId: string;
    dealId: string;
    contractId: string;
    envelopeId?: string;
    provider?: string;
    vehiclesRequired: number;
    routeLabel: string;
    monthlyValue: number;
    customerId: string;
  }) {
    const deal = await this.prisma.commercialDeal.findFirst({
      where: { id: input.dealId, organizationId: input.organizationId },
    });
    if (!deal) throw new NotFoundException("Deal no encontrado");

    if (deal.costCenterId) {
      throw new UnprocessableEntityException(
        "Centro de Costos ya existe para este negocio ganado",
      );
    }

    const plate = `B2B-${deal.code}`.slice(0, 20);
    const ccCode = `CC-${deal.code}`;

    const costCenter = await this.prisma.costCenter.create({
      data: {
        organizationId: input.organizationId,
        code: ccCode,
        plate,
        name: `CC · ${deal.accountName}`,
        active: true,
      },
    });

    const signedAt = new Date();
    const contract = await this.prisma.transportContract.update({
      where: { id: input.contractId },
      data: {
        status: ContractStatus.ACTIVE,
        signatureProvider: input.provider ?? "DOCUSIGN_MOCK",
        signedAt,
        costCenterId: costCenter.id,
      },
    });

    let envelope: {
      id: string;
      status: DocuSignEnvelopeStatus;
      signedAt: Date | null;
    } | null = null;
    if (input.envelopeId) {
      envelope = await this.prisma.docuSignEnvelope.update({
        where: { id: input.envelopeId },
        data: {
          status: DocuSignEnvelopeStatus.SIGNED,
          signedAt,
        },
      });
    }

    const capacityRequest = await this.prisma.capacityPlanningRequest.create({
      data: {
        organizationId: input.organizationId,
        dealId: input.dealId,
        contractId: input.contractId,
        vehiclesRequired: input.vehiclesRequired,
        routeLabel: input.routeLabel,
        status: "PENDING",
        notes: `Pase de balón · ${deal.code} → Capacity Planning`,
      },
    });

    const nextInvoice = new Date(signedAt);
    nextInvoice.setMonth(nextInvoice.getMonth() + 1);
    nextInvoice.setDate(1);

    const recurringBilling = await this.prisma.recurringBillingSchedule.create({
      data: {
        organizationId: input.organizationId,
        dealId: input.dealId,
        contractId: input.contractId,
        customerId: input.customerId,
        amountMonthly: input.monthlyValue,
        dayOfMonth: 1,
        nextInvoiceAt: nextInvoice,
        active: true,
      },
    });

    const updatedDeal = await this.prisma.commercialDeal.update({
      where: { id: input.dealId },
      data: {
        stage: SalesPipelineStage.CERRADO_GANADO,
        costCenterId: costCenter.id,
        contractId: input.contractId,
        customerId: input.customerId,
        wonAt: signedAt,
        estimatedMonthlyValue: input.monthlyValue,
      },
      include: {
        costCenter: true,
        contract: true,
      },
    });

    await this.kafka.emit("comercial.deal.won", {
      organizationId: input.organizationId,
      dealId: input.dealId,
      contractId: input.contractId,
      costCenterId: costCenter.id,
      capacityRequestId: capacityRequest.id,
      recurringBillingId: recurringBilling.id,
    });

    this.logger.log(
      `Won ${deal.code} → CostCenter ${costCenter.code} · Capacity ${capacityRequest.id}`,
    );

    return {
      deal: updatedDeal,
      contract,
      costCenter,
      capacityRequest,
      recurringBilling,
      envelope,
    };
  }

  async renovacionesRadar(organizationId: string) {
    const horizonDays = HARD_RULES.COMERCIAL_RENEWAL_RADAR_DAYS;
    const now = new Date();
    const until = new Date(now.getTime() + horizonDays * 24 * 60 * 60 * 1000);

    const contracts = await this.prisma.transportContract.findMany({
      where: {
        organizationId,
        status: ContractStatus.ACTIVE,
        endsAt: { gte: now, lte: until },
      },
      include: {
        customer: { select: { id: true, name: true, nit: true } },
        commercialDeal: true,
      },
      orderBy: { endsAt: "asc" },
    });

    const items = contracts.map((c) => {
      const daysLeft = c.endsAt
        ? Math.ceil(
            (c.endsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
          )
        : null;
      const nps = c.npsScore ?? c.commercialDeal?.npsScore ?? 72;
      const portfolio =
        c.portfolioCompliancePct ??
        c.commercialDeal?.portfolioCompliancePct ??
        88;
      const suggestedUpliftPct =
        nps >= 70 && portfolio >= 85 ? 6 : nps >= 50 ? 3 : 0;

      return {
        contractId: c.id,
        code: c.code,
        name: c.name,
        accountName: c.customer.name,
        endsAt: c.endsAt,
        daysLeft,
        monthlyValue: Number(c.monthlyValue),
        npsScore: nps,
        portfolioCompliancePct: portfolio,
        suggestedUpliftPct,
        task:
          daysLeft != null && daysLeft <= horizonDays
            ? `Negociar incremento ${suggestedUpliftPct}% · vence en ${daysLeft}d`
            : null,
      };
    });

    return {
      horizonDays,
      count: items.length,
      items,
    };
  }

  /**
   * Historial Taller + combustible + salario zona → costo real $/km.
   */
  async resolveRealCostPerKm(
    organizationId: string,
    zone: string,
    vehicleType: QuoteVehicleType,
  ) {
    const vehicleBase = QUOTE_VEHICLE_COSTS[resolveQuoteVehicleType(vehicleType)];

    const fuelAgg = await this.prisma.routeExpense.aggregate({
      where: {
        organizationId,
        kind: { in: ["COMBUSTIBLE", "TANQUEO"] },
      },
      _avg: { amount: true },
      _count: true,
    });

    const fuelPerEvent = Number(fuelAgg._avg.amount ?? 0);
    const fuelCostPerKm =
      fuelAgg._count > 0 && fuelPerEvent > 0
        ? Number((fuelPerEvent / HARD_RULES.DEFAULT_TRIP_DISTANCE_KM).toFixed(2))
        : Number((vehicleBase.costPerKm * 0.45).toFixed(2));

    const woCount = await this.prisma.workOrder.count({
      where: { organizationId },
    });

    const parts = await this.prisma.workOrderPart.findMany({
      where: { workOrder: { organizationId } },
      include: { inventoryItem: { select: { unitCost: true } } },
      take: 200,
    });

    const partsTotal = parts.reduce(
      (acc, p) => acc + Number(p.inventoryItem.unitCost) * p.quantity,
      0,
    );
    const workshopCostPerKm =
      woCount > 0 && partsTotal > 0
        ? Number(
            (
              partsTotal /
              (woCount * (HARD_RULES.MAINTENANCE_INTERVAL_KM || 10000))
            ).toFixed(4),
          )
        : Number((vehicleBase.costPerKm * 0.18).toFixed(2));

    const tireCostPerKm = Number((vehicleBase.costPerKm * 0.12).toFixed(2));

    const salaryCostPerKm =
      COMERCIAL_ZONE_SALARY_PER_KM[zone] ??
      COMERCIAL_ZONE_SALARY_PER_KM.DEFAULT;

    return {
      fuelCostPerKm,
      tireCostPerKm,
      salaryCostPerKm,
      workshopCostPerKm,
      sources: {
        fuel: fuelAgg._count > 0 ? "ROUTE_EXPENSE_HISTORY" : "VEHICLE_BASELINE",
        workshop: woCount > 0 ? "WORK_ORDER_HISTORY" : "VEHICLE_BASELINE",
        salary: `ZONE_${zone}`,
        tires: "FLEET_TIRE_MODEL",
      },
    };
  }
}
