import { BadRequestException, Injectable } from "@nestjs/common";
import { JournalEntryStatus } from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AccountingService {
  constructor(private prisma: PrismaService) {}

  listAccounts(organizationId: string) {
    return this.prisma.account.findMany({
      where: { organizationId },
      orderBy: { code: "asc" },
    });
  }

  listEntries(organizationId: string) {
    return this.prisma.journalEntry.findMany({
      where: { organizationId },
      include: {
        lines: { include: { account: true } },
      },
      orderBy: { entryDate: "desc" },
    });
  }

  async trialBalance(organizationId: string) {
    const accounts = await this.prisma.account.findMany({
      where: { organizationId },
      include: {
        lines: {
          where: { entry: { status: JournalEntryStatus.POSTED } },
        },
      },
      orderBy: { code: "asc" },
    });

    return accounts.map((a) => {
      const debit = a.lines.reduce((s, l) => s + Number(l.debit), 0);
      const credit = a.lines.reduce((s, l) => s + Number(l.credit), 0);
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

  async createEntry(
    organizationId: string,
    data: {
      description: string;
      lines: { accountId: string; debit: number; credit: number; memo?: string }[];
    },
  ) {
    const totalDebit = data.lines.reduce((s, l) => s + Number(l.debit || 0), 0);
    const totalCredit = data.lines.reduce((s, l) => s + Number(l.credit || 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new BadRequestException("El asiento no cuadra (débito ≠ crédito)");
    }

    const count = await this.prisma.journalEntry.count({
      where: { organizationId },
    });

    return this.prisma.journalEntry.create({
      data: {
        number: `AS-2026-${String(count + 1).padStart(3, "0")}`,
        description: data.description,
        status: JournalEntryStatus.POSTED,
        organizationId,
        lines: {
          create: data.lines.map((l) => ({
            accountId: l.accountId,
            debit: l.debit || 0,
            credit: l.credit || 0,
            memo: l.memo,
          })),
        },
      },
      include: { lines: { include: { account: true } } },
    });
  }

  createAccount(
    organizationId: string,
    data: { code: string; name: string; type: string },
  ) {
    return this.prisma.account.create({
      data: {
        organizationId,
        code: data.code,
        name: data.name,
        type: data.type as never,
      },
    });
  }

  async voidEntry(organizationId: string, id: string) {
    const e = await this.prisma.journalEntry.findFirst({
      where: { id, organizationId },
    });
    if (!e) throw new BadRequestException("Asiento no encontrado");
    return this.prisma.journalEntry.update({
      where: { id },
      data: { status: JournalEntryStatus.VOID },
      include: { lines: { include: { account: true } } },
    });
  }
}
