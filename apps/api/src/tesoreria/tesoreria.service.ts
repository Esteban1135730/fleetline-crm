import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  InvoiceStatus,
  PaymentScheduleStatus,
  ThreeWayMatchStatus,
} from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";
import { KafkaEventsService } from "../logistics/kafka-events.service";
import { SarlaftComplianceGuard } from "../sarlaft/sarlaft-compliance.guard";
import { MfaService } from "./mfa.service";

@Injectable()
export class TesoreriaService {
  constructor(
    private prisma: PrismaService,
    private mfa: MfaService,
    private kafka: KafkaEventsService,
    private sarlaft: SarlaftComplianceGuard,
  ) {}

  /**
   * Bloqueo operativo: no dispersar anticipos/peajes si hay legalizaciones
   * OPEN o IN_REVIEW (saldo pendiente de cierre).
   */
  async assertNoOpenLegalizationsBlocking(organizationId: string) {
    const open = await this.prisma.expenseLegalization.count({
      where: {
        organizationId,
        status: { in: ["OPEN", "IN_REVIEW", "REFUND_PENDING"] },
      },
    });
    if (open > 0) {
      throw new ForbiddenException({
        error: "LEGALIZATIONS_PENDING",
        message: `Dispersión bloqueada: ${open} legalización(es) de viáticos sin cerrar`,
        openCount: open,
      });
    }
  }

