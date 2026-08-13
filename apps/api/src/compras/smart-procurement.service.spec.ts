import { PurchaseStatus } from "@fsg/db";
import { SmartProcurementService } from "./smart-procurement.service";
import { comprasCfoThresholdCop } from "./dto/smart-procurement.dto";

describe("SmartProcurementService.emitirOrden — escalamiento CFO", () => {
  const prev = process.env.COMPRAS_CFO_THRESHOLD_COP;

  beforeEach(() => {
    process.env.COMPRAS_CFO_THRESHOLD_COP = "10000000";
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.COMPRAS_CFO_THRESHOLD_COP;
    else process.env.COMPRAS_CFO_THRESHOLD_COP = prev;
  });

  function build() {
    const prisma = {
      purchaseRequisition: { findFirst: jest.fn(), update: jest.fn() },
      supplier: {
        findFirst: jest.fn().mockResolvedValue({
          id: "sup-1",
          name: "Repuestos Andes",
        }),
      },
      purchaseOrder: {
        count: jest.fn().mockResolvedValue(3),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: "po-1",
            code: data.code,
            status: data.status,
            totalEstimated: data.totalEstimated,
            supplierId: data.supplierId,
            meta: data.meta,
            lines: data.lines?.create || [],
            supplier: { id: "sup-1", name: "Repuestos Andes" },
          }),
        ),
      },
    };
    const kafka = { emit: jest.fn().mockResolvedValue(undefined) };
    const sarlaft = {
      assertSupplierClear: jest.fn().mockResolvedValue(undefined),
    };
    const compras = {};
    const svc = new SmartProcurementService(
      prisma as never,
      kafka as never,
      sarlaft as never,
      compras as never,
    );
    return { svc, prisma, kafka, sarlaft };
  }

  it("escala a Director Financiero cuando total > tope del rol", async () => {
    const { svc, prisma, kafka } = build();
    const threshold = comprasCfoThresholdCop();
    const result = await svc.emitirOrden("org-1", "user-javier", {
      supplierId: "sup-1",
      description: "Lote crítico frenos",
      lines: [
        {
          description: "Kit frenos",
          quantity: 1,
          unitCost: threshold + 500_000,
        },
      ],
    });

    expect(result.requiresCfoApproval).toBe(true);
    expect(result.order.status).toBe(PurchaseStatus.PENDING_APPROVAL);
    expect(prisma.purchaseOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: PurchaseStatus.PENDING_APPROVAL,
          meta: expect.objectContaining({
            requiresCfoApproval: true,
            escalatedTo: "DIRECTOR_FINANCIERO",
          }),
        }),
      }),
    );
    expect(kafka.emit).toHaveBeenCalledWith(
      "purchase.order.escalated",
      expect.objectContaining({
        role: "DIRECTOR_FINANCIERO",
        threshold,
      }),
    );
  });

  it("emite OC directa cuando total ≤ tope", async () => {
    const { svc, kafka } = build();
    const result = await svc.emitirOrden("org-1", "user-javier", {
      supplierId: "sup-1",
      lines: [
        { description: "Filtro aceite", quantity: 2, unitCost: 45_000 },
      ],
    });
    expect(result.requiresCfoApproval).toBe(false);
    expect(result.order.status).toBe(PurchaseStatus.ORDERED);
    expect(kafka.emit).toHaveBeenCalledWith(
      "purchase.order.issued",
      expect.any(Object),
    );
  });
});

describe("SmartProcurementService.entradaAlmacen — inventario", () => {
  it("actualiza inventario y notifica 3-Way al auxiliar", async () => {
    const item = {
      id: "inv-1",
      sku: "FRN-001",
      quantity: 2,
      organizationId: "org-1",
    };
    const prisma = {
      inventoryItem: {
        findFirst: jest.fn().mockResolvedValue({ ...item }),
        findUnique: jest
          .fn()
          .mockResolvedValue({ ...item, quantity: 7 }),
      },
      purchaseOrder: {
        update: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue({
          id: "po-1",
          status: PurchaseStatus.RECEIVED,
        }),
      },
      user: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: "aux-1", email: "auxiliarcontable@inretrans.com" }]),
      },
    };
    const kafka = { emit: jest.fn().mockResolvedValue(undefined) };
    const compras = {
      createGoodsReceipt: jest.fn().mockResolvedValue({
        id: "gr-1",
        code: "REM-00001",
        purchaseOrderId: "po-1",
        quantityTotal: 5,
      }),
    };
    const svc = new SmartProcurementService(
      prisma as never,
      kafka as never,
      {} as never,
      compras as never,
    );

    const result = await svc.entradaAlmacen("org-1", "user-javier", {
      purchaseOrderId: "po-1",
      lines: [{ inventoryItemId: "inv-1", quantity: 5 }],
      notifyAuxiliarContable: true,
    });

    expect(compras.createGoodsReceipt).toHaveBeenCalled();
    expect(result.inventoryUpdates).toEqual([
      {
        id: "inv-1",
        sku: "FRN-001",
        previousQty: 2,
        newQty: 7,
        delta: 5,
      },
    ]);
    expect(kafka.emit).toHaveBeenCalledWith(
      "purchase.goods.received",
      expect.objectContaining({
        purpose: "THREE_WAY_MATCH",
        notifyEmails: ["auxiliarcontable@inretrans.com"],
      }),
    );
    expect(result.threeWay.notifiedAuxiliarContable).toBe(true);
  });
});
