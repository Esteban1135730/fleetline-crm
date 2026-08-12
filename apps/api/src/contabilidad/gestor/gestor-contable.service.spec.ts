import { GestorContableService } from "./gestor-contable.service";

describe("GestorContableService — timbrado DIAN y CxC", () => {
  it("genera CUFE determinístico y referencias XML/PDF", () => {
    const svc = new GestorContableService({} as never, {} as never);
    const stamp = svc.buildDianStamp({
      organizationId: "org-1",
      invoiceNumber: "FE-2026-00001",
      nit: "900123456",
      amount: 2500000,
      customerNit: "800111222",
    });
    expect(stamp.cufe).toHaveLength(64);
    expect(stamp.xmlRef).toContain("FE-2026-00001");
    expect(stamp.pdfRef).toContain("FE-2026-00001");
    expect(stamp.provider).toMatch(/DIAN/);
  });

  it("emite FE, registra DianEmission y asiento CxC 1305/4135", async () => {
    const customer = {
      id: "cus-1",
      name: "Ecopetrol Demo",
      nit: "899999999",
    };
    const trips = [
      {
        id: "t1",
        code: "TR-1",
        fareAmount: 1000000,
        arriveAt: new Date("2026-07-10"),
        departAt: new Date("2026-07-10"),
        createdAt: new Date("2026-07-10"),
        vehicle: { id: "v1", plate: "BOG-892" },
        route: { name: "Bogotá-Cartagena", origin: "Bogotá", destination: "Cartagena" },
      },
      {
        id: "t2",
        code: "TR-2",
        fareAmount: 500000,
        arriveAt: new Date("2026-07-12"),
        departAt: new Date("2026-07-12"),
        createdAt: new Date("2026-07-12"),
        vehicle: { id: "v1", plate: "BOG-892" },
        route: { name: "Bogotá-Medellín", origin: "Bogotá", destination: "Medellín" },
      },
    ];

    const prisma = {
      customer: { findFirst: jest.fn().mockResolvedValue(customer) },
      trip: { findMany: jest.fn().mockResolvedValue(trips) },
      invoice: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: "inv-1", ...data }),
        ),
      },
      organization: {
        findUnique: jest.fn().mockResolvedValue({ nit: "900123456", name: "FSG" }),
      },
      dianEmission: {
        create: jest.fn().mockResolvedValue({ id: "dian-1" }),
      },
    };
    const ledger = {
      postDoubleEntry: jest.fn().mockResolvedValue({ id: "je-1" }),
    };

    const svc = new GestorContableService(prisma as never, ledger as never);
    const out = await svc.emitirDian("org-1", "user-diana", {
      customerId: "cus-1",
      periodFrom: "2026-07-01",
      periodTo: "2026-07-31",
    });

    expect(out.draft).toBe(false);
    expect(out.amount).toBe(1500000);
    expect(out.tripsCount).toBe(2);
    expect(out.cxcCreated).toBe(true);
    expect(out.dian?.cufe).toHaveLength(64);
    expect(prisma.dianEmission.create).toHaveBeenCalled();
    expect(ledger.postDoubleEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        debitCode: "1305",
        creditCode: "4135",
        amount: 1500000,
        sourceEvent: "dian.invoice.issued",
      }),
    );
  });
});
