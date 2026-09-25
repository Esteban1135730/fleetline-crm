import {
  InvoiceStatus,
  InvoiceType,
  JournalEntryStatus,
} from "@fsg/db";
import type { PrismaService } from "../prisma/prisma.service";

const CXP_OPEN: InvoiceStatus[] = [
  InvoiceStatus.ISSUED,
  InvoiceStatus.OVERDUE,
  InvoiceStatus.CLEARED_FOR_PAYMENT,
  InvoiceStatus.CAUSED,
];

/** Misma liquidez que Tesorería: bancos 1110 + CxC abierta − CxP abierta. */
export async function liquiditySnapshot(
  prisma: PrismaService,
  organizationId: string,
) {
  const invoices = await prisma.invoice.findMany({
    where: { organizationId },
    select: { type: true, status: true, amount: true },
  });

  const cxcOpen = invoices
    .filter(
      (i) =>
        i.type === InvoiceType.RECEIVABLE &&
        (i.status === InvoiceStatus.ISSUED ||
          i.status === InvoiceStatus.OVERDUE),
    )
    .reduce((sum, i) => sum + Number(i.amount), 0);

  const cxpOpen = invoices
    .filter(
      (i) => i.type === InvoiceType.PAYABLE && CXP_OPEN.includes(i.status),
    )
    .reduce((sum, i) => sum + Number(i.amount), 0);

  const bank = await prisma.account.findFirst({
    where: { organizationId, code: "1110" },
    select: { id: true },
  });

  let bankBalance = 0;
  if (bank) {
    const lines = await prisma.journalLine.findMany({
      where: {
        entry: { organizationId, status: JournalEntryStatus.POSTED },
        OR: [{ debitAccountId: bank.id }, { creditAccountId: bank.id }],
      },
      select: { amount: true, debitAccountId: true, creditAccountId: true },
    });
    bankBalance = lines.reduce((sum, line) => {
      const amt = Number(line.amount);
      if (line.debitAccountId === bank.id) return sum + amt;
      if (line.creditAccountId === bank.id) return sum - amt;
      return sum;
    }, 0);
    bankBalance = Math.max(0, bankBalance);
  }

  return {
    bankBalance,
    cxcOpen,
    cxpOpen,
    netLiquidity: bankBalance + cxcOpen - cxpOpen,
    hasBankAccount: Boolean(bank),
  };
}
