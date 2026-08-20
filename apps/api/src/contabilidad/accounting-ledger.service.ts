import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  AccountingPeriodStatus,
  AccountType,
  FleetModule,
  JournalEntryStatus,
} from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";

export type DoubleEntryInput = {
  organizationId: string;
  memo: string;
  debitCode: string;
  creditCode: string;
  amount: number;
  sourceEvent: string;
  meta?: Record<string, unknown>;
  costCenterPlate?: string | null;
};

const DEFAULT_ACCOUNTS: Array<{
  code: string;
  name: string;
  type: AccountType;
}> = [
  { code: "1110", name: "Bancos", type: AccountType.ASSET },
  { code: "1305", name: "Clientes (CxC)", type: AccountType.ASSET },
  { code: "1435", name: "Inventario de repuestos", type: AccountType.ASSET },
  { code: "2205", name: "Proveedores (CxP)", type: AccountType.LIABILITY },
  { code: "2505", name: "Salarios por pagar", type: AccountType.LIABILITY },
  { code: "4135", name: "Ingresos transporte", type: AccountType.INCOME },
  { code: "5105", name: "Mantenimiento flota", type: AccountType.EXPENSE },
  { code: "5145", name: "Peajes y gastos de ruta", type: AccountType.EXPENSE },
  { code: "5150", name: "Combustible / tanqueo", type: AccountType.EXPENSE },
  { code: "5160", name: "Depreciación flota", type: AccountType.EXPENSE },
  { code: "1592", name: "Depreciación acumulada vehículos", type: AccountType.ASSET },
  { code: "5205", name: "Gasto de nómina", type: AccountType.EXPENSE },
  { code: "6135", name: "Costo de ventas / consumo inventario", type: AccountType.EXPENSE },
];

/**
 * Libro mayor NIIF continuo — asientos de partida doble automáticos.
 */
@Injectable()
export class AccountingLedgerService {
  private readonly logger = new Logger(AccountingLedgerService.name);

  constructor(private prisma: PrismaService) {}

  async ensureChartOfAccounts(organizationId: string) {
    for (const acc of DEFAULT_ACCOUNTS) {
      await this.prisma.account.upsert({
        where: {
          organizationId_code: { organizationId, code: acc.code },
        },
        create: {
          organizationId,
          code: acc.code,
          name: acc.name,
          type: acc.type,
        },
        update: { name: acc.name },
      });
    }
  }

  async resolveAccount(organizationId: string, code: string) {
    await this.ensureChartOfAccounts(organizationId);
    const acc = await this.prisma.account.findUnique({
      where: { organizationId_code: { organizationId, code } },
    });
    if (!acc) throw new Error(`ACCOUNT_MISSING_${code}`);
    return acc;
  }

  async postDoubleEntry(input: DoubleEntryInput) {
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      this.logger.warn(`[LEDGER] monto inválido para ${input.sourceEvent}`);
      return null;
    }

    const [debit, credit] = await Promise.all([
      this.resolveAccount(input.organizationId, input.debitCode),
      this.resolveAccount(input.organizationId, input.creditCode),
    ]);

    const entry = await this.prisma.journalEntry.create({
      data: {
        organizationId: input.organizationId,
        memo: input.memo,
        status: JournalEntryStatus.POSTED,
        postedAt: new Date(),
        lines: {
          create: [
            {
              debitAccountId: debit.id,
              creditAccountId: credit.id,
              amount,
              costCenterPlate: input.costCenterPlate?.toUpperCase() || null,
            },
          ],
        },
      },
      include: {
        lines: {
          include: { debitAccount: true, creditAccount: true },
        },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId: input.organizationId,
        action: "JOURNAL_POSTED",
        entity: "JournalEntry",
        entityId: entry.id,
        module: FleetModule.CONTABILIDAD,
        meta: {
          sourceEvent: input.sourceEvent,
          debitCode: input.debitCode,
          creditCode: input.creditCode,
          amount,
          ...input.meta,
        },
      },
    });