  /**
   * Cruce de recaudo de cartera: marca CxC ISSUED/PARTIAL como PAID
   * cuando hay referencia bancaria de ingreso.
   */
  async cruzarCartera(
    organizationId: string,
    userId: string,
    input: { invoiceIds: string[]; bankRef: string },
  ) {
    if (!input.invoiceIds?.length) {
      throw new ForbiddenException({
        error: "EMPTY_CARTERA",
        message: "Indique facturas CxC a cruzar",
      });
    }
    const invoices = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        id: { in: input.invoiceIds },
        type: "RECEIVABLE",
        status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.OVERDUE] },
      },
    });
    if (invoices.length !== input.invoiceIds.length) {
      throw new NotFoundException(
        "Una o más facturas CxC no están disponibles para cruce",
      );
    }
    const paidAt = new Date();
    const results: Array<{
      id: string;
      number: string;
      amount: unknown;
      status: InvoiceStatus;
    }> = [];
    for (const inv of invoices) {
      const updated = await this.prisma.invoice.update({
        where: { id: inv.id },
        data: {
          status: InvoiceStatus.PAID,
          paidAt,
          paymentApproved: true,
          paymentApprovedAt: paidAt,
          paymentApprovedById: userId,
          prefacturaAnnex: {
            ...(typeof inv.prefacturaAnnex === "object" &&
            inv.prefacturaAnnex !== null
              ? (inv.prefacturaAnnex as object)
              : {}),
            carteraCruce: { bankRef: input.bankRef, at: paidAt.toISOString() },
          },
        },
      });
      results.push(updated);
    }
    await this.kafka.emitPaymentDisbursed({
      organizationId,
      amount: results.reduce((s, i) => s + Number(i.amount), 0),
      paymentScheduleIds: [],
      invoiceIds: results.map((i) => i.id),
      bankRef: input.bankRef,
    });
    return {
      crossed: results.length,
      bankRef: input.bankRef,
      items: results.map((i) => ({
        id: i.id,
        number: i.number,
        amount: i.amount,
        status: i.status,
      })),
    };
  }

  listSchedules(organizationId: string, status?: PaymentScheduleStatus) {
    return this.prisma.paymentSchedule.findMany({
      where: {
        organizationId,
        ...(status ? { status } : {}),
      },
      include: {
        invoice: {
          select: {
            id: true,
            number: true,
            status: true,
            amount: true,
            counterparty: true,
          },
        },
      },
      orderBy: { queuedAt: "desc" },
    });
  }

  /**
   * Solo facturas con 3-Way Match APPROVED pueden desembolsarse.
   */
  async assertInvoiceAuthorizedForPayment(
    organizationId: string,
    invoiceId: string,
  ) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, organizationId },
      include: {
        threeWayMatches: {
          where: { status: ThreeWayMatchStatus.APPROVED },
          take: 1,
        },
      },
    });
    if (!invoice) throw new NotFoundException("Factura no encontrada");

    const approved = invoice.threeWayMatches.length > 0;
    if (!approved) {
      throw new ForbiddenException({
        error: "PAYMENT_NOT_AUTHORIZED_UNMATCHED",
        message:
          "Pago bloqueado: la factura no proviene de un 3-Way Match APPROVED",
        invoiceId,
      });
    }
    return invoice;
  }

  async disburse(
    organizationId: string,
    userId: string,
    userEmail: string | undefined,
    input: {
      paymentScheduleIds: string[];
      mfaToken?: string;
      bankRef?: string;
    },
  ) {
    if (!input.paymentScheduleIds?.length) {
      throw new ForbiddenException({
        error: "EMPTY_DISBURSEMENT",
        message: "Indique al menos un PaymentSchedule",
      });
    }

    const schedules = await this.prisma.paymentSchedule.findMany({
      where: {
        organizationId,
        id: { in: input.paymentScheduleIds },
        status: {
          in: [PaymentScheduleStatus.QUEUED, PaymentScheduleStatus.PENDING],
        },
      },
      include: {
        invoice: {
          include: { supplier: true },
        },
      },
    });

    if (schedules.length !== input.paymentScheduleIds.length) {
      throw new NotFoundException(
        "Uno o más schedules no existen o no están en cola",
      );
    }

    const total = schedules.reduce((s, p) => s + Number(p.amount), 0);

    const isAdvanceOrToll = schedules.some((s) => {
      const meta =
        s.meta && typeof s.meta === "object"
          ? (s.meta as { kind?: string })
          : {};
      const kind = String(meta.kind || "").toUpperCase();
      return (
        kind === "ANTICIPO" ||
        kind === "PEAJE" ||
        kind === "ADVANCE" ||
        kind === "RODAMIENTO"
      );
    });
    if (isAdvanceOrToll) {
      await this.assertNoOpenLegalizationsBlocking(organizationId);
    }

    // Autorización 3-Way + SARLAFT por cada factura / beneficiario
    for (const sch of schedules) {
      await this.assertInvoiceAuthorizedForPayment(
        organizationId,
        sch.invoiceId,
      );

      const inv = sch.invoice;
      if (inv.supplierId) {
        await this.sarlaft.assertSupplierClear(
          organizationId,
          inv.supplierId,
          "TREASURY_DISBURSE",
        );
      } else {
        await this.sarlaft.assertDocumentClear(
          organizationId,
          sch.counterparty || inv.counterparty,
          "TREASURY_DISBURSE",
        );
        if (inv.supplier?.sarlaftBlocked) {
          this.sarlaft.assertNotBlocked({
            entityLabel: `Beneficiario ${inv.supplier.name}`,
            sarlaftBlocked: true,
            document: inv.supplier.nit,
            entityId: inv.supplier.id,
            context: "TREASURY_DISBURSE",
          });
        }
      }
    }

    const mfaResult = this.mfa.assertMfaForAmount(
      total,
      input.mfaToken,
      userEmail,
    );
    if (mfaResult.required && !mfaResult.verified) {
      throw new ForbiddenException({
        error: mfaResult.error,
        message:
          mfaResult.error === "MFA_REQUIRED"
            ? `Desembolso ${total} COP requiere token MFA`
            : "Token MFA inválido",
        thresholdCop: this.mfa.thresholdCop(),
        amount: total,
      });
    }

    const disbursedAt = new Date();
    const bankRef = input.bankRef || `H2H-${disbursedAt.getTime()}`;
    const results: Array<{
      id: string;
      status: PaymentScheduleStatus;
      amount: unknown;
    }> = [];

    for (const sch of schedules) {
      const updated = await this.prisma.paymentSchedule.update({
        where: { id: sch.id },
        data: {
          status: PaymentScheduleStatus.DISBURSED,
          disbursedAt,
          disbursedById: userId,
          mfaVerified: mfaResult.verified,
          bankRef,
        },
      });

      await this.prisma.invoice.update({
        where: { id: sch.invoiceId },
        data: {
          status: InvoiceStatus.PAID,
          paidAt: disbursedAt,
          paymentApproved: true,
          paymentApprovedAt: disbursedAt,
          paymentApprovedById: userId,
        },
      });

      results.push(updated);
    }

    await this.kafka.emitPaymentDisbursed({
      organizationId,
      amount: total,
      paymentScheduleIds: schedules.map((s) => s.id),
      invoiceIds: schedules.map((s) => s.invoiceId),
      bankRef,
    });

    return {
      disbursed: results.length,
      totalAmount: total,
      mfaVerified: mfaResult.verified,
      items: results,
    };
  }
}
