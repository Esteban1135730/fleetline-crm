import {
  ArchivoOpsService,
  INVENTORY_REORDER_EVENT,
} from "./archivo-ops.service";

describe("ArchivoOpsService — inventory.reorder_level_reached", () => {
  it("emite Kafka cuando el stock cae a ≤ minStock tras despacho", async () => {
    const item = {
      id: "item-1",
      organizationId: "org-1",
      sku: "PAP-A4-75",
      name: "Resma papel bond A4 75g",
      unit: "RESMA",
      quantity: 6,
      minStock: 5,
      active: true,
    };

    const kafka = { emit: jest.fn().mockResolvedValue(undefined) };
    const tx = {
      stationeryItem: {
        findFirst: jest.fn().mockResolvedValue(item),
        update: jest.fn().mockResolvedValue({
          ...item,
          quantity: 4,
        }),
      },
      stationeryDispatch: {
        create: jest.fn().mockResolvedValue({
          id: "disp-1",
          itemId: item.id,
          quantity: 2,
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };

    const svc = new ArchivoOpsService(prisma as never, kafka as never);
    const out = await svc.despacharSuministro("org-1", "user-1", {
      sku: "PAP-A4-75",
      quantity: 2,
      ticketRef: "REQ-42",
    });

    expect(out.quantityRemaining).toBe(4);
    expect(out.reorderAlert).toBe(true);
    expect(out.kafkaEvent).toBe(INVENTORY_REORDER_EVENT);
    expect(kafka.emit).toHaveBeenCalledWith(
      INVENTORY_REORDER_EVENT,
      expect.objectContaining({
        organizationId: "org-1",
        sku: "PAP-A4-75",
        quantity: 4,
        minStock: 5,
        directedTo: "compras",
      }),
    );
  });

  it("no emite Kafka si el stock permanece por encima del mínimo", async () => {
    const item = {
      id: "item-2",
      organizationId: "org-1",
      sku: "TONER-HP",
      name: "Toner",
      unit: "UND",
      quantity: 20,
      minStock: 3,
      active: true,
    };
    const kafka = { emit: jest.fn().mockResolvedValue(undefined) };
    const tx = {
      stationeryItem: {
        findFirst: jest.fn().mockResolvedValue(item),
        update: jest.fn().mockResolvedValue({ ...item, quantity: 18 }),
      },
      stationeryDispatch: {
        create: jest.fn().mockResolvedValue({ id: "disp-2", quantity: 2 }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };
    const svc = new ArchivoOpsService(prisma as never, kafka as never);
    const out = await svc.despacharSuministro("org-1", "user-1", {
      itemId: "item-2",
      quantity: 2,
    });
    expect(out.reorderAlert).toBe(false);
    expect(out.kafkaEvent).toBeNull();
    expect(kafka.emit).not.toHaveBeenCalled();
  });
});
