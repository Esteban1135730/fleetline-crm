import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InvoiceStatus, InvoiceType, JournalEntryStatus } from "@fsg/db";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { SarlaftGuardService } from "../sarlaft/sarlaft-guard.service";
import { assertExecutivePinValid } from "../gerencia/dto/gerencia.dto";

/** Estados CxP que cuentan como "pendiente por pagar" (SSoT Tesorería ↔ Gerencia). */
const CXP_OPEN_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.ISSUED,
  InvoiceStatus.OVERDUE,
  InvoiceStatus.CLEARED_FOR_PAYMENT,
  InvoiceStatus.CAUSED,
];

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

    const sumCxcOpen = (list: typeof invoices) =>
      list
        .filter(
          (i) =>
            i.status === InvoiceStatus.ISSUED ||
            i.status === InvoiceStatus.OVERDUE,
        )
        .reduce((a, b) => a + Number(b.amount), 0);

    const sumCxpOpen = (list: typeof invoices) =>
      list
        .filter((i) => CXP_OPEN_STATUSES.includes(i.status))
        .reduce((a, b) => a + Number(b.amount), 0);

    const sumPaid = (list: typeof invoices) =>
      list
        .filter((i) => i.status === InvoiceStatus.PAID)
        .reduce((a, b) => a + Number(b.amount), 0);

    const bankBalance = await this.bankBalanceCop(organizationId);
    const cashFlowForecast = this.buildCashFlowForecast(invoices);

    return {
      cxcOpen: sumCxcOpen(cxc),
      cxcPaid: sumPaid(cxc),
      cxpOpen: sumCxpOpen(cxp),
      cxpPaid: sumPaid(cxp),
      overdue: invoices.filter((i) => i.status === InvoiceStatus.OVERDUE).length,
      bankBalance,
      netLiquidity: bankBalance + sumCxcOpen(cxc) - sumCxpOpen(cxp),
      cashFlowForecast,
    };
  }

  private async bankBalanceCop(organizationId: string): Promise<number> {
    const bank = await this.prisma.account.findFirst({
      where: { organizationId, code: "1110" },
      select: { id: true },
    });
    if (!bank) {
      const paid = await this.prisma.invoice.findMany({
        where: { organizationId, status: InvoiceStatus.PAID },
        select: { type: true, amount: true },
      });
      const inflow = paid
        .filter((i) => i.type === InvoiceType.RECEIVABLE)
        .reduce((s, i) => s + Number(i.amount), 0);
      const outflow = paid
        .filter((i) => i.type === InvoiceType.PAYABLE)
        .reduce((s, i) => s + Number(i.amount), 0);
      return Math.max(0, inflow - outflow);
    }
    const lines = await this.prisma.journalLine.findMany({
      where: {
        entry: { organizationId, status: JournalEntryStatus.POSTED },
        OR: [{ debitAccountId: bank.id }, { creditAccountId: bank.id }],
      },
      select: {
        amount: true,
        debitAccountId: true,
        creditAccountId: true,
      },
    });
    const balance = lines.reduce((sum, l) => {
      const amt = Number(l.amount);
      if (l.debitAccountId === bank.id) return sum + amt;
      if (l.creditAccountId === bank.id) return sum - amt;
      return sum;
    }, 0);
    return Math.max(0, balance);
  }

  private buildCashFlowForecast(
    invoices: Array<{
      type: InvoiceType;
      status: InvoiceStatus;
      amount: { toString(): string } | number | string;
      dueDate: Date | null;
    }>,
  ) {
    const now = new Date();
    const weeks = Array.from({ length: 4 }, (_, i) => {
      const start = new Date(now);
      start.setDate(start.getDate() + i * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      return { start, end, label: `Sem ${i + 1}` };
    });

    return weeks.map((w) => {
      const open = invoices.filter(
        (inv) =>
          (inv.status === InvoiceStatus.ISSUED ||
            inv.status === InvoiceStatus.OVERDUE) &&
          inv.dueDate &&
          inv.dueDate >= w.start &&
          inv.dueDate < w.end,
      );
      const ingresos = open
        .filter((inv) => inv.type === InvoiceType.RECEIVABLE)
        .reduce((s, inv) => s + Number(inv.amount), 0);
      const egresos = open
        .filter((inv) => inv.type === InvoiceType.PAYABLE)
        .reduce((s, inv) => s + Number(inv.amount), 0);
      return {
        semana: w.label,
        ingresos: Math.round(ingresos / 1_000_000),
        egresos: Math.round(egresos / 1_000_000),
      };
    });
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
    pin?: string,
  ) {
    await this.assertTreasuryPin(organizationId, approverUserId, pin);

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
      pin?: string;
      evidenceRef?: string;
      /** CxC: nombre de quien recibió el dinero */
      receivedByName?: string;
      /** CxC: confirmación explícita del cobro */
      confirmCollection?: boolean;
      bankRef?: string;
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
    if (inv.collectionConfirmedAt || inv.paidAt) {
      throw new BadRequestException(
        "Este cobro/pago ya fue confirmado — no se puede registrar dos veces",
      );
    }

    if (inv.type === InvoiceType.RECEIVABLE) {
      const receiver = (opts?.receivedByName || "").trim();
      if (receiver.length < 2) {
        throw new BadRequestException(
          "Indique quién recibió el dinero para confirmar el cobro",
        );
      }
      if (opts?.confirmCollection !== true) {
        throw new BadRequestException(
          "Debe confirmar explícitamente el cobro antes de registrarlo",
        );
      }
    }

    if (inv.type === InvoiceType.PAYABLE) {
      if (opts?.actorUserId) {
        await this.assertTreasuryPin(
          organizationId,
          opts.actorUserId,
          opts.pin,
        );
      }
      const hasEvidence =
        Boolean(opts?.evidenceRef?.trim()) ||
        Boolean(inv.supportFileRef?.trim()) ||
        Boolean(inv.dianPdfRef?.trim());
      if (!hasEvidence) {
        throw new BadRequestException(
          "Comprobante obligatorio: adjunte evidencia antes de pagar CxP",
        );
      }
      if (!inv.paymentApprovedAt) {
        throw new BadRequestException(
          "CxP sin aprobación: registre el aprobador antes de marcar como pagada",
        );
      }
      const supplierLabel = inv.counterparty || "";
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

    const now = new Date();
    const receiver = (opts?.receivedByName || "").trim();
    return this.prisma.invoice.update({
      where: { id },
      data: {
        status: InvoiceStatus.PAID,
        paidAt: now,
        bankRef: opts?.bankRef?.trim() || inv.bankRef || null,
        ...(opts?.evidenceRef
          ? {
              dianPdfRef: opts.evidenceRef,
              prefacturaAnnex: {
                evidenceRef: opts.evidenceRef,
                paidWithEvidenceAt: now.toISOString(),
              },
            }
          : {}),
        ...(inv.type === InvoiceType.RECEIVABLE
          ? {
              receivedByName: receiver,
              collectionConfirmedAt: now,
              collectionConfirmedById: opts?.actorUserId || null,
            }
          : {}),
      },
      include: {
        customer: true,
        trip: { select: { id: true, code: true } },
        paymentApprovedBy: { select: { id: true, name: true, email: true } },
        collectionConfirmedBy: {
          select: { id: true, name: true, email: true },
        },
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

  private async assertTreasuryPin(
    organizationId: string,
    userId: string,
    pin: string | undefined,
  ) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId },
      select: { executivePinHash: true },
    });
    if (!user) throw new NotFoundException("Usuario no encontrado");
    assertExecutivePinValid(pin, user.executivePinHash, (p, h) =>
      bcrypt.compareSync(p, h),
    );
  }

  async attachInvoiceSupport(
    organizationId: string,
    id: string,
    file: {
      storedName: string;
      originalName: string;
      mimeType: string;
    },
  ) {
    const inv = await this.prisma.invoice.findFirst({
      where: { id, organizationId },
    });
    if (!inv) throw new NotFoundException("Factura no encontrada");
    const updated = await this.prisma.invoice.update({
      where: { id },
      data: {
        supportFileRef: `/uploads/${file.storedName}`,
        supportOriginalName: file.originalName,
        supportMimeType: file.mimeType,
      },
      include: {
        customer: true,
        trip: { select: { id: true, code: true } },
        paymentApprovedBy: { select: { id: true, name: true, email: true } },
      },
    });
    return this.mapInvoiceUi(updated);
  }

  async getInvoiceSupportMeta(organizationId: string, id: string) {
    const inv = await this.prisma.invoice.findFirst({
      where: { id, organizationId },
      select: {
        id: true,
        supportFileRef: true,
        supportOriginalName: true,
        supportMimeType: true,
      },
    });
    if (!inv) throw new NotFoundException("Factura no encontrada");
    return inv;
  }
}
