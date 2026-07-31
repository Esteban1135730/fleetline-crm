import { UnprocessableEntityException } from "@nestjs/common";
import { ContractStatus } from "@fsg/db";
import {
  calculateContractedFare,
  evaluateContractGate,
} from "./contract.calc";
import {
  CommercialContractService,
  CONTRACT_DISPATCH_DENIED,
} from "./commercial-contract.service";
import { CommercialRevenueService } from "./commercial-revenue.service";

describe("evaluateContractGate — vigencia / cupo", () => {
  const base = {
    id: "ctr-1",
    code: "CTR-2026-0001",
    status: ContractStatus.ACTIVE,
    startsAt: new Date("2026-01-01T00:00:00.000Z"),
    endsAt: new Date("2026-12-31T23:59:59.000Z"),
    tripQuota: 10,
    tripsUsed: 0,
    budgetCap: 5_000_000,
    budgetConsumed: 0,
    vehicleQuota: null as number | null,
    vehiclesAllocated: 0,
  };

  it("rechaza contrato vencido", () => {
    const gate = evaluateContractGate(
      { ...base, endsAt: new Date("2026-06-01T00:00:00.000Z") },
      { departAt: new Date("2026-07-31T12:00:00.000Z") },
    );
    expect(gate.ok).toBe(false);
    expect(gate.blocks).toContain("CONTRACT_EXPIRED");
  });

  it("rechaza sin cupo de viajes", () => {
    const gate = evaluateContractGate(
      { ...base, tripQuota: 5, tripsUsed: 5 },
      { departAt: new Date("2026-07-31T12:00:00.000Z") },
    );
    expect(gate.ok).toBe(false);
    expect(gate.blocks).toContain("CONTRACT_TRIP_QUOTA_EXCEEDED");
  });

  it("rechaza presupuesto agotado", () => {
    const gate = evaluateContractGate(
      { ...base, budgetCap: 1_000_000, budgetConsumed: 1_000_000 },
      {
        departAt: new Date("2026-07-31T12:00:00.000Z"),
        estimatedFare: 50_000,
      },
    );
    expect(gate.ok).toBe(false);
    expect(gate.blocks).toContain("CONTRACT_BUDGET_EXCEEDED");
  });

  it("permite contrato vigente con cupo", () => {
    const gate = evaluateContractGate(base, {
      departAt: new Date("2026-07-31T12:00:00.000Z"),
      estimatedFare: 100_000,
    });
    expect(gate.ok).toBe(true);
    expect(gate.blocks).toEqual([]);
  });
});

describe("calculateContractedFare — tarificación", () => {
  it("FIXED usa fixedFare", () => {
    expect(
      calculateContractedFare({
        rateType: "FIXED",
        fixedFare: 250_000,
        ratePerKm: null,
        monthlyValue: 0,
        distanceKm: 80,
      }),
    ).toBe(250_000);
  });

  it("PER_KM = ratePerKm * distance", () => {
    expect(
      calculateContractedFare({
        rateType: "PER_KM",
        fixedFare: null,
        ratePerKm: 3_500,
        monthlyValue: 0,
        distanceKm: 40,
      }),
    ).toBe(140_000);
  });

  it("MIXED = fijo + km", () => {
    expect(
      calculateContractedFare({
        rateType: "MIXED",
        fixedFare: 50_000,
        ratePerKm: 2_000,
        monthlyValue: 0,
        distanceKm: 25,
      }),
    ).toBe(100_000);
  });
});

