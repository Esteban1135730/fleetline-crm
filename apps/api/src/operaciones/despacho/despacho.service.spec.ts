import { BadRequestException } from "@nestjs/common";
import { HARD_RULES } from "@fsg/shared";
import { DespachoService } from "./despacho.service";
import { evaluateLegalRestHours } from "./dto/despacho.dto";

describe("DespachoService.asignarViaje — rebote descanso legal", () => {
  it("lanza BadRequest (HTTP 400) al asignar sin descanso de ley", async () => {
    const departAt = new Date("2026-08-12T14:00:00.000Z");
    const lastEnd = new Date("2026-08-12T09:00:00.000Z"); // 5h

    const rest = evaluateLegalRestHours({
      lastDutyEndedAt: lastEnd,
      departAt,
    });
    expect(rest.ok).toBe(false);

    const prisma = {
      trip: {
        findFirst: jest.fn().mockResolvedValue({
          id: "trip-1",
          code: "SRV-001",
          status: "PENDING",
          departAt,
          meta: null,
          suggestedPolyline: null,
          customer: null,
          route: null,
        }),
        update: jest.fn(),
      },
      driver: {
        findFirst: jest.fn().mockResolvedValue({
          id: "drv-1",
          name: "Luis Relé",
          fatigueScore: 10,
          dispatchBlocked: false,
          blockReason: null,
          active: true,
        }),
      },
      vehicle: {
        findFirst: jest.fn().mockResolvedValue({
          id: "veh-1",
          plate: "BOG-892",
          status: "AVAILABLE",
          complianceBlocked: false,
          complianceDocs: [
            {
              type: "TARJETA_OPERACION",
              status: "VALID",
              expiresAt: new Date("2027-01-01"),
            },
            {
              type: "EXTINTOR",
              status: "VALID",
              expiresAt: new Date("2027-01-01"),
            },
          ],
          fleetStops: [],
        }),
      },
      driverShift: {
        findFirst: jest.fn().mockResolvedValue({ checkOutAt: lastEnd }),
      },
    };
    const kafka = { emit: jest.fn() };
    const gateway = { emitUpdate: jest.fn() };
    const svc = new DespachoService(
      prisma as never,
      kafka as never,
      gateway as never,
    );

    await expect(
      svc.asignarViaje("org-1", "user-luis", {
        tripId: "trip-1",
        driverId: "drv-1",
        vehicleId: "veh-1",
        publishToApp: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.trip.update).not.toHaveBeenCalled();
  });

  it("umbral de descanso coincide con HARD_RULES", () => {
    expect(HARD_RULES.MIN_LEGAL_REST_HOURS).toBe(8);
    expect(HARD_RULES.DISPATCH_FATIGUE_MAX).toBe(30);
  });
});
