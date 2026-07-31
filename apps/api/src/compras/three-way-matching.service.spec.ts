import { ThreeWayMatchingService } from "./three-way-matching.service";
import { THREE_WAY_TOLERANCE } from "./three-way.types";

describe("ThreeWayMatchingService — antifraude", () => {
  const service = new ThreeWayMatchingService(
    {} as never,
    { emitPurchaseMatchApproved: jest.fn(), emitPurchaseMatchRejected: jest.fn() } as never,
  );

  it("caso exitoso: factura = OC y recepción dentro de tolerancia → APPROVED", () => {
    const result = service.evaluate({
      poTotal: 1_000_000,
      poQty: 100,
      receiptQty: 100,
      invoiceTotal: 1_000_000,
    });

    expect(result.outcome).toBe("APPROVED");
    expect(result.reasons).toEqual([]);
    expect(result.priceDelta).toBe(0);
    expect(result.qtyDelta).toBe(0);
    expect(result.tolerances).toEqual(THREE_WAY_TOLERANCE);
  });

  it("permite ±2% en cantidad (98 de 100)", () => {
    const result = service.evaluate({
      poTotal: 500_000,
      poQty: 100,
      receiptQty: 98,
      invoiceTotal: 500_000,
    });
    expect(result.outcome).toBe("APPROVED");
  });

  it("caso discrepancia: precio superior a la OC → DISCREPANCY_REJECTED", () => {
    const result = service.evaluate({
      poTotal: 1_000_000,
      poQty: 50,
      receiptQty: 50,
      invoiceTotal: 1_150_000,
    });

    expect(result.outcome).toBe("DISCREPANCY_REJECTED");
    expect(result.priceDelta).toBe(150_000);
    expect(result.reasons.some((r) => r.startsWith("PRICE_MISMATCH"))).toBe(
      true,
    );
  });

  it("rechaza si cantidad fuera de tolerancia (>2%)", () => {
    const result = service.evaluate({
      poTotal: 100_000,
      poQty: 100,
      receiptQty: 90,
      invoiceTotal: 100_000,
    });
    expect(result.outcome).toBe("DISCREPANCY_REJECTED");
    expect(result.reasons.some((r) => r.startsWith("QTY_MISMATCH"))).toBe(true);
  });

  it("processMatch persiste APPROVED y libera factura a Tesorería", async () => {
    const kafka = {
      emitPurchaseMatchApproved: jest.fn().mockResolvedValue(undefined),
      emitPurchaseMatchRejected: jest.fn().mockResolvedValue(undefined),
    };

    const po = {
      id: "po-1",
      code: "OC-00001",
      organizationId: "org-1",
      totalEstimated: 1000,
      lines: [
        {
          description: "Filtro aceite",
          quantity: 10,
          unitCost: 100,
          lineTotal: 1000,
        },
      ],
      supplier: { name: "Repuestos SA" },
    };

    const receipt = {
      id: "gr-1",
      code: "REM-00001",
      purchaseOrderId: "po-1",
      quantityTotal: 10,
      payload: { lines: [{ description: "Filtro aceite", quantity: 10 }] },
    };

    const invoice = {
      id: "inv-1",
      number: "FP-2026-0001",
      amount: 1000,
      dianPayload: {
        lines: [{ description: "Filtro aceite", quantity: 10, unitCost: 100 }],
      },
    };

    const prisma = {
      purchaseOrder: {
        findFirst: jest.fn().mockResolvedValue(po),
        update: jest.fn().mockResolvedValue({}),
      },
      goodsReceipt: {
        findFirst: jest.fn().mockResolvedValue(receipt),
      },
      invoice: {
        findFirst: jest.fn().mockResolvedValue(invoice),
        update: jest.fn().mockResolvedValue({}),
      },
      threeWayMatch: {
        create: jest.fn().mockResolvedValue({ id: "match-1" }),
      },
      $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    };

    const svc = new ThreeWayMatchingService(prisma as never, kafka as never);
    const out = await svc.processMatch({
      organizationId: "org-1",
      purchaseOrderId: "po-1",
      goodsReceiptId: "gr-1",
      invoiceId: "inv-1",
    });

    expect(out.status).toBe("APPROVED");
    expect(out.invoiceClearedForPayment).toBe(true);
    expect(out.invoiceBlocked).toBe(false);
    expect(kafka.emitPurchaseMatchApproved).toHaveBeenCalledWith(
      expect.objectContaining({
        matchId: "match-1",
        purchaseOrderId: "po-1",
        invoiceId: "inv-1",
      }),
    );
    expect(kafka.emitPurchaseMatchRejected).not.toHaveBeenCalled();
  });

  it("processMatch con sobreprecio → DISCREPANCY_REJECTED y bloqueo de factura", async () => {
    const kafka = {
      emitPurchaseMatchApproved: jest.fn(),
      emitPurchaseMatchRejected: jest.fn().mockResolvedValue(undefined),
    };

    const po = {
      id: "po-2",
      code: "OC-00002",
      organizationId: "org-1",
      totalEstimated: 1000,
      lines: [
        {
          description: "Llanta",
          quantity: 4,
          unitCost: 250,
          lineTotal: 1000,
        },
      ],
      supplier: null,
    };

    const receipt = {
      id: "gr-2",
      code: "REM-00002",
      purchaseOrderId: "po-2",
      quantityTotal: 4,
      payload: {},
    };

    const invoice = {
      id: "inv-2",
      number: "FP-FRAUD",
      amount: 1500,
      dianPayload: {},
    };

    const prisma = {
      purchaseOrder: {
        findFirst: jest.fn().mockResolvedValue(po),
        update: jest.fn().mockResolvedValue({}),
      },
      goodsReceipt: {
        findFirst: jest.fn().mockResolvedValue(receipt),
      },
      invoice: {
        findFirst: jest.fn().mockResolvedValue(invoice),
        update: jest.fn().mockResolvedValue({}),
      },
      threeWayMatch: {
        create: jest.fn().mockResolvedValue({ id: "match-2" }),
      },
      $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    };

    const svc = new ThreeWayMatchingService(prisma as never, kafka as never);
    const out = await svc.processMatch({
      organizationId: "org-1",
      purchaseOrderId: "po-2",
      goodsReceiptId: "gr-2",
      invoiceId: "inv-2",
    });

    expect(out.status).toBe("DISCREPANCY_REJECTED");
    expect(out.invoiceBlocked).toBe(true);
    expect(out.invoiceClearedForPayment).toBe(false);
    expect(out.reasons.some((r) => r.includes("PRICE_MISMATCH"))).toBe(true);
    expect(kafka.emitPurchaseMatchRejected).toHaveBeenCalled();
    expect(kafka.emitPurchaseMatchApproved).not.toHaveBeenCalled();

    const invUpdate = (prisma.invoice.update as jest.Mock).mock.calls[0][0];
    expect(invUpdate.data.paymentApproved).toBe(false);
    expect(invUpdate.data.status).toBe("PENDING_MATCH");
  });
});
