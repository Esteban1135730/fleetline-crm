import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import {
  InvoiceStatus,
  PaymentScheduleStatus,
  ThreeWayMatchStatus,
} from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";

export type PurchaseMatchApprovedPayload = {
  matchId: string;
  purchaseOrderId: string;
  invoiceId: string;
  goodsReceiptId: string;
  organizationId: string;
  amount: number;
};

/**
 * Cola Zero-Touch: convierte match aprobado en obligación de pago (PaymentSchedule).
 */
@Injectable()
export class PaymentQueueService {
  private readonly logger = new Logger(PaymentQueueService.name);

  constructor(private prisma: PrismaService) {}

  @OnEvent("purchase.match.approved")
  async onPurchaseMatchApproved(payload: PurchaseMatchApprovedPayload) {
    return this.enqueueFromApprovedMatch(payload);
  }

  async enqueueFromApprovedMatch(payload: PurchaseMatchApprovedPayload) {
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id: payload.invoiceId,
        organizationId: payload.organizationId,
      },
      include: {
        threeWayMatches: {
          where: { status: ThreeWayMatchStatus.APPROVED },
          orderBy: { evaluatedAt: "desc" },
          take: 1,
        },
        supplier: true,
      },
    });

    if (!invoice) {
      this.logger.warn(
        `[PaymentQueue] invoice ${payload.invoiceId} no encontrada — skip`,
      );
      return null;
    }

    const approved =
      invoice.threeWayMatches[0] ||
      (await this.prisma.threeWayMatch.findFirst({
        where: {
          id: payload.matchId,
          status: ThreeWayMatchStatus.APPROVED,
        },
      }));

    if (!approved) {
      this.logger.warn(
        `[PaymentQueue] sin ThreeWayMatch APPROVED para invoice ${invoice.id}`,
      );
      return null;
    }

    const existing = await this.prisma.paymentSchedule.findUnique({
      where: { invoiceId: invoice.id },
    });
    if (existing) {
      this.logger.log(
        `[PaymentQueue] ya existe schedule ${existing.id} para invoice ${invoice.id}`,
      );
      return existing;
    }

    const due = new Date();
    due.setDate(due.getDate() + 7);

    const schedule = await this.prisma.paymentSchedule.create({
      data: {
        organizationId: payload.organizationId,
        invoiceId: invoice.id,
        purchaseOrderId: payload.purchaseOrderId,
        threeWayMatchId: approved.id,
        amount: payload.amount ?? Number(invoice.amount),
        counterparty: invoice.counterparty,
        status: PaymentScheduleStatus.QUEUED,
        dueDate: due,
        meta: {
          source: "purchase.match.approved",
          goodsReceiptId: payload.goodsReceiptId,
          matchId: payload.matchId,
        },
      },
    });

    if (invoice.status !== InvoiceStatus.CLEARED_FOR_PAYMENT) {
      await this.prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: InvoiceStatus.CLEARED_FOR_PAYMENT },
      });
    }

    this.logger.log(
      `[PaymentQueue] obligación ${schedule.id} QUEUED — ${schedule.counterparty} $${schedule.amount}`,
    );
    return schedule;
  }
}

/**
 * Consumer Kafka / EventBus del topic purchase.match.approved.
 */
@Injectable()
export class PurchaseMatchConsumer {
  constructor(private queue: PaymentQueueService) {}

  /** Invocable desde tests o bridge Kafka */
  handle(payload: PurchaseMatchApprovedPayload) {
    return this.queue.enqueueFromApprovedMatch(payload);
  }
}
