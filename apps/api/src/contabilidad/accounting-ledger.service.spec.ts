import { AccountingLedgerService } from "./accounting-ledger.service";
import { ContabilidadEventListener } from "./contabilidad-event.listener";
import { JournalEntryStatus } from "@fsg/db";

describe("Contabilidad — asientos NIIF desde eventos", () => {
  function buildLedger(overrides?: {
    create?: jest.Mock;
    upsert?: jest.Mock;
    findUnique?: jest.Mock;
    auditCreate?: jest.Mock;
  }) {
    const debit = {
      id: "acc-2205",
      code: "2205",
      name: "Proveedores",
      type: "LIABILITY",
    };
    const credit = {
      id: "acc-1110",
      code: "1110",
      name: "Bancos",
      type: "ASSET",
    };

    const prisma = {
      account: {
        upsert: overrides?.upsert ?? jest.fn().mockResolvedValue({}),
        findUnique:
          overrides?.findUnique ??
          jest.fn().mockImplementation(({ where }) => {
            const code = where?.organizationId_code?.code;
            if (code === "2205") return Promise.resolve(debit);
            if (code === "1110") return Promise.resolve(credit);
            return Promise.resolve(null);
          }),
      },
      journalEntry: {
        create:
          overrides?.create ??
          jest.fn().mockResolvedValue({
            id: "je-1",
            status: JournalEntryStatus.POSTED,
            lines: [
              {
                amount: 2_500_000,
                debitAccount: debit,
                creditAccount: credit,
              },
            ],
          }),
      },
      auditLog: {
        create: overrides?.auditCreate ?? jest.fn().mockResolvedValue({}),
      },
    };

    return {
      ledger: new AccountingLedgerService(prisma as never),
      prisma,
      debit,
      credit,
    };
  }

  it("al recibir payment.disbursed genera asiento NIIF Dr 2205 / Cr 1110", async () => {
    const { ledger, prisma } = buildLedger();
    const listener = new ContabilidadEventListener(ledger);

    const entry = await listener.onPaymentDisbursed({
      organizationId: "org-1",
      amount: 2_500_000,
      paymentScheduleIds: ["ps-1"],
      invoiceIds: ["inv-1"],
      bankRef: "H2H-TEST",
    });

    expect(entry).toBeTruthy();
    expect(prisma.journalEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: "org-1",
          status: JournalEntryStatus.POSTED,
          memo: expect.stringContaining("NIIF pago proveedores"),
          lines: {
            create: [
              expect.objectContaining({
                debitAccountId: "acc-2205",
                creditAccountId: "acc-1110",
                amount: 2_500_000,
              }),
            ],
          },
        }),
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "JOURNAL_POSTED",
          entity: "JournalEntry",
          meta: expect.objectContaining({
            sourceEvent: "payment.disbursed",
            bankRef: "H2H-TEST",
          }),
        }),
      }),
    );
  });

  it("ignora montos no positivos", async () => {
    const { ledger, prisma } = buildLedger();
    const listener = new ContabilidadEventListener(ledger);

    const entry = await listener.onPaymentDisbursed({
      organizationId: "org-1",
      amount: 0,
    });

    expect(entry).toBeNull();
    expect(prisma.journalEntry.create).not.toHaveBeenCalled();
  });
});
