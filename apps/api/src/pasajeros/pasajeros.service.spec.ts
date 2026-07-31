import { UnprocessableEntityException } from "@nestjs/common";
import { BoardingPassStatus, ContractStatus, TripStatus } from "@fsg/db";
import {
  buildBoardingQrPayload,
  consolidateB2bDashboard,
  estimateEtaMinutes,
  generateBoardingToken,
  verifyBoardingPassToken,
} from "./boarding.calc";
import {
  BOARDING_PASS_INVALID,
  PassengerAppService,
} from "./passenger-app.service";
import { B2bPortalService } from "../clientes-b2b/b2b-portal.service";
import {
  CommercialContractService,
  CONTRACT_DISPATCH_DENIED,
} from "../comercial/commercial-contract.service";

describe("Boarding Pass — generación y verificación", () => {
  it("genera token y QR corporativo verificable", () => {
    const token = generateBoardingToken();
    expect(token.length).toBeGreaterThan(20);
    const expiresAt = new Date(Date.now() + 3_600_000);
    const qr = buildBoardingQrPayload({
      token,
      tripId: "trip-1",
      passengerId: "pax-1",
      organizationId: "org-1",
      expiresAt,
    });
    const parsed = JSON.parse(qr);
    expect(parsed.kind).toBe("CORPORATE_BOARDING_PASS");
    expect(parsed.token).toBe(token);
    expect(
      verifyBoardingPassToken({
        token,
        storedToken: token,
        status: "ISSUED",
        expiresAt,
      }).ok,
    ).toBe(true);
  });

  it("rechaza pass expirado o ya usado", () => {
    const token = "tok-abc";
    expect(
      verifyBoardingPassToken({
        token,
        storedToken: token,
        status: "ISSUED",
        expiresAt: new Date(Date.now() - 1000),
      }).reason,
    ).toBe("EXPIRED");
    expect(
      verifyBoardingPassToken({
        token,
        storedToken: token,
        status: "VALIDATED",
        expiresAt: new Date(Date.now() + 10000),
      }).reason,
    ).toBe("ALREADY_USED");
  });

  it("PassengerAppService emite y valida boarding pass", async () => {
    const tokenHolder = { token: "" };
    const create = jest.fn().mockImplementation(({ data }) => {
      tokenHolder.token = data.token;
      return Promise.resolve({
        id: "pass-1",
        ...data,
        passenger: { id: "pax-1", name: "Ana Corp", document: "1", phone: null },
        trip: {
          id: "trip-1",
          code: "TRP-1",
          origin: "A",
          destination: "B",
        },
      });
    });
    const findFirstPass = jest.fn();
    const updatePass = jest.fn().mockImplementation(({ data }) =>
      Promise.resolve({
        id: "pass-1",
        status: data.status,
        validatedAt: data.validatedAt,
        passenger: { id: "pax-1", name: "Ana Corp", document: "1" },
        trip: { id: "trip-1", code: "TRP-1" },
      }),
    );

    const prisma = {
      trip: {
        findFirst: jest.fn().mockResolvedValue({
          id: "trip-1",
          code: "TRP-1",
          status: TripStatus.ASSIGNED,
          vehicle: { id: "v1", plate: "BOG-001" },
          customer: { id: "c1", name: "ACME" },
        }),
      },
      passengerProfile: {
        create: jest.fn().mockResolvedValue({
          id: "pax-1",
          name: "Ana Corp",
        }),
        findFirst: jest.fn(),
      },
      boardingPass: {
        create,
        findFirst: findFirstPass,
        update: updatePass,
      },
    };

    const svc = new PassengerAppService(prisma as never);
    const issued = await svc.generateBoardingPass("org-1", {
      tripId: "trip-1",
      passengerName: "Ana Corp",
      document: "1020",
    });
    expect(issued.qrPayload).toContain("CORPORATE_BOARDING_PASS");
    expect(issued.status).toBe(BoardingPassStatus.ISSUED);

    findFirstPass.mockResolvedValue({
      id: "pass-1",
      token: tokenHolder.token,
      status: BoardingPassStatus.ISSUED,
      expiresAt: new Date(Date.now() + 60_000),
      passenger: { id: "pax-1", name: "Ana Corp" },
      trip: { id: "trip-1", code: "TRP-1", status: TripStatus.ASSIGNED },
    });

    const validated = await svc.validateBoarding("org-1", {
      token: tokenHolder.token,
    });
    expect(validated.valid).toBe(true);
    expect(validated.pass.status).toBe(BoardingPassStatus.VALIDATED);
  });

  it("validate lanza 422 si el pass ya fue usado", async () => {
    const prisma = {
      boardingPass: {
        findFirst: jest.fn().mockResolvedValue({
          id: "pass-1",
          token: "tok",
          status: BoardingPassStatus.VALIDATED,
          expiresAt: new Date(Date.now() + 60_000),
          passenger: {},
          trip: {},
        }),
        update: jest.fn(),
      },
    };
    const svc = new PassengerAppService(prisma as never);
    await expect(
      svc.validateBoarding("org-1", { token: "tok" }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        error: BOARDING_PASS_INVALID,
        reason: "ALREADY_USED",
      }),
    });
  });
});

describe("estimateEtaMinutes", () => {
  it("calcula ETA > 0", () => {
    const r = estimateEtaMinutes({
      fromLat: 4.711,
      fromLng: -74.072,
      toLat: 4.65,
      toLng: -74.06,
    });
    expect(r.distanceKm).toBeGreaterThan(0);
    expect(r.etaMinutes).toBeGreaterThan(0);
  });
});

