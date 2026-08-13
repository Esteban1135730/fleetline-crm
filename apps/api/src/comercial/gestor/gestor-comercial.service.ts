import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes } from "crypto";
import {
  AdvancePaymentMethod,
  AdvancePaymentStatus,
  CommercialTaskKind,
  CommercialTimelineKind,
  QuoteStatus,
  SalesPipelineStage,
  TripStatus,
} from "@fsg/db";
import {
  HARD_RULES,
  QUOTE_VEHICLE_COSTS,
  COMERCIAL_ZONE_SALARY_PER_KM,
} from "@fsg/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { KafkaEventsService } from "../../logistics/kafka-events.service";
import {
  assertAdvancePaymentAllowsDispatch,
  isGestorDiscountAllowed,
  type ConfirmarPagoTesoreriaDto,
  type CotizacionExpressDto,
  type LinkCobroAnticipadoDto,
  type RegistrarLlamadaDto,
} from "./dto/gestor-comercial.dto";

/**
 * Módulo 14.1 — Sales Execution Hub (Valentina / GESTOR_COMERCIAL).
 */
@Injectable()
export class GestorComercialService {
  private readonly logger = new Logger(GestorComercialService.name);

  constructor(
    private prisma: PrismaService,
    private kafka: KafkaEventsService,
  ) {}

  async dashboard(organizationId: string, ownerUserId: string) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const [tasks, deals, timeline, pendingPayments, callQueue] =
      await Promise.all([
        this.prisma.commercialTask.findMany({
          where: {
            organizationId,
            ownerUserId,
            dueAt: { gte: startOfDay, lte: endOfDay },
          },
          orderBy: [{ priority: "desc" }, { dueAt: "asc" }],
          take: 40,
        }),
        this.prisma.commercialDeal.findMany({
          where: { organizationId, ownerUserId },
          include: {
            customer: { select: { id: true, name: true } },
          },
          orderBy: { updatedAt: "desc" },
          take: 50,
        }),
        this.prisma.commercialTimelineEvent.findMany({
          where: { organizationId, ownerUserId },
          orderBy: { createdAt: "desc" },
          take: 30,
        }),
        this.prisma.commercialAdvancePaymentLink.findMany({
          where: {
            organizationId,
            createdById: ownerUserId,
            status: AdvancePaymentStatus.PENDING,
          },
          take: 10,
        }),
        this.prisma.commercialCallLog.findMany({
          where: { organizationId, ownerUserId },
          orderBy: { priorityScore: "desc" },
          take: 8,
        }),
      ]);

    const miniPipeline = {
      NUEVO_LEAD: deals.filter((d) => d.stage === "NUEVO_LEAD"),
      REUNION_AGENDADA: deals.filter((d) => d.stage === "REUNION_AGENDADA"),
      COTIZACION_ENVIADA: deals.filter(
        (d) => d.stage === "COTIZACION_ENVIADA",
      ),
      EN_NEGOCIACION: deals.filter((d) => d.stage === "EN_NEGOCIACION"),
      CERRADO_GANADO: deals.filter((d) => d.stage === "CERRADO_GANADO"),
    };

