import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import {
  InvoiceStatus,
  InvoiceType,
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
 * También encola liquidación de nómina (SCRUM-29).
 */
@Injectable()
export class PaymentQueueService {
  private readonly logger = new Logger(PaymentQueueService.name);

  constructor(private prisma: PrismaService) {}

  @OnEvent("purchase.match.approved")
  async onPurchaseMatchApproved(payload: PurchaseMatchApprovedPayload) {
    return this.enqueueFromApprovedMatch(payload);
  }

  @OnEvent("payroll.calculated")
  async onPayrollCalculated(payload: {
    organizationId: string;
    payrollRunId: string;
    amount: number;
    totalOvertime?: number;
    totalNight?: number;
    totalCommissions?: number;
    periodStart?: string;
    periodEnd?: string;
  }) {
    return this.enqueuePayrollDisbursement(payload);
  }

  /**
   * SCRUM-29: liquidación RRHH → obligación Tesorería + archivo plano en meta.
   * Contabilidad ya causa vía ContabilidadEventListener.
   */
  async enqueuePayrollDisbursement(payload: {
    organizationId: string;
    payrollRunId: string;
    amount: number;
    totalOvertime?: number;
    totalNight?: number;
    totalCommissions?: number;
    periodStart?: string;
    periodEnd?: string;
  }) {
    const amount = Number(payload.amount) || 0;
    if (amount <= 0) {
      this.logger.warn(
        `[PaymentQueue] payroll ${payload.payrollRunId} amount<=0 — skip`,
      );
      return null;
    }

    const existingInv = await this.prisma.invoice.findFirst({
      where: {
        organizationId: payload.organizationId,
        type: InvoiceType.PAYABLE,
        number: { startsWith: "NOM-" },
        prefacturaAnnex: {
          path: ["payrollRunId"],
          equals: payload.payrollRunId,
        },
      },
      include: { paymentSchedules: true },
    });
    if (existingInv?.paymentSchedules?.[0]) {
      this.logger.log(
        `[PaymentQueue] ya existe schedule nómina ${existingInv.paymentSchedules[0].id} para run ${payload.payrollRunId}`,
      );
      return existingInv.paymentSchedules[0];
    }

    const run = await this.prisma.payrollRun.findFirst({
      where: {
        id: payload.payrollRunId,
        organizationId: payload.organizationId,
      },
      include: {
        lines: {
          include: {
            employee: { select: { document: true, name: true } },
          },
        },
      },
    });

    const count = await this.prisma.invoice.count({
      where: { organizationId: payload.organizationId },
    });
    const year = new Date().getFullYear();
    const periodLabel = `${payload.periodStart?.slice(0, 10) || ""}→${payload.periodEnd?.slice(0, 10) || ""}`;
    const flatFileLines = (run?.lines || []).map((l) => ({
      document: l.employee?.document || "",
      name: l.employee?.name || "",
      net: Number(l.grossTotal),
      bankAccount: null as string | null,
    }));

    const invoice =
      existingInv ||
      (await this.prisma.invoice.create({
        data: {
          number: `NOM-${year}-${String(count + 1).padStart(4, "0")}`,
          type: InvoiceType.PAYABLE,
          status: InvoiceStatus.CLEARED_FOR_PAYMENT,
          counterparty: `NÓMINA ${periodLabel}`.trim(),
          amount,
          dueDate: new Date(Date.now() + 3 * 86_400_000),
          organizationId: payload.organizationId,
          prefacturaAnnex: {
            source: "payroll.calculated",
            payrollRunId: payload.payrollRunId,
            periodStart: payload.periodStart,
            periodEnd: payload.periodEnd,
            flatFile: flatFileLines,
            totals: {
              gross: amount,
              overtime: payload.totalOvertime ?? 0,
              night: payload.totalNight ?? 0,
              commissions: payload.totalCommissions ?? 0,
            },
          },
        },
      }));

    const schedule = await this.prisma.paymentSchedule.create({
      data: {
        organizationId: payload.organizationId,
        invoiceId: invoice.id,
        amount,
        counterparty: invoice.counterparty,
        status: PaymentScheduleStatus.QUEUED,
        dueDate: invoice.dueDate,
        meta: {
          source: "payroll.calculated",
          payrollRunId: payload.payrollRunId,
          periodStart: payload.periodStart,
          periodEnd: payload.periodEnd,
          flatFileLineCount: flatFileLines.length,
          accounting: "NIIF 5205/2505 via ContabilidadEventListener",
        },
      },
    });

    this.logger.log(
      `[PaymentQueue] nómina ${schedule.id} QUEUED — run ${payload.payrollRunId} $${amount}`,
    );
    return { invoice, schedule, flatFileLines };
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
