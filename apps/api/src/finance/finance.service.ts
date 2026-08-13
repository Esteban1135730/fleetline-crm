import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InvoiceStatus, InvoiceType, JournalEntryStatus } from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";
import { SarlaftGuardService } from "../sarlaft/sarlaft-guard.service";

@Injectable()
export class FinanceService {
  constructor(
    private prisma: PrismaService,
    private sarlaft: SarlaftGuardService,
  ) {}

  async summary(organizationId: string) {
    await this.markOverdue(organizationId);
    const invoices = await this.prisma.invoice.findMany({
      where: { organizationId },
    });

    const cxc = invoices.filter((i) => i.type === InvoiceType.RECEIVABLE);
    const cxp = invoices.filter((i) => i.type === InvoiceType.PAYABLE);

    const sumOpen = (list: typeof invoices) =>
      list
        .filter(
          (i) =>
            i.status === InvoiceStatus.ISSUED ||
            i.status === InvoiceStatus.OVERDUE,
        )
        .reduce((a, b) => a + Number(b.amount), 0);

    const sumPaid = (list: typeof invoices) =>
      list
        .filter((i) => i.status === InvoiceStatus.PAID)
        .reduce((a, b) => a + Number(b.amount), 0);

    return {
      cxcOpen: sumOpen(cxc),
      cxcPaid: sumPaid(cxc),
      cxpOpen: sumOpen(cxp),
      cxpPaid: sumPaid(cxp),
      overdue: invoices.filter((i) => i.status === InvoiceStatus.OVERDUE).length,
    };
  }

