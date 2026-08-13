import { UnprocessableEntityException } from "@nestjs/common";
import { TripStatus, VehicleStatus } from "@fsg/db";
import {
  LPR_HARD_STOP,
  LPR_NO_ACTIVE_TRIP,
  YardAccessService,
} from "./yard-access.service";

describe("YardAccessService — LPR talanquera", () => {
  it("rechaza apertura si no hay viaje activo en la hora actual", async () => {
    const prisma = {
      vehicle: {
        findFirst: jest.fn().mockResolvedValue({
          id: "v-idle",
          plate: "BOG-999",
          complianceBlocked: false,
          complianceReason: null,
          status: VehicleStatus.AVAILABLE,
          odometerKm: 5000,
        }),
      },
      trip: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      alcoholCheck: {
        findFirst: jest.fn().mockResolvedValue({
          id: "alc-1",
          passed: true,
          expiresAt: new Date(Date.now() + 3600_000),
        }),
      },
      yardAccessLog: {
        create: jest.fn().mockResolvedValue({ id: "ya-lpr-deny" }),
      },
      yardEvent: {
        create: jest.fn().mockResolvedValue({ id: "ye-1" }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: "al-1" }),
      },
    };

    const access = new YardAccessService(prisma as never);

    await expect(
      access.lprCheck("org-1", { plate: "BOG-999", gateId: "GATE-MAIN" }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    try {
      await access.lprCheck("org-1", { plate: "BOG-999" });
    } catch (e) {
      const err = e as UnprocessableEntityException;
      const body = err.getResponse() as {
        error: string;
        blocks: string[];
        gateOpened: boolean;
        alarm: boolean;
      };
      expect(body.error).toBe(LPR_HARD_STOP);
      expect(body.blocks).toContain(LPR_NO_ACTIVE_TRIP);
      expect(body.gateOpened).toBe(false);
      expect(body.alarm).toBe(true);
    }

    expect(prisma.trip.findFirst).toHaveBeenCalled();
    expect(prisma.yardAccessLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          gateOpened: false,
          denied: true,
          denyReason: LPR_HARD_STOP,
        }),
      }),
    );
  });

  it("findActiveTripForVehicle usa ventana horaria y estados activos", async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: "t1",
      code: "TR-1",
      status: TripStatus.ASSIGNED,
      departAt: new Date(),
      driverId: "d1",
    });
    const access = new YardAccessService({
      trip: { findFirst },
    } as never);

    const trip = await access.findActiveTripForVehicle(
      "org-1",
      "v1",
      new Date("2026-07-30T12:00:00Z"),
    );
    expect(trip?.code).toBe("TR-1");
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          vehicleId: "v1",
          status: {
            in: expect.arrayContaining([
              TripStatus.ASSIGNED,
              TripStatus.IN_TRANSIT,
            ]),
          },
        }),
      }),
    );
  });
});
