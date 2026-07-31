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
