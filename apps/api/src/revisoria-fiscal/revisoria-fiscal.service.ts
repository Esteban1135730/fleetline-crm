import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomBytes } from "crypto";
import {
  AccountingPeriodStatus,
  InvoiceType,
} from "@fsg/db";
import { HARD_RULES } from "@fsg/shared";
import { PrismaService } from "../prisma/prisma.service";
import type {
  FiscalAuditNoteDto,
  HardLockDto,
} from "./dto/revisoria-fiscal.dto";

type DianPayload = {
  retefuentePct?: number;
  retefuenteAmount?: number;
  reteIvaPct?: number;
  ivaPct?: number;
  retentionOmitida?: boolean;
  [k: string]: unknown;
};

function yearMonthNow(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function periodBounds(yearMonth: string): { from: Date; to: Date } {
  const [y, m] = yearMonth.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const to = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
  return { from, to };
}

/**
 * Módulo 18 — Revisoría Fiscal / Truth Hub (Fernando).
 */
@Injectable()
export class RevisoriaFiscalService {
  private readonly logger = new Logger(RevisoriaFiscalService.name);

  constructor(private prisma: PrismaService) {}

  async dashboard(organizationId: string) {
    const yearMonth = yearMonthNow();
    const [period, accounts, invoices, notes, sample] = await Promise.all([
      this.prisma.accountingPeriod.findUnique({
        where: {
          organizationId_yearMonth: { organizationId, yearMonth },
        },
        include: { dictamen: true },
      }),
      this.prisma.account.findMany({
        where: { organizationId },
        orderBy: { code: "asc" },
        take: 200,
      }),
      this.prisma.invoice.findMany({
        where: {
          organizationId,
          createdAt: {
            gte: periodBounds(yearMonth).from,
            lte: periodBounds(yearMonth).to,
          },
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
      this.prisma.fiscalAuditNote.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      this.sampleTransactions(organizationId, yearMonth),
    ]);

    const impuestos = await this.validarImpuestos(organizationId, yearMonth);

    const balanceTree = await this.buildPucTree(organizationId, accounts, invoices);

    return {
      hub: "Truth Hub",
      role: "REVISOR_FISCAL",
      yearMonth,
      period: period
        ? {
            id: period.id,
            status: period.status,
            hardLockedAt: period.hardLockedAt?.toISOString() ?? null,
            dictamen: period.dictamen
              ? {
                  id: period.dictamen.id,
                  pdfRef: period.dictamen.pdfRef,
                  signatureHash: period.dictamen.signatureHash,
                  opinion: period.dictamen.opinion,
                  signedAt: period.dictamen.signedAt.toISOString(),
                }
              : null,
          }
        : { id: null, status: "OPEN", hardLockedAt: null, dictamen: null },
      balanceTree,
      sampling: sample,
      impuestosSummary: {
        flaggedCount: impuestos.flagged.length,
        saleTotal: impuestos.totals.sales,
        purchaseTotal: impuestos.totals.purchases,
        dianPrevalidatorRef: impuestos.dianPrevalidator.fileRef,
      },
      auditNotes: notes.map((n) => ({
        id: n.id,
        title: n.title,
        severity: n.severity,
        taggedModule: n.taggedModule,
        invoiceId: n.invoiceId,
        status: n.status,
        createdAt: n.createdAt.toISOString(),
      })),
      policy: {
        samplePct: HARD_RULES.REVISORIA_SAMPLE_PCT,
        retefuentePct: HARD_RULES.REVISORIA_DEFAULT_RETEFUENTE_PCT,
      },
    };
  }

  /** GET impuestos/validar — retenciones omitidas / mal calculadas */
  async validarImpuestos(organizationId: string, yearMonth?: string) {
    const ym = yearMonth || yearMonthNow();
    const { from, to } = periodBounds(ym);
    const invoices = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        createdAt: { gte: from, lte: to },
      },
      orderBy: { createdAt: "asc" },
    });

    const expectedPct = HARD_RULES.REVISORIA_DEFAULT_RETEFUENTE_PCT;
    const tolerance = HARD_RULES.REVISORIA_RETENTION_TOLERANCE_PP;
    const flagged: Array<{
      invoiceId: string;
      number: string;
      type: string;
      amount: number;
      issue: "OMITIDA" | "MAL_CALCULADA";
      expectedRetention: number;
      declaredRetention: number | null;
      declaredPct: number | null;
      detail: string;
    }> = [];

    let sales = 0;
    let purchases = 0;

    for (const inv of invoices) {
      const amount = Number(inv.amount);
      if (inv.type === InvoiceType.RECEIVABLE) sales += amount;
      else purchases += amount;

      const payload = (inv.dianPayload || {}) as DianPayload;
      const expectedRetention = Math.round(amount * (expectedPct / 100) * 100) / 100;

      if (inv.type === InvoiceType.RECEIVABLE) continue;

      const declaredPct =
        typeof payload.retefuentePct === "number" ? payload.retefuentePct : null;
      const declaredAmount =
        typeof payload.retefuenteAmount === "number"
          ? payload.retefuenteAmount
          : declaredPct != null
            ? Math.round(amount * (declaredPct / 100) * 100) / 100
            : null;

      if (payload.retentionOmitida === true || declaredAmount == null) {
        flagged.push({
          invoiceId: inv.id,
          number: inv.number,
          type: inv.type,
          amount,
          issue: "OMITIDA",
          expectedRetention,
          declaredRetention: declaredAmount,
          declaredPct,
          detail: `Retención omitida — esperado ${expectedPct}% = ${expectedRetention}`,
        });
        continue;
      }

      const pctDiff = Math.abs((declaredPct ?? 0) - expectedPct);
      const amtDiff = Math.abs(declaredAmount - expectedRetention);
      if (pctDiff > tolerance || amtDiff > amount * (tolerance / 100)) {
        flagged.push({
          invoiceId: inv.id,
          number: inv.number,
          type: inv.type,
          amount,
          issue: "MAL_CALCULADA",
          expectedRetention,
          declaredRetention: declaredAmount,
          declaredPct,
          detail: `Retención ${declaredPct}% / ${declaredAmount} vs esperado ${expectedPct}% / ${expectedRetention}`,
        });
      }
    }

    const prevalidatorRows = invoices.map((inv) => {
      const payload = (inv.dianPayload || {}) as DianPayload;
      return {
        tipo: inv.type,
        numero: inv.number,
        contraparte: inv.counterparty,
        base: Number(inv.amount),
        retefuentePct: payload.retefuentePct ?? null,
        retefuenteAmount: payload.retefuenteAmount ?? null,
        cufe: inv.dianCufe ?? null,
      };
    });

    const csv = [
      "tipo,numero,contraparte,base,retefuentePct,retefuenteAmount,cufe",
      ...prevalidatorRows.map(
        (r) =>
          `${r.tipo},${r.numero},"${r.contraparte}",${r.base},${r.retefuentePct ?? ""},${r.retefuenteAmount ?? ""},${r.cufe ?? ""}`,
      ),
    ].join("\n");

    const fileHash = createHash("sha256").update(csv).digest("hex");
    const fileRef = `exports/dian/prevalidador-${ym}-${fileHash.slice(0, 8)}.csv`;

    return {
      yearMonth: ym,
      totals: { sales, purchases, invoiceCount: invoices.length },
      flagged,
      dianPrevalidator: {
        fileRef,
        contentHash: fileHash,
        rowCount: prevalidatorRows.length,
        csvPreview: csv.slice(0, 1500),
      },
      message:
        flagged.length > 0
          ? `${flagged.length} factura(s) con retención omitida o mal calculada`
          : "Retenciones dentro de tolerancia DIAN",
    };
  }

  /** GET drill-down/:facturaId — Hilo de Ariadna */
  async drillDown(organizationId: string, facturaId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: facturaId, organizationId },
      include: {
        purchaseOrder: {
          include: {
            goodsReceipts: {
              orderBy: { receivedAt: "desc" },
              take: 5,
            },
            approvedBy: { select: { id: true, name: true, email: true } },
            supplier: { select: { id: true, name: true, nit: true } },
          },
        },
        paymentSchedules: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
        threeWayMatches: {
          orderBy: { evaluatedAt: "desc" },
          take: 3,
        },
        supplier: { select: { id: true, name: true, nit: true } },
        customer: { select: { id: true, name: true, nit: true } },
      },
    });

    if (!invoice) {
      throw new NotFoundException("Factura no encontrada en el ledger");
    }

    const po = invoice.purchaseOrder;
    const meta = (po?.meta || {}) as Record<string, unknown>;
    const budgetSignature =
      (meta.budgetSignature as string | undefined) ||
      (meta.presupuestoFirma as string | undefined) ||
      (po?.approvedBy
        ? `FIRMADO:${po.approvedBy.name}:${po.approvedById}`
        : null);

    const journalHints = await this.prisma.journalLine.findMany({
      where: {
        OR: [
          { costCenterPlate: { not: null } },
        ],
        entry: { organizationId },
      },
      take: 5,
      include: {
        debitAccount: { select: { code: true, name: true } },
        creditAccount: { select: { code: true, name: true } },
        entry: { select: { id: true, memo: true, postedAt: true, status: true } },
      },
      orderBy: { entry: { postedAt: "desc" } },
    });

    const pucLinks = journalHints
      .filter(
        (l) =>
          l.entry.memo?.includes(invoice.number) ||
          Number(l.amount) === Number(invoice.amount),
      )
      .map((l) => ({
        entryId: l.entry.id,
        memo: l.entry.memo,
        debit: `${l.debitAccount.code} ${l.debitAccount.name}`,
        credit: `${l.creditAccount.code} ${l.creditAccount.name}`,
        amount: Number(l.amount),
        postedAt: l.entry.postedAt?.toISOString() ?? null,
      }));

    return {
      invoice: {
        id: invoice.id,
        number: invoice.number,
        type: invoice.type,
        status: invoice.status,
        counterparty: invoice.counterparty,
        amount: Number(invoice.amount),
        dianCufe: invoice.dianCufe,
        createdAt: invoice.createdAt.toISOString(),
        dianPayload: invoice.dianPayload,
      },
      thread: {
        budgetSignature,
        purchaseOrder: po
          ? {
              id: po.id,
              code: po.code,
              status: po.status,
              totalEstimated: Number(po.totalEstimated),
              matchStatus: po.matchStatus,
              approvedBy: po.approvedBy?.name ?? null,
              supplier: po.supplier?.name ?? invoice.supplier?.name ?? null,
            }
          : null,
        warehouseReceipts: (po?.goodsReceipts ?? []).map((g) => ({
          id: g.id,
          code: g.code,
          receivedAt: g.receivedAt.toISOString(),
          quantityTotal: g.quantityTotal,
          notes: g.notes,
        })),
        egreso: invoice.paymentSchedules.map((p) => ({
          id: p.id,
          amount: Number(p.amount),
          status: p.status,
          bankRef: p.bankRef,
          disbursedAt: p.disbursedAt?.toISOString() ?? null,
          queuedAt: p.queuedAt.toISOString(),
        })),
        threeWay: invoice.threeWayMatches.map((m) => ({
          id: m.id,
          status: m.status,
        })),
        pucAccounts: pucLinks,
      },
      message: "Hilo de Ariadna — presupuesto → OC → almacén → egreso",
    };
  }

  /**
   * POST cierre/hard-lock — dictamen PDF + bloqueo absoluto del mes.
   * Único CREATE permitido al Revisor Fiscal sobre el ledger.
   */
  async hardLock(
    organizationId: string,
    actorId: string,
    dto: HardLockDto,
  ) {
    const signatureHash =
      dto.signatureHash ||
      createHash("sha256")
        .update(
          `${organizationId}|${dto.yearMonth}|${dto.pdfRef}|${dto.opinion}|${actorId}|${Date.now()}`,
        )
        .digest("hex");

    const dictamen = await this.prisma.fiscalDictamen.upsert({
      where: {
        organizationId_yearMonth: {
          organizationId,
          yearMonth: dto.yearMonth,
        },
      },
      create: {
        organizationId,
        yearMonth: dto.yearMonth,
        pdfRef: dto.pdfRef,
        signatureHash,
        signedById: actorId,
        opinion: dto.opinion,
        notes: dto.notes,
        meta: { dictamenBody: dto.dictamenBody?.slice(0, 4000) },
      },
      update: {
        pdfRef: dto.pdfRef,
        signatureHash,
        signedById: actorId,
        signedAt: new Date(),
        opinion: dto.opinion,
        notes: dto.notes,
        meta: { dictamenBody: dto.dictamenBody?.slice(0, 4000) },
      },
    });

    const period = await this.prisma.accountingPeriod.upsert({
      where: {
        organizationId_yearMonth: {
          organizationId,
          yearMonth: dto.yearMonth,
        },
      },
      create: {
        organizationId,
        yearMonth: dto.yearMonth,
        status: AccountingPeriodStatus.HARD_LOCKED,
        hardLockedAt: new Date(),
        hardLockedById: actorId,
        dictamenId: dictamen.id,
        meta: { immutable: true },
      },
      update: {
        status: AccountingPeriodStatus.HARD_LOCKED,
        hardLockedAt: new Date(),
        hardLockedById: actorId,
        dictamenId: dictamen.id,
        meta: { immutable: true },
      },
    });

    this.logger.warn(
      `HARD LOCK ${dto.yearMonth} org=${organizationId} by=${actorId}`,
    );

    return {
      periodId: period.id,
      yearMonth: period.yearMonth,
      status: period.status,
      hardLockedAt: period.hardLockedAt?.toISOString(),
      dictamen: {
        id: dictamen.id,
        pdfRef: dictamen.pdfRef,
        signatureHash: dictamen.signatureHash,
        opinion: dictamen.opinion,
      },
      message:
        "Hard Lock aplicado — periodo inmutable para toda la organización",
    };
  }

  /** Rechaza mutaciones si el periodo está HARD_LOCKED */
  async assertPeriodWritable(
    organizationId: string,
    at: Date = new Date(),
  ): Promise<void> {
    const yearMonth = `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}`;
    const period = await this.prisma.accountingPeriod.findUnique({
      where: {
        organizationId_yearMonth: { organizationId, yearMonth },
      },
    });
    if (period?.status === AccountingPeriodStatus.HARD_LOCKED) {
      throw new ForbiddenException({
        statusCode: 403,
        error: "ACCOUNTING_PERIOD_HARD_LOCKED",
        message: `Periodo ${yearMonth} bajo Hard Lock de Revisoría — creación/edición/borrado prohibidos`,
        yearMonth,
      });
    }
  }

  /** Helper puro para tests unitarios sin DB */
  static isHardLockedStatus(status: string | null | undefined): boolean {
    return status === AccountingPeriodStatus.HARD_LOCKED;
  }

  async createAuditNote(
    organizationId: string,
    actorId: string,
    dto: FiscalAuditNoteDto,
  ) {
    const note = await this.prisma.fiscalAuditNote.create({
      data: {
        organizationId,
        invoiceId: dto.invoiceId,
        yearMonth: dto.yearMonth || yearMonthNow(),
        taggedModule: "CONTABILIDAD",
        title: dto.title,
        body: dto.body,
        severity: dto.severity,
        createdById: actorId,
      },
    });
    return {
      id: note.id,
      title: note.title,
      taggedModule: note.taggedModule,
      severity: note.severity,
      message: "Nota de auditoría etiquetada a Contabilidad",
    };
  }

  async sampleTransactions(organizationId: string, yearMonth: string) {
    const { from, to } = periodBounds(yearMonth);
    const invoices = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        createdAt: { gte: from, lte: to },
      },
      select: {
        id: true,
        number: true,
        type: true,
        amount: true,
        counterparty: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const pct = HARD_RULES.REVISORIA_SAMPLE_PCT / 100;
    const target = Math.max(1, Math.ceil(invoices.length * pct));
    const shuffled = [...invoices].sort(() => Math.random() - 0.5);
    const picked = shuffled.slice(0, Math.min(target, invoices.length));

    return {
      yearMonth,
      population: invoices.length,
      samplePct: HARD_RULES.REVISORIA_SAMPLE_PCT,
      sampleSize: picked.length,
      items: picked.map((i) => ({
        id: i.id,
        number: i.number,
        type: i.type,
        amount: Number(i.amount),
        counterparty: i.counterparty,
        createdAt: i.createdAt.toISOString(),
      })),
    };
  }

  private async buildPucTree(
    organizationId: string,
    accounts: Array<{ id: string; code: string; name: string; type: string }>,
    invoices: Array<{
      id: string;
      number: string;
      amount: unknown;
      type: string;
      counterparty: string;
    }>,
  ) {
    const lines = await this.prisma.journalLine.findMany({
      where: { entry: { organizationId, status: "POSTED" } },
      take: 500,
      include: {
        debitAccount: { select: { id: true, code: true } },
        creditAccount: { select: { id: true, code: true } },
      },
    });

    const balanceByAccount = new Map<string, number>();
    for (const l of lines) {
      const amt = Number(l.amount);
      balanceByAccount.set(
        l.debitAccountId,
        (balanceByAccount.get(l.debitAccountId) || 0) + amt,
      );
      balanceByAccount.set(
        l.creditAccountId,
        (balanceByAccount.get(l.creditAccountId) || 0) - amt,
      );
    }

    return accounts.map((a) => ({
      id: a.id,
      code: a.code,
      name: a.name,
      type: a.type,
      balance: balanceByAccount.get(a.id) || 0,
      invoices: invoices
        .filter(() => true)
        .slice(0, 3)
        .map((inv) => ({
          id: inv.id,
          number: inv.number,
          amount: Number(inv.amount),
          type: inv.type,
          counterparty: inv.counterparty,
        })),
    }));
  }

  /** Exportación universal (CSV / JSON) */
  async exportLedger(
    organizationId: string,
    format: "csv" | "json" | "xlsx",
    yearMonth?: string,
  ) {
    const ym = yearMonth || yearMonthNow();
    const impuestos = await this.validarImpuestos(organizationId, ym);
    const sample = await this.sampleTransactions(organizationId, ym);

    if (format === "json") {
      return {
        format: "json",
        yearMonth: ym,
        payload: { impuestos, sample },
      };
    }

    const csv = impuestos.dianPrevalidator.csvPreview;
    return {
      format: format === "xlsx" ? "xlsx-csv-compat" : "csv",
      yearMonth: ym,
      fileName: `truth-hub-${ym}.${format === "xlsx" ? "csv" : format}`,
      content: csv,
      contentHash: impuestos.dianPrevalidator.contentHash,
    };
  }
}

/** Utilidad pura — usada en specs sin Nest DI */
export function rejectMutationIfHardLocked(
  periodStatus: string | null | undefined,
  yearMonth: string,
): void {
  if (RevisoriaFiscalService.isHardLockedStatus(periodStatus)) {
    throw new ForbiddenException({
      statusCode: 403,
      error: "ACCOUNTING_PERIOD_HARD_LOCKED",
      message: `Periodo ${yearMonth} bajo Hard Lock de Revisoría — creación/edición/borrado prohibidos`,
      yearMonth,
    });
  }
}

export function newDictamenCode(): string {
  return `DIC-${Date.now().toString(36).toUpperCase()}-${randomBytes(2).toString("hex").toUpperCase()}`;
}