  async listInvoices(organizationId: string, type?: "RECEIVABLE" | "PAYABLE") {
    await this.markOverdue(organizationId);
    const rows = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        ...(type ? { type: type as InvoiceType } : {}),
      },
      include: {
        customer: true,
        trip: { select: { id: true, code: true } },
        paymentApprovedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { dueDate: "asc" },
    });
    return rows.map((inv) => this.mapInvoiceUi(inv));
  }

  private invoiceAnnexDescription(annex: unknown): string {
    if (annex && typeof annex === "object" && !Array.isArray(annex) && "description" in annex) {
      const d = (annex as { description?: unknown }).description;
      return typeof d === "string" ? d : "";
    }
    return "";
  }

  private mapInvoiceUi<T extends { counterparty: string; prefacturaAnnex?: unknown }>(
    inv: T,
  ) {
    const description = this.invoiceAnnexDescription(inv.prefacturaAnnex);
    return {
      ...inv,
      supplierName: inv.counterparty,
      description: description || inv.counterparty,
    };
  }

  private async markOverdue(organizationId: string) {
    const now = new Date();
    await this.prisma.invoice.updateMany({
      where: {
        organizationId,
        status: InvoiceStatus.ISSUED,
        dueDate: { lt: now },
      },
      data: { status: InvoiceStatus.OVERDUE },
    });
  }

  private async accountByCode(organizationId: string, code: string) {
    const acc = await this.prisma.account.findFirst({
      where: { organizationId, code },
    });
    if (!acc) {
      throw new BadRequestException(
        `Falta cuenta PUC ${code}. Crea el plan de cuentas en Contabilidad.`,
      );
    }
    return acc;
  }

  private async postJournal(
    organizationId: string,
    description: string,
    lines: { code: string; debit: number; credit: number; memo?: string }[],
  ) {
    const resolved: {
      accountId: string;
      debit: number;
      credit: number;
      memo?: string;
    }[] = [];
    for (const line of lines) {
      const account = await this.accountByCode(organizationId, line.code);
      resolved.push({
        accountId: account.id,
        debit: line.debit,
        credit: line.credit,
        memo: line.memo,
      });
    }
    const count = await this.prisma.journalEntry.count({
      where: { organizationId },
    });
    return this.prisma.journalEntry.create({
      data: {
        number: `AS-2026-${String(count + 1).padStart(3, "0")}`,
        description,
        status: JournalEntryStatus.POSTED,
        organizationId,
        lines: { create: resolved },
      },
    });
  }

  async createInvoice(
    organizationId: string,
    data: {
      type: "RECEIVABLE" | "PAYABLE";
      amount: number;
      dueDate: string;
      customerId?: string;
      supplierName?: string;
      description?: string;
    },
  ) {
    const count = await this.prisma.invoice.count({ where: { organizationId } });
    const prefix = data.type === "RECEIVABLE" ? "FV" : "FC";
    const year = new Date().getFullYear();
    const counterparty =
      data.supplierName?.trim() ||
      data.description?.trim() ||
      "Contraparte";
    const inv = await this.prisma.invoice.create({
      data: {
        number: `${prefix}-${year}-${String(count + 1).padStart(3, "0")}`,
        type: data.type as InvoiceType,
        status: InvoiceStatus.ISSUED,
        amount: data.amount,
        dueDate: new Date(data.dueDate),
        customerId: data.customerId,
        counterparty,
        organizationId,
        prefacturaAnnex: data.description
          ? { description: data.description }
          : undefined,
      },
      include: { customer: true, trip: { select: { id: true, code: true } } },
    });

    try {
      const amount = Number(data.amount);
      if (data.type === "RECEIVABLE") {
        const entry = await this.postJournal(
          organizationId,
          `Emisión ${inv.number}`,
          [
            { code: "1305", debit: amount, credit: 0, memo: "CxC" },
            { code: "4135", debit: 0, credit: amount, memo: "Ingreso transporte" },
          ],
        );
        await this.prisma.invoice.update({
          where: { id: inv.id },
          data: { journalEntryId: entry.id },
        });
      } else {
        const entry = await this.postJournal(
          organizationId,
          `Emisión ${inv.number}`,
          [
            { code: "5135", debit: amount, credit: 0, memo: "Gasto / compra" },
            { code: "2205", debit: 0, credit: amount, memo: "CxP" },
          ],
        );
        await this.prisma.invoice.update({
          where: { id: inv.id },
          data: { journalEntryId: entry.id },
        });
      }
    } catch {
      /* PUC incompleto: la factura igual queda creada */
    }

    return this.mapInvoiceUi(
      await this.prisma.invoice.findFirstOrThrow({
        where: { id: inv.id },
        include: { customer: true, trip: { select: { id: true, code: true } } },
      }),
    );
  }

  async updateInvoice(
    organizationId: string,
    id: string,
    data: {
      dueDate?: string;
      description?: string;
      amount?: number;
      status?: string;
    },
  ) {
    const inv = await this.prisma.invoice.findFirst({
      where: { id, organizationId },
    });
    if (!inv) throw new NotFoundException("Factura no encontrada");
    if (inv.status === InvoiceStatus.PAID || inv.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException("No se puede editar una factura pagada o anulada");
    }
    return this.prisma.invoice.update({
      where: { id },
      data: {
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        description: data.description,
        amount: data.amount,
        status: data.status
          ? (data.status.toUpperCase() as InvoiceStatus)
          : undefined,
        paidAt:
          data.status?.toUpperCase() === "PAID" ? new Date() : inv.paidAt,
      },
      include: { customer: true, trip: { select: { id: true, code: true } } },
    });
  }

  async approvePayment(
    organizationId: string,
    id: string,
    approverUserId: string,
  ) {
    const inv = await this.prisma.invoice.findFirst({
      where: { id, organizationId },
    });
    if (!inv) throw new NotFoundException("Factura no encontrada");
    if (inv.type !== InvoiceType.PAYABLE) {
      throw new BadRequestException(
        "La aprobación de pago solo aplica a cuentas por pagar (CxP)",
      );
    }
    if (inv.status === InvoiceStatus.PAID) {
      throw new BadRequestException("La factura ya está pagada");
    }
    if (inv.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException("No se puede aprobar una factura anulada");
    }

    return this.prisma.invoice.update({
      where: { id },
      data: {
        paymentApprovedAt: new Date(),
        paymentApprovedById: approverUserId,
      },
      include: {
        customer: true,
        trip: { select: { id: true, code: true } },
        paymentApprovedBy: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async markPaid(
    organizationId: string,
    id: string,
    opts?: {
      forceDespiteSarlaft?: boolean;
      actorUserId?: string;
      actorRole?: string;
    },
  ) {
    const inv = await this.prisma.invoice.findFirst({
      where: { id, organizationId },
      include: { customer: { select: { nit: true, name: true } } },
    });
    if (!inv) throw new NotFoundException("Factura no encontrada");
    if (inv.status === InvoiceStatus.PAID) {
      throw new BadRequestException("La factura ya está pagada");
    }
    if (inv.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException("No se puede pagar una factura anulada");
    }

    if (inv.type === InvoiceType.PAYABLE && !inv.paymentApprovedAt) {
      throw new BadRequestException(
        "CxP sin aprobación: registre el aprobador antes de marcar como pagada",
      );
    }

    if (inv.type === InvoiceType.PAYABLE) {
      const supplierLabel = inv.supplierName || "";
      const nitHint = inv.customer?.nit || "";
      await this.sarlaft.assertClear({
        organizationId,
        subjectDoc: nitHint || supplierLabel,
        subjectName: supplierLabel || undefined,
        context: "INVOICE_PAY",
        forceDespiteSarlaft: opts?.forceDespiteSarlaft,
        actorUserId: opts?.actorUserId,
        actorRole: opts?.actorRole,
      });
    }

    const amount = Number(inv.amount);
    try {
      if (inv.type === InvoiceType.RECEIVABLE) {
        await this.postJournal(organizationId, `Cobro ${inv.number}`, [
          { code: "1110", debit: amount, credit: 0, memo: "Bancos" },
          { code: "1305", debit: 0, credit: amount, memo: "CxC" },
        ]);
      } else {
        await this.postJournal(organizationId, `Pago ${inv.number}`, [
          { code: "2205", debit: amount, credit: 0, memo: "CxP" },
          { code: "1110", debit: 0, credit: amount, memo: "Bancos" },
        ]);
      }
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
    }

    return this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.PAID, paidAt: new Date() },
      include: {
        customer: true,
        trip: { select: { id: true, code: true } },
        paymentApprovedBy: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async cancelInvoice(organizationId: string, id: string) {
    const inv = await this.prisma.invoice.findFirst({
      where: { id, organizationId },
    });
    if (!inv) throw new NotFoundException("Factura no encontrada");
    if (inv.status === InvoiceStatus.PAID) {
      throw new BadRequestException("No se puede anular una factura pagada");
    }
    return this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.CANCELLED },
      include: { customer: true, trip: { select: { id: true, code: true } } },
    });
  }
}