describe("consolidateB2bDashboard", () => {
  it("consolida SLA, presupuesto y pre-facturas", () => {
    const d = consolidateB2bDashboard({
      tripsTotal: 20,
      tripsCompleted: 10,
      tripsOnTime: 9,
      budgetCap: 10_000_000,
      budgetConsumed: 2_500_000,
      tripQuota: 100,
      tripsUsed: 40,
      draftInvoices: 3,
      draftInvoiceAmount: 1_200_000,
      issuedInvoices: 5,
      activeVehicles: 4,
    });
    expect(d.sla.compliancePct).toBe(90);
    expect(d.budget.consumedPct).toBe(25);
    expect(d.tripQuota.usedPct).toBe(40);
    expect(d.preInvoices.draftCount).toBe(3);
    expect(d.health).toBe("NOMINAL");
  });

  it("marca CRITICAL si cupo casi agotado", () => {
    const d = consolidateB2bDashboard({
      tripsTotal: 10,
      tripsCompleted: 10,
      tripsOnTime: 5,
      budgetCap: 100,
      budgetConsumed: 96,
      tripQuota: 10,
      tripsUsed: 10,
      draftInvoices: 0,
      draftInvoiceAmount: 0,
      issuedInvoices: 0,
      activeVehicles: 0,
    });
    expect(d.health).toBe("CRITICAL");
  });
});

describe("B2bPortalService — cupo comercial", () => {
  it("rechaza servicio expreso sin cupo contratado", async () => {
    const contracts = {
      assertAssignableForDispatch: jest.fn().mockRejectedValue(
        new UnprocessableEntityException({
          error: CONTRACT_DISPATCH_DENIED,
          message: "sin cupo",
          blocks: ["CONTRACT_TRIP_QUOTA_EXCEEDED"],
        }),
      ),
    };
    const prisma = {
      customer: {
        findFirst: jest.fn().mockResolvedValue({
          id: "cust-1",
          name: "ACME",
        }),
      },
      trip: { count: jest.fn(), create: jest.fn() },
      b2bServiceRequest: { create: jest.fn() },
    };
    const svc = new B2bPortalService(
      prisma as never,
      contracts as never,
    );

    await expect(
      svc.requestService("org-1", {
        customerId: "cust-1",
        contractId: "ctr-1",
        origin: "Calle 100",
        destination: "Aeropuerto",
        kind: "EXPRESS",
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(prisma.trip.create).not.toHaveBeenCalled();
  });

  it("aprueba servicio cuando el contrato tiene cupo", async () => {
    const contracts = {
      assertAssignableForDispatch: jest.fn().mockResolvedValue({
        id: "ctr-1",
        code: "CTR-1",
        customerId: "cust-1",
        fixedFare: 150000,
      }),
    };
    const prisma = {
      customer: {
        findFirst: jest.fn().mockResolvedValue({ id: "cust-1", name: "ACME" }),
      },
      trip: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({
          id: "trip-b2b",
          code: "B2B-1001",
          status: TripStatus.PENDING,
        }),
      },
      b2bServiceRequest: {
        create: jest.fn().mockResolvedValue({
          id: "req-1",
          kind: "EXPRESS",
          status: "APPROVED",
          trip: { id: "trip-b2b", code: "B2B-1001" },
          contract: { id: "ctr-1", code: "CTR-1" },
        }),
      },
    };
    const svc = new B2bPortalService(prisma as never, contracts as never);
    const out = await svc.requestService("org-1", {
      customerId: "cust-1",
      contractId: "ctr-1",
      origin: "A",
      destination: "B",
      kind: "EXPRESS",
      estimatedFare: 150000,
    });
    expect(out.status).toBe("APPROVED");
    expect(contracts.assertAssignableForDispatch).toHaveBeenCalled();
  });

  it("dashboard consolida métricas del cliente", async () => {
    const prisma = {
      customer: {
        findFirst: jest.fn().mockResolvedValue({
          id: "cust-1",
          name: "ACME",
          nit: "900",
        }),
      },
      transportContract: {
        findFirst: jest.fn().mockResolvedValue({
          id: "ctr-1",
          code: "CTR-1",
          name: "Contrato flota",
          status: ContractStatus.ACTIVE,
          budgetCap: 1_000_000,
          budgetConsumed: 200_000,
          tripQuota: 50,
          tripsUsed: 10,
          startsAt: new Date(),
        }),
      },
      trip: {
        count: jest
          .fn()
          .mockResolvedValueOnce(12)
          .mockResolvedValueOnce(8),
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            {
              departAt: new Date("2026-07-31T08:00:00Z"),
              updatedAt: new Date("2026-07-31T08:10:00Z"),
              createdAt: new Date(),
            },
            {
              departAt: new Date("2026-07-31T09:00:00Z"),
              updatedAt: new Date("2026-07-31T09:05:00Z"),
              createdAt: new Date(),
            },
          ])
          .mockResolvedValueOnce([{ vehicleId: "v1" }, { vehicleId: "v2" }]),
      },
      invoice: {
        findMany: jest.fn().mockResolvedValue([{ amount: 100000 }]),
        count: jest.fn().mockResolvedValue(2),
      },
    };
    const svc = new B2bPortalService(
      prisma as never,
      {} as CommercialContractService,
    );
    const dash = await svc.dashboard("org-1", { customerId: "cust-1" });
    expect(dash.customer.name).toBe("ACME");
    expect(dash.sla.tripsCompleted).toBe(8);
    expect(dash.budget.consumedPct).toBe(20);
    expect(dash.preInvoices.draftCount).toBe(1);
    expect(dash.activeVehicles).toBe(2);
  });
});