    return {
      tasks,
      miniPipeline,
      timeline,
      pendingPayments,
      callQueue,
      limits: {
        maxDiscountPct: HARD_RULES.GESTOR_COMERCIAL_MAX_DISCOUNT_PCT,
      },
    };
  }

  /**
   * Cotización express — descuento ≤ 5%; superior escala a Director Comercial.
   */
  async cotizacionExpress(
    organizationId: string,
    ownerUserId: string,
    dto: CotizacionExpressDto,
  ) {
    const maxDisc = HARD_RULES.GESTOR_COMERCIAL_MAX_DISCOUNT_PCT;
    if (!isGestorDiscountAllowed(dto.discountPct)) {
      let deal = dto.dealId
        ? await this.prisma.commercialDeal.findFirst({
            where: { id: dto.dealId, organizationId, ownerUserId },
          })
        : null;

      if (!deal) {
        deal = await this.ensureDeal(organizationId, ownerUserId, dto);
      }

      const quote = await this.prisma.commercialIntelligentQuote.create({
        data: {
          organizationId,
          dealId: deal.id,
          costPerKmReal: 0,
          proposedRatePerKm: dto.proposedRatePerKm ?? 0,
          marginPct: 0,
          discountPct: dto.discountPct,
          fuelCostPerKm: 0,
          tireCostPerKm: 0,
          salaryCostPerKm: 0,
          workshopCostPerKm: 0,
          requiresCfoApproval: false,
          discountEscalationPending: true,
          createdById: ownerUserId,
          status: QuoteStatus.DRAFT,
          calcJson: {
            blockedReason: "GESTOR_DISCOUNT_CAP",
            maxDiscountPct: maxDisc,
            escalateTo: "DIRECTOR_COMERCIAL",
          },
        },
      });

      await this.pushTimeline({
        organizationId,
        ownerUserId,
        customerId: deal.customerId,
        dealId: deal.id,
        kind: CommercialTimelineKind.QUOTE_SENT,
        title: `Descuento ${dto.discountPct}% bloqueado — escala a Dirección`,
        body: `Tope gestor ${maxDisc}% · pendiente autorización`,
      });

      await this.kafka.emit("comercial.gestor.discount_escalation", {
        organizationId,
        dealId: deal.id,
        quoteId: quote.id,
        discountPct: dto.discountPct,
        maxDisc,
      });

      return {
        status: "PENDING_DIRECTOR_APPROVAL",
        message: `Descuento ${dto.discountPct}% supera tope ${maxDisc}% — solicitud de escalamiento enviada`,
        quote,
        dealId: deal.id,
        pdfGenerated: false,
      };
    }

    let deal = dto.dealId
      ? await this.prisma.commercialDeal.findFirst({
          where: { id: dto.dealId, organizationId, ownerUserId },
        })
      : null;
    if (!deal) {
      deal = await this.ensureDeal(organizationId, ownerUserId, dto);
    }

    if (dto.omnichannelThread?.length) {
      for (const msg of dto.omnichannelThread) {
        await this.pushTimeline({
          organizationId,
          ownerUserId,
          customerId: deal.customerId,
          dealId: deal.id,
          kind: CommercialTimelineKind.OMNICHANNEL,
          title: `Omnicanal ${msg.channel}`,
          body: msg.body,
          meta: { at: msg.at ?? new Date() },
        });
      }
    }

    const vehicle = QUOTE_VEHICLE_COSTS[dto.vehicleType];
    const salary =
      COMERCIAL_ZONE_SALARY_PER_KM[dto.zone.toUpperCase()] ??
      COMERCIAL_ZONE_SALARY_PER_KM.DEFAULT;
    const costPerKmReal = Number(
      (vehicle.costPerKm * 0.75 + salary * 0.25).toFixed(2),
    );
    let proposed =
      dto.proposedRatePerKm ??
      costPerKmReal / (1 - HARD_RULES.COMERCIAL_MIN_MARGIN_PCT / 100);
    if (dto.discountPct > 0) {
      proposed = proposed * (1 - dto.discountPct / 100);
    }
    const marginPct = Number(
      (((proposed - costPerKmReal) / proposed) * 100).toFixed(2),
    );

    const pdfRef = `quotes/express/${deal.code}-${Date.now()}.pdf`;
    const sentAt = new Date();
    const quote = await this.prisma.commercialIntelligentQuote.create({
      data: {
        organizationId,
        dealId: deal.id,
        costPerKmReal,
        proposedRatePerKm: proposed,
        marginPct,
        discountPct: dto.discountPct,
        fuelCostPerKm: vehicle.costPerKm * 0.45,
        tireCostPerKm: vehicle.costPerKm * 0.12,
        salaryCostPerKm: salary,
        workshopCostPerKm: vehicle.costPerKm * 0.18,
        createdById: ownerUserId,
        sentAt,
        pdfRef,
        status: QuoteStatus.SENT,
        calcJson: {
          express: true,
          notifyOnPdfOpen: dto.notifyOnPdfOpen,
          zone: dto.zone,
          vehicleType: dto.vehicleType,
        },
      },
    });

    await this.prisma.commercialDeal.update({
      where: { id: deal.id },
      data: { stage: SalesPipelineStage.COTIZACION_ENVIADA },
    });

    await this.pushTimeline({
      organizationId,
      ownerUserId,
      customerId: deal.customerId,
      dealId: deal.id,
      kind: CommercialTimelineKind.QUOTE_SENT,
      title: `Cotización express enviada · ${deal.code}`,
      body: `PDF ${pdfRef} · margen ${marginPct}%`,
      meta: { quoteId: quote.id, pdfRef },
    });

    await this.prisma.commercialTask.create({
      data: {
        organizationId,
        ownerUserId,
        kind: CommercialTaskKind.FOLLOW_UP,
        title: `Seguimiento PDF abierto · ${deal.accountName}`,
        dueAt: new Date(Date.now() + 4 * 3600_000),
        priority: 80,
        customerId: deal.customerId,
        dealId: deal.id,
        meta: { quoteId: quote.id, waitPdfOpen: true },
      },
    });

    // Notificación inmediata (webhook PDF open mock)
    if (dto.notifyOnPdfOpen) {
      await this.markPdfOpened(organizationId, quote.id, ownerUserId);
    }

    await this.kafka.emit("comercial.gestor.quote_express", {
      organizationId,
      dealId: deal.id,
      quoteId: quote.id,
      pdfRef,
    });

    return {
      status: "QUOTE_EXPRESS_SENT",
      message: "Cotización express enviada — alerta al abrir PDF activada",
      quote,
      dealId: deal.id,
      pdfGenerated: true,
      pdfRef,
    };
  }

  async markPdfOpened(
    organizationId: string,
    quoteId: string,
    ownerUserId: string,
  ) {
    const quote = await this.prisma.commercialIntelligentQuote.findFirst({
      where: { id: quoteId, organizationId },
      include: { deal: true },
    });
    if (!quote || quote.openedAt) return null;

    const updated = await this.prisma.commercialIntelligentQuote.update({
      where: { id: quoteId },
      data: { openedAt: new Date() },
    });

    await this.pushTimeline({
      organizationId,
      ownerUserId,
      customerId: quote.deal.customerId,
      dealId: quote.dealId,
      kind: CommercialTimelineKind.QUOTE_OPENED,
      title: `Cliente abrió PDF · ${quote.deal.code}`,
      body: "Notificación en tiempo real — retomar llamada",
      meta: { quoteId },
    });

    await this.kafka.emit("comercial.gestor.pdf_opened", {
      organizationId,
      quoteId,
      dealId: quote.dealId,
      ownerUserId,
    });

    return updated;
  }

  /**
   * Link PSE/Tarjeta — viaje bloqueado en Despacho hasta confirmación Tesorería.
   */
  async linkCobroAnticipado(
    organizationId: string,
    ownerUserId: string,
    dto: LinkCobroAnticipadoDto,
  ) {
    let customerId = dto.customerId;
    if (!customerId && dto.accountName) {
      const nit = `901${String(Date.now()).slice(-6)}-1`;
      const c = await this.prisma.customer.create({
        data: {
          organizationId,
          name: dto.accountName,
          nit,
          segment: "B2B",
        },
      });
      customerId = c.id;
    }

    let tripId: string | null = null;
    if (dto.createTrip) {
      const count = await this.prisma.trip.count({ where: { organizationId } });
      const trip = await this.prisma.trip.create({
        data: {
          organizationId,
          code: `EXP-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`,
          origin: dto.origin,
          destination: dto.destination,
          departAt: dto.departAt ?? new Date(Date.now() + 2 * 3600_000),
          status: TripStatus.PENDING,
          fareAmount: dto.amount,
          customerId,
          advancePaymentRequired: true,
          meta: {
            source: "GESTOR_EXPRESS",
            paymentGate: "ADVANCE_PAYMENT_PENDING",
          },
        },
      });
      tripId = trip.id;
    }

    const token = randomBytes(16).toString("hex");
    const linkCount = await this.prisma.commercialAdvancePaymentLink.count({
      where: { organizationId },
    });
    const code = `PAY-${new Date().getFullYear()}-${String(linkCount + 1).padStart(4, "0")}`;
    const checkoutUrl = `/cobro/${token}`;

    const link = await this.prisma.commercialAdvancePaymentLink.create({
      data: {
        organizationId,
        code,
        token,
        amount: dto.amount,
        method: dto.method as AdvancePaymentMethod,
        status: AdvancePaymentStatus.PENDING,
        checkoutUrl,
        customerId,
        dealId: dto.dealId,
        tripId,
        createdById: ownerUserId,
        dispatchUnlocked: false,
        meta: { origin: dto.origin, destination: dto.destination },
      },
      include: { trip: true },
    });

    await this.pushTimeline({
      organizationId,
      ownerUserId,
      customerId,
      dealId: dto.dealId,
      kind: CommercialTimelineKind.PAYMENT_LINK,
      title: `Link cobro ${dto.method} · ${code}`,
      body: `Despacho bloqueado hasta confirmación Tesorería`,
      meta: { linkId: link.id, tripId, amount: dto.amount },
    });

    await this.kafka.emit("comercial.gestor.advance_payment_created", {
      organizationId,
      linkId: link.id,
      tripId,
      amount: dto.amount,
    });

    const gate = assertAdvancePaymentAllowsDispatch(link);

    return {
      status: "PAYMENT_LINK_CREATED",
      message:
        "Link de cobro generado — pase a Despacho bloqueado hasta pago confirmado",
      link,
      dispatchGate: gate,
      checkoutUrl,
    };
  }

  /**
   * Tesorería confirma pago → desbloquea Despacho.
   */
  async confirmarPagoTesoreria(
    organizationId: string,
    treasuryUserId: string,
    dto: ConfirmarPagoTesoreriaDto,
  ) {
    const link = await this.prisma.commercialAdvancePaymentLink.findFirst({
      where: { id: dto.linkId, organizationId },
      include: { trip: true },
    });
    if (!link) throw new NotFoundException("Link de cobro no encontrado");

    if (!dto.confirmed) {
      const failed = await this.prisma.commercialAdvancePaymentLink.update({
        where: { id: link.id },
        data: {
          status: AdvancePaymentStatus.FAILED,
          dispatchUnlocked: false,
        },
      });
      return {
        status: "PAYMENT_FAILED",
        link: failed,
        dispatchGate: assertAdvancePaymentAllowsDispatch(failed),
      };
    }

    const paidAt = new Date();
    const updated = await this.prisma.commercialAdvancePaymentLink.update({
      where: { id: link.id },
      data: {
        status: AdvancePaymentStatus.PAID,
        paidAt,
        treasuryConfirmedAt: paidAt,
        treasuryConfirmedById: treasuryUserId,
        dispatchUnlocked: true,
      },
      include: { trip: true },
    });

    if (updated.tripId) {
      await this.prisma.trip.update({
        where: { id: updated.tripId },
        data: {
          meta: {
            source: "GESTOR_EXPRESS",
            paymentGate: "CLEARED",
            paidAt,
          },
        },
      });
    }

    await this.kafka.emit("comercial.gestor.advance_payment_cleared", {
      organizationId,
      linkId: updated.id,
      tripId: updated.tripId,
    });

    return {
      status: "PAYMENT_CLEARED",
      message: "Pago confirmado — Despacho puede tomar la tarjeta",
      link: updated,
      dispatchGate: assertAdvancePaymentAllowsDispatch(updated),
    };
  }

  /**
   * Evalúa si un viaje puede pasar a Despacho (facturación anticipada).
   */
  async evaluateTripDispatchGate(organizationId: string, tripId: string) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, organizationId },
      include: { advancePaymentLink: true },
    });
    if (!trip) throw new NotFoundException("Servicio no encontrado");

    if (!trip.advancePaymentRequired) {
      return { ok: true, block: null, tripId };
    }

    const gate = assertAdvancePaymentAllowsDispatch(trip.advancePaymentLink);
    return { ...gate, tripId, linkId: trip.advancePaymentLink?.id ?? null };
  }

  async registrarLlamada(
    organizationId: string,
    ownerUserId: string,
    dto: RegistrarLlamadaDto,
  ) {
    const endedAt = new Date();
    const call = await this.prisma.commercialCallLog.create({
      data: {
        organizationId,
        ownerUserId,
        customerId: dto.customerId,
        dealId: dto.dealId,
        phone: dto.phone,
        direction: "OUTBOUND",
        durationSec: dto.durationSec,
        outcome: dto.outcome,
        voiceNoteRef: dto.voiceNoteRef,
        voiceNoteTranscript: dto.voiceNoteTranscript,
        endedAt,
        priorityScore: dto.priorityScore,
      },
    });

    await this.pushTimeline({
      organizationId,
      ownerUserId,
      customerId: dto.customerId,
      dealId: dto.dealId,
      kind: CommercialTimelineKind.CALL,
      title: `Llamada ${dto.phone}`,
      body:
        dto.voiceNoteTranscript ||
        dto.outcome ||
        "Llamada registrada en marcador",
      meta: {
        callId: call.id,
        durationSec: dto.durationSec,
        voiceNoteRef: dto.voiceNoteRef,
      },
    });

    let followUp: Awaited<
      ReturnType<typeof this.prisma.commercialTask.create>
    > | null = null;
    if (dto.scheduleFollowUpHours) {
      followUp = await this.prisma.commercialTask.create({
        data: {
          organizationId,
          ownerUserId,
          kind: CommercialTaskKind.CALL,
          title: `Re-llamar ${dto.accountName || dto.phone}`,
          dueAt: new Date(
            Date.now() + dto.scheduleFollowUpHours * 3600_000,
          ),
          priority: Math.min(100, dto.priorityScore + 10),
          customerId: dto.customerId,
          dealId: dto.dealId,
          callLogId: call.id,
        },
      });
    }

    await this.kafka.emit("comercial.gestor.call_logged", {
      organizationId,
      callId: call.id,
      ownerUserId,
    });

    return {
      status: "CALL_LOGGED",
      call,
      followUp,
      message: dto.voiceNoteTranscript
        ? "Llamada + dictado de voz al colgar registrados"
        : "Llamada registrada en marcador",
    };
  }

  private async ensureDeal(
    organizationId: string,
    ownerUserId: string,
    dto: {
      accountName?: string;
      customerId?: string;
      zone?: string;
      vehicleType?: string;
      distanceKm?: number;
    },
  ) {
    if (!dto.accountName && !dto.customerId) {
      throw new BadRequestException("accountName o customerId requerido");
    }
    let accountName = dto.accountName;
    if (!accountName && dto.customerId) {
      const c = await this.prisma.customer.findFirst({
        where: { id: dto.customerId, organizationId },
      });
      accountName = c?.name ?? "Lead express";
    }
    const count = await this.prisma.commercialDeal.count({
      where: { organizationId },
    });
    return this.prisma.commercialDeal.create({
      data: {
        organizationId,
        code: `B2B-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`,
        accountName: accountName!,
        customerId: dto.customerId,
        stage: SalesPipelineStage.NUEVO_LEAD,
        zone: (dto.zone ?? "BOGOTA").toUpperCase(),
        vehicleType: dto.vehicleType,
        distanceKm: dto.distanceKm,
        ownerUserId,
      },
    });
  }

  private async pushTimeline(input: {
    organizationId: string;
    ownerUserId: string;
    customerId?: string | null;
    dealId?: string | null;
    kind: CommercialTimelineKind;
    title: string;
    body?: string;
    meta?: Record<string, unknown>;
  }) {
    return this.prisma.commercialTimelineEvent.create({
      data: {
        organizationId: input.organizationId,
        ownerUserId: input.ownerUserId,
        customerId: input.customerId ?? undefined,
        dealId: input.dealId ?? undefined,
        kind: input.kind,
        title: input.title,
        body: input.body,
        meta: (input.meta as object | undefined) ?? undefined,
      },
    });
  }
}