    this.logger.log(
      `[NIIF] ${input.sourceEvent} → asiento ${entry.id} Dr ${input.debitCode} / Cr ${input.creditCode} $${amount}`,
    );
    return entry;
  }

  listAccounts(organizationId: string) {
    return this.prisma.account.findMany({
      where: { organizationId },
      orderBy: { code: "asc" },
    });
  }

  listJournalEntries(organizationId: string) {
    return this.prisma.journalEntry.findMany({
      where: { organizationId },
      include: {
        lines: {
          include: {
            debitAccount: true,
            creditAccount: true,
          },
        },
      },
      orderBy: [{ postedAt: "desc" }, { createdAt: "desc" }],
    });
  }

  /** Shape compatible con CRM web (`/accounting/journal`). */
  async listJournalForUi(organizationId: string) {
    const entries = await this.listJournalEntries(organizationId);
    return entries.map((e, idx) => ({
      id: e.id,
      number: `AS-${String(entries.length - idx).padStart(4, "0")}`,
      description: e.memo,
      status: e.status,
      postedAt: e.postedAt,
      createdAt: e.createdAt,
      lines: e.lines.flatMap((l) => [
        {
          account: {
            code: l.debitAccount.code,
            name: l.debitAccount.name,
          },
          debit: Number(l.amount),
          credit: 0,
        },
        {
          account: {
            code: l.creditAccount.code,
            name: l.creditAccount.name,
          },
          debit: 0,
          credit: Number(l.amount),
        },
      ]),
    }));
  }

  async createAccount(
    organizationId: string,
    data: { code: string; name: string; type: string },
  ) {
    const code = data.code.trim();
    const name = data.name.trim();
    if (!code || !name) {
      throw new BadRequestException("Código y nombre de cuenta requeridos");
    }
    const type = (Object.values(AccountType) as string[]).includes(data.type)
      ? (data.type as AccountType)
      : AccountType.ASSET;

    return this.prisma.account.create({
      data: { organizationId, code, name, type },
    });
  }

  /**
   * Asiento manual desde CRM: N líneas T (débito o crédito por cuenta)
   * → pares NIIF JournalLine (debitAccount / creditAccount / amount).
   */
  async createManualEntry(
    organizationId: string,
    data: {
      description?: string;
      memo?: string;
      lines: { accountId: string; debit?: number; credit?: number }[];
    },
  ) {
    await this.assertPeriodWritable(organizationId);
    const memo = (data.memo || data.description || "").trim();
    if (!memo) throw new BadRequestException("Descripción del asiento requerida");
    if (!data.lines?.length) {
      throw new BadRequestException("El asiento requiere líneas");
    }

    const legs = data.lines.map((l) => ({
      accountId: l.accountId,
      debit: Number(l.debit || 0),
      credit: Number(l.credit || 0),
    }));
    for (const l of legs) {
      if (!l.accountId) {
        throw new BadRequestException("Cada línea debe tener cuenta PUC");
      }
      if (l.debit > 0 && l.credit > 0) {
        throw new BadRequestException(
          "Una línea no puede tener débito y crédito a la vez",
        );
      }
    }

    const totalDebit = legs.reduce((s, l) => s + l.debit, 0);
    const totalCredit = legs.reduce((s, l) => s + l.credit, 0);
    if (totalDebit <= 0 || Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new BadRequestException("El asiento no cuadra (débito ≠ crédito)");
    }

    const pairs = pairDoubleEntry(legs);
    const accountIds = [...new Set(pairs.flatMap((p) => [p.debitAccountId, p.creditAccountId]))];
    const accounts = await this.prisma.account.findMany({
      where: { organizationId, id: { in: accountIds } },
    });
    if (accounts.length !== accountIds.length) {
      throw new NotFoundException("Cuenta contable no encontrada");
    }

    const entry = await this.prisma.journalEntry.create({
      data: {
        organizationId,
        memo,
        status: JournalEntryStatus.POSTED,
        postedAt: new Date(),
        lines: {
          create: pairs.map((p) => ({
            debitAccountId: p.debitAccountId,
            creditAccountId: p.creditAccountId,
            amount: p.amount,
          })),
        },
      },
      include: {
        lines: {
          include: { debitAccount: true, creditAccount: true },
        },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId,
        action: "JOURNAL_POSTED",
        entity: "JournalEntry",
        entityId: entry.id,
        module: FleetModule.CONTABILIDAD,
        meta: { sourceEvent: "manual.ui", amount: totalDebit, pairs: pairs.length },
      },
    });

    const [mapped] = await this.listJournalForUi(organizationId).then((rows) =>
      rows.filter((r) => r.id === entry.id),
    );
    return mapped ?? entry;
  }

  async closeMonth(organizationId: string, yearMonth?: string) {
    const ym =
      yearMonth ||
      `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    if (!/^\d{4}-\d{2}$/.test(ym)) {
      throw new BadRequestException("Periodo inválido (YYYY-MM)");
    }
    const existing = await this.prisma.accountingPeriod.findUnique({
      where: { organizationId_yearMonth: { organizationId, yearMonth: ym } },
    });
    if (existing?.status === AccountingPeriodStatus.HARD_LOCKED) {
      throw new ForbiddenException(
        `Periodo ${ym} bajo Hard Lock de Revisoría — no se puede reabrir ni recerrar`,
      );
    }
    const period = await this.prisma.accountingPeriod.upsert({
      where: { organizationId_yearMonth: { organizationId, yearMonth: ym } },
      create: {
        organizationId,
        yearMonth: ym,
        status: AccountingPeriodStatus.SOFT_CLOSED,
      },
      update: { status: AccountingPeriodStatus.SOFT_CLOSED },
    });
    await this.prisma.auditLog.create({
      data: {
        organizationId,
        action: "ACCOUNTING_PERIOD_SOFT_CLOSED",
        entity: "AccountingPeriod",
        entityId: period.id,
        module: FleetModule.CONTABILIDAD,
        meta: { yearMonth: ym },
      },
    });
    return {
      yearMonth: ym,
      status: period.status,
      message: `Periodo ${ym} cerrado — asientos del mes bloqueados`,
    };
  }

  async currentPeriod(organizationId: string) {
    const yearMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    const period = await this.prisma.accountingPeriod.findUnique({
      where: { organizationId_yearMonth: { organizationId, yearMonth } },
    });
    return {
      yearMonth,
      status: period?.status ?? AccountingPeriodStatus.OPEN,
      hardLockedAt: period?.hardLockedAt ?? null,
    };
  }

  private async assertPeriodWritable(organizationId: string, at = new Date()) {
    const yearMonth = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}`;
    const period = await this.prisma.accountingPeriod.findUnique({
      where: { organizationId_yearMonth: { organizationId, yearMonth } },
    });
    if (!period) return;
    if (period.status === AccountingPeriodStatus.HARD_LOCKED) {
      throw new ForbiddenException(
        `Periodo ${yearMonth} bajo Hard Lock de Revisoría`,
      );
    }
    if (period.status === AccountingPeriodStatus.SOFT_CLOSED) {
      throw new ForbiddenException(
        `Periodo ${yearMonth} cerrado — no se publican ni anulan asientos`,
      );
    }
  }

  async voidEntry(organizationId: string, id: string) {
    await this.assertPeriodWritable(organizationId);
    const e = await this.prisma.journalEntry.findFirst({
      where: { id, organizationId },
    });
    if (!e) throw new NotFoundException("Asiento no encontrado");
    if (e.status === JournalEntryStatus.VOID) {
      throw new BadRequestException("El asiento ya está anulado");
    }

    return this.prisma.journalEntry.update({
      where: { id },
      data: { status: JournalEntryStatus.VOID },
      include: {
        lines: {
          include: { debitAccount: true, creditAccount: true },
        },
      },
    });
  }

  async trialBalance(organizationId: string) {
    await this.ensureChartOfAccounts(organizationId);
    const accounts = await this.prisma.account.findMany({
      where: { organizationId },
      orderBy: { code: "asc" },
    });

    const posted = await this.prisma.journalLine.findMany({
      where: { entry: { organizationId, status: JournalEntryStatus.POSTED } },
      select: {
        amount: true,
        debitAccountId: true,
        creditAccountId: true,
      },
    });

    return accounts.map((a) => {
      const debit = posted
        .filter((l) => l.debitAccountId === a.id)
        .reduce((s, l) => s + Number(l.amount), 0);
      const credit = posted
        .filter((l) => l.creditAccountId === a.id)
        .reduce((s, l) => s + Number(l.amount), 0);
      return {
        id: a.id,
        code: a.code,
        name: a.name,
        type: a.type,
        debit,
        credit,
        balance: debit - credit,
      };
    });
  }
}

