import { HARD_RULES } from "@fsg/shared";
import { evaluateFatigue } from "./fatigue.types";
import { FatigueManagementService } from "./fatigue-management.service";
import { calculatePayrollLine } from "./payroll.calc";
import { ShiftStatus } from "@fsg/db";

describe("evaluateFatigue — umbrales legales", () => {
  it("marca fatiga si > 8h continuas", () => {
    const r = evaluateFatigue({ continuousHours: 8.5, dailyHours: 8.5 });
    expect(r.continuousExceeded).toBe(true);
    expect(r.fatigueExceeded).toBe(true);
    expect(r.blockReason).toBe("DRIVER_FATIGUE");
    expect(r.fatigueScore).toBeGreaterThanOrEqual(
      HARD_RULES.FATIGUE_BLOCK_SCORE,
    );
  });

  it("marca fatiga si > 12h diarias aunque continuo <= 8", () => {
    const r = evaluateFatigue({ continuousHours: 6, dailyHours: 12.5 });
    expect(r.dailyExceeded).toBe(true);
    expect(r.fatigueExceeded).toBe(true);
    expect(r.blockReason).toBe("DRIVER_FATIGUE");
  });

  it("no bloquea bajo umbral", () => {
    const r = evaluateFatigue({ continuousHours: 7, dailyHours: 10 });
    expect(r.fatigueExceeded).toBe(false);
    expect(r.blockReason).toBeNull();
  });
});

describe("FatigueManagementService — bloqueo despacho", () => {
  it("al check-out con exceso setea dispatchBlocked + DRIVER_FATIGUE", async () => {
    const checkInAt = new Date("2026-07-31T06:00:00.000Z");
    const checkOutAt = new Date("2026-07-31T15:30:00.000Z"); // 9.5h

    const driverUpdate = jest.fn().mockResolvedValue({
      id: "drv-1",
      dispatchBlocked: true,
      blockReason: "DRIVER_FATIGUE",
      fatigueScore: HARD_RULES.FATIGUE_BLOCK_SCORE,
    });

    const prisma = {
      driver: {
        findFirst: jest.fn().mockResolvedValue({
          id: "drv-1",
          name: "Juan",
          organizationId: "org-1",
          dispatchBlocked: false,
          blockReason: null,
          fatigueScore: 0,
        }),
        update: driverUpdate,
      },
      driverShift: {
        findFirst: jest.fn().mockResolvedValue({
          id: "sh-1",
          checkInAt,
          notes: null,
          status: ShiftStatus.OPEN,
        }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: "sh-1",
            checkInAt,
            checkOutAt: data.checkOutAt,
            continuousHours: data.continuousHours,
            status: ShiftStatus.CLOSED,
          }),
        ),
      },
    };

    const kafka = { emit: jest.fn().mockResolvedValue(undefined) };
    const svc = new FatigueManagementService(prisma as never, kafka as never);

    const out = await svc.checkOut("org-1", {
      driverId: "drv-1",
      checkOutAt,
    });

    expect(out.fatigue.fatigueExceeded).toBe(true);
    expect(out.fatigue.continuousHours).toBeGreaterThan(
      HARD_RULES.FATIGUE_CONTINUOUS_HOURS,
    );
    expect(driverUpdate).toHaveBeenCalledWith({
      where: { id: "drv-1" },
      data: expect.objectContaining({
        dispatchBlocked: true,
        blockReason: "DRIVER_FATIGUE",
        fatigueScore: expect.any(Number),
      }),
    });
    expect(kafka.emit).toHaveBeenCalledWith(
      "driver.fatigue.blocked",
      expect.objectContaining({ reason: "DRIVER_FATIGUE", driverId: "drv-1" }),
    );
    expect(out.dispatchBlocked).toBe(true);
    expect(out.blockReason).toBe("DRIVER_FATIGUE");
  });
});

describe("calculatePayrollLine — horas extra y comisiones", () => {
  it("desglosa overtime y comisiones por viajes completados", () => {
    const day = "2026-07-15T";
    const line = calculatePayrollLine({
      employeeId: "emp-1",
      driverId: "drv-1",
      baseSalary: 1_500_000,
      hourlyRate: 20_000,
      ordinaryDayHours: 8,
      overtimeMultiplier: 1.25,
      nightMultiplier: 1.35,
      commissionPerTrip: 15_000,
      completedTrips: 4,
      shifts: [
        {
          checkInAt: new Date(`${day}08:00:00.000Z`),
          checkOutAt: new Date(`${day}18:00:00.000Z`), // 10h → 2h OT
        },
      ],
    });

    expect(line.overtimeHours).toBe(2);
    expect(line.overtimeAmount).toBe(2 * 20_000 * 1.25);
    expect(line.completedTrips).toBe(4);
    expect(line.tripCommissions).toBe(60_000);
    expect(line.grossTotal).toBe(
      1_500_000 + line.overtimeAmount + line.nightAmount + 60_000,
    );
  });

  it("incluye recargo nocturno sobre tramo 21h–06h", () => {
    const checkInAt = new Date();
    checkInAt.setHours(22, 0, 0, 0);
    const checkOutAt = new Date(checkInAt);
    checkOutAt.setHours(23, 30, 0, 0);

    const line = calculatePayrollLine({
      employeeId: "emp-2",
      baseSalary: 0,
      hourlyRate: 10_000,
      ordinaryDayHours: 12,
      overtimeMultiplier: 1.25,
      nightMultiplier: 1.35,
      commissionPerTrip: 0,
      completedTrips: 0,
      shifts: [{ checkInAt, checkOutAt }],
    });

    expect(line.nightHours).toBeGreaterThan(0);
    expect(line.nightAmount).toBeGreaterThan(0);
  });
});