describe("CommercialContractService — bloqueo planilla/FUEC", () => {
  it("assertAssignableForDispatch lanza 422 si contrato vencido", async () => {
    const prisma = {
      transportContract: {
        findFirst: jest.fn().mockResolvedValue({
          id: "ctr-exp",
          code: "CTR-EXP",
          status: ContractStatus.ACTIVE,
          startsAt: new Date("2025-01-01"),
          endsAt: new Date("2025-12-31"),
          tripQuota: 100,
          tripsUsed: 0,
          budgetCap: null,
          budgetConsumed: 0,
          vehicleQuota: null,
          vehiclesAllocated: 0,
        }),
      },
    };
    const svc = new CommercialContractService(prisma as never);
    await expect(
      svc.assertAssignableForDispatch("org-1", "ctr-exp", {
        departAt: new Date("2026-07-31"),
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    try {
      await svc.assertAssignableForDispatch("org-1", "ctr-exp", {
        departAt: new Date("2026-07-31"),
      });
    } catch (e) {
      const err = e as UnprocessableEntityException;
      const body = err.getResponse() as { error: string; blocks: string[] };
      expect(body.error).toBe(CONTRACT_DISPATCH_DENIED);
      expect(body.blocks).toContain("CONTRACT_EXPIRED");
    }
  });

  it("assertAssignableForDispatch lanza 422 sin cupo presupuestal", async () => {
    const prisma = {
      transportContract: {
        findFirst: jest.fn().mockResolvedValue({
          id: "ctr-budget",
          code: "CTR-BUD",
          status: ContractStatus.ACTIVE,
          startsAt: new Date("2026-01-01"),
          endsAt: new Date("2026-12-31"),
          tripQuota: null,
          tripsUsed: 0,
          budgetCap: 500_000,
          budgetConsumed: 500_000,
          vehicleQuota: null,
          vehiclesAllocated: 0,
        }),
      },
    };
    const svc = new CommercialContractService(prisma as never);
    await expect(
      svc.assertAssignableForDispatch("org-1", "ctr-budget", {
        estimatedFare: 100_000,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        error: CONTRACT_DISPATCH_DENIED,
        blocks: expect.arrayContaining(["CONTRACT_BUDGET_EXCEEDED"]),
      }),
    });
  });
});

describe("CommercialRevenueService — tarificación viaje completado", () => {
  it("aplica PER_KM, genera pre-factura y emite commercial.revenue.generated", async () => {
    const tripUpdate = jest.fn().mockResolvedValue({});
    const contractUpdate = jest.fn().mockResolvedValue({});
    const invoiceCreate = jest.fn().mockResolvedValue({
      id: "inv-1",
      number: "PF-TRP-1001-001",
    });
    const emitCommercialRevenueGenerated = jest
      .fn()
      .mockResolvedValue(undefined);

    const prisma = {
      trip: {
        findFirst: jest.fn(),
        update: tripUpdate,
      },
      invoice: {
        count: jest.fn().mockResolvedValue(0),
        create: invoiceCreate,
      },
      transportContract: {
        update: contractUpdate,
      },
    };

    const contracts = new CommercialContractService(prisma as never);
    const kafka = { emitCommercialRevenueGenerated };
    const revenue = new CommercialRevenueService(
      prisma as never,
      kafka as never,
      contracts,
    );

    const result = await revenue.priceCompletedTrip({
      id: "trip-1",
      code: "TRP-1001",
      organizationId: "org-1",
      contractId: "ctr-1",
      customerId: "cust-1",
      distanceKm: 40,
      fareAmount: 0,
      contract: {
        id: "ctr-1",
        code: "CTR-1",
        rateType: "PER_KM",
        fixedFare: null,
        ratePerKm: 3_500,
        monthlyValue: 0,
        customerId: "cust-1",
      },
      customer: { id: "cust-1", name: "Acme Logistics", nit: "900123" },
    });

    expect(result).toMatchObject({ fare: 140_000, distanceKm: 40 });
    expect(tripUpdate).toHaveBeenCalledWith({
      where: { id: "trip-1" },
      data: { fareAmount: 140_000 },
    });
    expect(contractUpdate).toHaveBeenCalledWith({
      where: { id: "ctr-1" },
      data: {
        tripsUsed: { increment: 1 },
        budgetConsumed: { increment: 140_000 },
      },
    });
    expect(invoiceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "DRAFT",
          amount: 140_000,
          tripId: "trip-1",
        }),
      }),
    );
    expect(emitCommercialRevenueGenerated).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        tripId: "trip-1",
        contractId: "ctr-1",
        amount: 140_000,
        distanceKm: 40,
      }),
    );
  });
});