function pairDoubleEntry(
  legs: Array<{ accountId: string; debit: number; credit: number }>,
): Array<{ debitAccountId: string; creditAccountId: string; amount: number }> {
  const debits = legs
    .filter((l) => l.debit > 0)
    .map((l) => ({ accountId: l.accountId, remaining: l.debit }));
  const credits = legs
    .filter((l) => l.credit > 0)
    .map((l) => ({ accountId: l.accountId, remaining: l.credit }));
  if (!debits.length || !credits.length) {
    throw new BadRequestException(
      "Se requiere al menos una línea débito y una crédito",
    );
  }
  const pairs: Array<{
    debitAccountId: string;
    creditAccountId: string;
    amount: number;
  }> = [];
  let i = 0;
  let j = 0;
  while (i < debits.length && j < credits.length) {
    const d = debits[i];
    const c = credits[j];
    const amount = Math.min(d.remaining, c.remaining);
    if (amount > 0.009) {
      pairs.push({
        debitAccountId: d.accountId,
        creditAccountId: c.accountId,
        amount: Math.round(amount * 100) / 100,
      });
    }
    d.remaining = Math.round((d.remaining - amount) * 100) / 100;
    c.remaining = Math.round((c.remaining - amount) * 100) / 100;
    if (d.remaining <= 0.009) i += 1;
    if (c.remaining <= 0.009) j += 1;
  }
  if (!pairs.length) {
    throw new BadRequestException("No se pudieron armar pares de partida doble");
  }
  return pairs;
}
