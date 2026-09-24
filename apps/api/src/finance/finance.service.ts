import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  FleetModule,
  InvoiceStatus,
  InvoiceType,
  JournalEntryStatus,
  NotificationChannel,
  NotificationKind,
  RoleCode,
} from "@fsg/db";
import { COMMERCIAL_ARREARS_DAYS_HARD_STOP } from "@fsg/shared";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { SarlaftGuardService } from "../sarlaft/sarlaft-guard.service";
import { assertExecutivePinValid } from "../gerencia/dto/gerencia.dto";
import { NotificationsService } from "../notifications/notifications.service";
import { getCustomerArrearsDays } from "../comercial/commercial-hard-stops";

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
    private notifications: NotificationsService,
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

  /**
   * SCRUM-37 — Clientes con CxC vencida (mora) + flag hard-stop ventas (SCRUM-25).
   */
  async listCarteraMora(organizationId: string) {
    await this.markOverdue(organizationId);
    const now = new Date();
    const invoices = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        type: InvoiceType.RECEIVABLE,
        status: {
          in: [
            InvoiceStatus.ISSUED,
            InvoiceStatus.OVERDUE,
            InvoiceStatus.CAUSED,
          ],
        },
        dueDate: { lt: now },
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            nit: true,
            email: true,
            phone: true,
            sarlaftBlocked: true,
          },
        },
      },
      orderBy: { dueDate: "asc" },
    });

    type Bucket = {
      customerId: string | null;
      customerName: string;
      nit: string | null;
      email: string | null;
      phone: string | null;
      sarlaftBlocked: boolean;
      totalDue: number;
      maxDaysOverdue: number;
      invoiceCount: number;
      invoices: Array<{
        id: string;
        number: string;
        amount: number;
        dueDate: string | null;
        status: string;
        daysOverdue: number;
      }>;
    };

    const byCustomer = new Map<string, Bucket>();

    for (const inv of invoices) {
      if (!inv.dueDate) continue;
      const days = Math.floor(
        (now.getTime() - inv.dueDate.getTime()) / (24 * 60 * 60 * 1000),
      );
      if (days <= 0) continue;
      const key = inv.customerId || `orphan:${inv.id}`;
      let bucket = byCustomer.get(key);
      if (!bucket) {
        bucket = {
          customerId: inv.customerId,
          customerName: inv.customer?.name || inv.counterparty || "Sin cliente",
          nit: inv.customer?.nit ?? null,
          email: inv.customer?.email ?? null,
          phone: inv.customer?.phone ?? null,
          sarlaftBlocked: Boolean(inv.customer?.sarlaftBlocked),
          totalDue: 0,
          maxDaysOverdue: 0,
          invoiceCount: 0,
          invoices: [],
        };
        byCustomer.set(key, bucket);
      }
      bucket.totalDue += Number(inv.amount);
      bucket.invoiceCount += 1;
      if (days > bucket.maxDaysOverdue) bucket.maxDaysOverdue = days;
      bucket.invoices.push({
        id: inv.id,
        number: inv.number,
        amount: Number(inv.amount),
        dueDate: inv.dueDate.toISOString(),
        status: inv.status,
        daysOverdue: days,
      });
    }

    const customers = [...byCustomer.values()]
      .map((c) => ({
        ...c,
        salesBlocked:
          c.maxDaysOverdue >= COMMERCIAL_ARREARS_DAYS_HARD_STOP ||
          c.sarlaftBlocked,
        salesBlockReason: c.sarlaftBlocked
          ? "SARLAFT"
          : c.maxDaysOverdue >= COMMERCIAL_ARREARS_DAYS_HARD_STOP
            ? "MORA_60"
            : null,
        hardStopDays: COMMERCIAL_ARREARS_DAYS_HARD_STOP,
      }))
      .sort((a, b) => b.maxDaysOverdue - a.maxDaysOverdue || b.totalDue - a.totalDue);

    return {
      asOf: now.toISOString(),
      hardStopDays: COMMERCIAL_ARREARS_DAYS_HARD_STOP,
      customerCount: customers.length,
      totalDue: customers.reduce((s, c) => s + c.totalDue, 0),
      salesBlockedCount: customers.filter((c) => c.salesBlocked).length,
      customers,
    };
  }

  /**
   * SCRUM-37 — Aviso de cobro (in-app a Comercial/Tesorería + traza; canal correo si hay email).
   */
  async notifyCobro(
    organizationId: string,
    actorUserId: string,
    input: { customerId: string; invoiceIds?: string[]; note?: string },
  ) {
    if (!input.customerId?.trim()) {
      throw new BadRequestException("customerId requerido");
    }
    const customer = await this.prisma.customer.findFirst({
      where: { id: input.customerId, organizationId },
      select: {
        id: true,
        name: true,
        nit: true,
        email: true,
        phone: true,
      },
    });
    if (!customer) throw new NotFoundException("Cliente no encontrado");

    const arrears = await getCustomerArrearsDays(
      this.prisma,
      organizationId,
      customer.id,
    );
    if (!arrears.overdueInvoiceIds.length) {
      throw new BadRequestException("El cliente no tiene facturas en mora");
    }

    const invoiceIds =
      input.invoiceIds?.length
        ? input.invoiceIds.filter((id) =>
            arrears.overdueInvoiceIds.includes(id),
          )
        : arrears.overdueInvoiceIds;

    const invoices = await this.prisma.invoice.findMany({
      where: { organizationId, id: { in: invoiceIds } },
      select: { id: true, number: true, amount: true, dueDate: true },
    });
    const totalDue = invoices.reduce((s, i) => s + Number(i.amount), 0);
    const numbers = invoices.map((i) => i.number).join(", ");

    const channels: NotificationChannel[] = [
      NotificationChannel.IN_APP,
      NotificationChannel.WEB_PUSH,
    ];

    const title = `Aviso de cobro · ${customer.name}`;
    const body = `Mora ${arrears.maxDaysOverdue}d · ${formatCopInternal(totalDue)} · facturas ${numbers}${
      input.note ? ` · ${input.note}` : ""
    }`;

    const notified = await this.notifications.notify({
      organizationId,
      roles: [
        RoleCode.TESORERIA,
        RoleCode.GESTOR_COMERCIAL,
        RoleCode.DIRECTOR_COMERCIAL,
        RoleCode.DIRECTOR_FINANCIERO,
      ],
      kind: NotificationKind.REMINDER,
      title,
      body,
      href: "/tesoreria",
      channels,
      payload: {
        kind: "COLLECTION_NOTICE",
        customerId: customer.id,
        customerEmail: customer.email,
        customerPhone: customer.phone,
        invoiceIds,
        maxDaysOverdue: arrears.maxDaysOverdue,
        totalDue,
        emailQueued: Boolean(customer.email),
        actorUserId,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId,
        action: "CARTERA_NOTIFICAR_COBRO",
        entity: "Customer",
        entityId: customer.id,
        module: FleetModule.TESORERIA,
        userId: actorUserId,
        meta: {
          invoiceIds,
          totalDue,
          maxDaysOverdue: arrears.maxDaysOverdue,
          email: customer.email,
          phone: customer.phone,
          channels,
          note: input.note ?? null,
        },
      },
    });

    return {
      ok: true,
      customerId: customer.id,
      customerName: customer.name,
      invoiceIds,
      totalDue,
      maxDaysOverdue: arrears.maxDaysOverdue,
      channels,
      emailQueued: Boolean(customer.email),
      phone: customer.phone,
      notifiedCount: notified.created,
      message: customer.email
        ? `Aviso de cobro enviado · destinatario ${customer.email} registrado en la traza`
        : customer.phone
          ? `Aviso de cobro enviado · contacto ${customer.phone}`
          : "Aviso de cobro enviado a Comercial / Tesorería",
    };
  }

  /** Cuentas de caja/bancos (PUC 11xx) con saldo real del mayor. */
  async listTreasuryAccounts(organizationId: string) {
    const accounts = await this.prisma.account.findMany({
      where: {
        organizationId,
        OR: [
          { code: { startsWith: "11" } },
          { name: { contains: "Banco", mode: "insensitive" } },
          { name: { contains: "Caja", mode: "insensitive" } },
        ],
      },
      orderBy: { code: "asc" },
    });

    const withBalance = await Promise.all(
      accounts.map(async (a) => ({
        id: a.id,
        code: a.code,
        name: a.name,
        type: a.type,
        balance: await this.accountBalanceCop(organizationId, a.id),
      })),
    );

    return {
      accounts: withBalance,
      asOf: new Date().toISOString(),
    };
  }

  private async accountBalanceCop(
    organizationId: string,
    accountId: string,
  ): Promise<number> {
    const lines = await this.prisma.journalLine.findMany({
      where: {
        entry: { organizationId, status: JournalEntryStatus.POSTED },
        OR: [{ debitAccountId: accountId }, { creditAccountId: accountId }],
      },
      select: {
        amount: true,
        debitAccountId: true,
        creditAccountId: true,
      },
    });
    const balance = lines.reduce((sum, l) => {
      const amt = Number(l.amount);
      if (l.debitAccountId === accountId) return sum + amt;
      if (l.creditAccountId === accountId) return sum - amt;
      return sum;
    }, 0);
    return balance;
  }
}

function formatCopInternal(n: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Math.round(n));
}
