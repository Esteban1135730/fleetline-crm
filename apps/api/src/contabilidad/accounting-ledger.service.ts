import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { AccountType, FleetModule, JournalEntryStatus } from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";

export type DoubleEntryInput = {
  organizationId: string;
  memo: string;
  debitCode: string;
  creditCode: string;
  amount: number;
  sourceEvent: string;
  meta?: Record<string, unknown>;
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
   * Asiento manual desde CRM: líneas con debit/credit por cuenta
   * → una JournalLine NIIF (débito / crédito / monto).
   */
  async createManualEntry(
    organizationId: string,
    data: {
      description?: string;
      memo?: string;
      lines: { accountId: string; debit?: number; credit?: number }[];
    },
  ) {
    const memo = (data.memo || data.description || "").trim();
    if (!memo) throw new BadRequestException("Descripción del asiento requerida");
    if (!data.lines?.length) {
      throw new BadRequestException("El asiento requiere líneas");
    }

    const debitLine = data.lines.find((l) => Number(l.debit || 0) > 0);
    const creditLine = data.lines.find((l) => Number(l.credit || 0) > 0);
    if (!debitLine || !creditLine) {
      throw new BadRequestException(
        "Se requiere una línea débito y una línea crédito",
      );
    }

    const debitAmt = Number(debitLine.debit || 0);
    const creditAmt = Number(creditLine.credit || 0);
    if (Math.abs(debitAmt - creditAmt) > 0.01) {
      throw new BadRequestException("El asiento no cuadra (débito ≠ crédito)");
    }
    if (debitLine.accountId === creditLine.accountId) {
      throw new BadRequestException("Débito y crédito deben ser cuentas distintas");
    }

    const [debitAcc, creditAcc] = await Promise.all([
      this.prisma.account.findFirst({
        where: { id: debitLine.accountId, organizationId },
      }),
      this.prisma.account.findFirst({
        where: { id: creditLine.accountId, organizationId },
      }),
    ]);
    if (!debitAcc || !creditAcc) {
      throw new NotFoundException("Cuenta contable no encontrada");
    }

    const entry = await this.prisma.journalEntry.create({
      data: {
        organizationId,
        memo,
        status: JournalEntryStatus.POSTED,
        postedAt: new Date(),
        lines: {
          create: [
            {
              debitAccountId: debitAcc.id,
              creditAccountId: creditAcc.id,
              amount: debitAmt,
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
        organizationId,
        action: "JOURNAL_POSTED",
        entity: "JournalEntry",
        entityId: entry.id,
        module: FleetModule.CONTABILIDAD,
        meta: { sourceEvent: "manual.ui", amount: debitAmt },
      },
    });

    const [mapped] = await this.listJournalForUi(organizationId).then((rows) =>
      rows.filter((r) => r.id === entry.id),
    );
    return mapped ?? entry;
  }

  async voidEntry(organizationId: string, id: string) {
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
