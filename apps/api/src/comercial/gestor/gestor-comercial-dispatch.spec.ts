import { AdvancePaymentStatus } from "@fsg/db";
import {
  ADVANCE_PAYMENT_DISPATCH_BLOCK,
  assertAdvancePaymentAllowsDispatch,
} from "./dto/gestor-comercial.dto";
import { GestorComercialService } from "./gestor-comercial.service";

describe("assertAdvancePaymentAllowsDispatch — bloqueo Despacho", () => {
  it("bloquea pase a Despacho mientras el link está PENDING", () => {
    const gate = assertAdvancePaymentAllowsDispatch({
      status: AdvancePaymentStatus.PENDING,
      dispatchUnlocked: false,
    });
    expect(gate.ok).toBe(false);
    expect(gate.block).toBe(ADVANCE_PAYMENT_DISPATCH_BLOCK);
  });

  it("permite Despacho solo cuando Tesorería confirma PAID + unlocked", () => {
    const pendingUnlocked = assertAdvancePaymentAllowsDispatch({
      status: AdvancePaymentStatus.PENDING,
      dispatchUnlocked: true,
    });
    expect(pendingUnlocked.ok).toBe(false);

    const paid = assertAdvancePaymentAllowsDispatch({
      status: AdvancePaymentStatus.PAID,
      dispatchUnlocked: true,
    });
    expect(paid.ok).toBe(true);
    expect(paid.block).toBeNull();
  });
});

describe("GestorComercialService — link cobro → gate Despacho", () => {
  it("crea link PENDING y deja el viaje bloqueado hasta confirmar pago", async () => {
    const trip = {
      id: "trip-1",
      code: "EXP-2026-0001",
      advancePaymentRequired: true,
      status: "PENDING",
    };
    const linkPending = {
      id: "link-1",
      status: AdvancePaymentStatus.PENDING,
      dispatchUnlocked: false,
      tripId: trip.id,
      trip,
      code: "PAY-2026-0001",
      checkoutUrl: "/cobro/abc",
    };
    const linkPaid = {
      ...linkPending,
      status: AdvancePaymentStatus.PAID,
      dispatchUnlocked: true,
      paidAt: new Date(),
    };

    const prisma = {
      customer: {
        create: jest.fn().mockResolvedValue({
          id: "cust-1",
          name: "Cliente Express",
        }),
      },
      trip: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue(trip),
        findFirst: jest.fn().mockResolvedValue({
          ...trip,
          advancePaymentRequired: true,
          advancePaymentLink: linkPending,
        }),
        update: jest.fn().mockResolvedValue(trip),
      },
      commercialAdvancePaymentLink: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue(linkPending),
        findFirst: jest.fn().mockResolvedValue(linkPending),
        update: jest.fn().mockResolvedValue(linkPaid),
      },
      commercialTimelineEvent: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const kafka = { emit: jest.fn().mockResolvedValue(undefined) };
    const svc = new GestorComercialService(prisma as never, kafka as never);

    const created = await svc.linkCobroAnticipado("org-1", "user-val", {
      amount: 850_000,
      method: "PSE",
      accountName: "Cliente Express",
      origin: "Bogotá",
      destination: "Chía",
      createTrip: true,
    });

    expect(created.dispatchGate.ok).toBe(false);
    expect(created.dispatchGate.block).toBe(ADVANCE_PAYMENT_DISPATCH_BLOCK);
    expect(prisma.trip.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          advancePaymentRequired: true,
          status: "PENDING",
        }),
      }),
    );

    const before = await svc.evaluateTripDispatchGate("org-1", "trip-1");
    expect(before.ok).toBe(false);
    expect(before.block).toBe(ADVANCE_PAYMENT_DISPATCH_BLOCK);

    prisma.commercialAdvancePaymentLink.findFirst = jest
      .fn()
      .mockResolvedValue(linkPending);

    const cleared = await svc.confirmarPagoTesoreria("org-1", "tesoreria-1", {
      linkId: "link-1",
      confirmed: true,
    });

    expect(cleared.dispatchGate.ok).toBe(true);
    expect(cleared.status).toBe("PAYMENT_CLEARED");
    expect(prisma.commercialAdvancePaymentLink.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: AdvancePaymentStatus.PAID,
          dispatchUnlocked: true,
        }),
      }),
    );
  });
});
