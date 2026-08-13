import { isGanttBlockedByFleetStop } from "./dto/director.dto";

describe("isGanttBlockedByFleetStop — bloqueo programación Gantt", () => {
  const departAt = new Date("2026-08-12T10:00:00.000Z");
  const arriveAt = new Date("2026-08-12T12:00:00.000Z");

  it("bloquea cuando el vehículo tiene parada APPROVED solapada", () => {
    const result = isGanttBlockedByFleetStop("veh-1", departAt, arriveAt, [
      {
        vehicleId: "veh-1",
        status: "APPROVED",
        blocksGantt: true,
        windowStart: new Date("2026-08-12T09:00:00.000Z"),
        windowEnd: new Date("2026-08-12T14:00:00.000Z"),
      },
    ]);
    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/Parada de flota aprobada/);
  });

  it("bloquea con status ACTIVE", () => {
    const result = isGanttBlockedByFleetStop("veh-1", departAt, arriveAt, [
      {
        vehicleId: "veh-1",
        status: "ACTIVE",
        blocksGantt: true,
        windowStart: new Date("2026-08-12T11:00:00.000Z"),
        windowEnd: new Date("2026-08-12T15:00:00.000Z"),
      },
    ]);
    expect(result.blocked).toBe(true);
  });

  it("no bloquea si la parada es PENDING", () => {
    const result = isGanttBlockedByFleetStop("veh-1", departAt, arriveAt, [
      {
        vehicleId: "veh-1",
        status: "PENDING",
        blocksGantt: true,
        windowStart: new Date("2026-08-12T09:00:00.000Z"),
        windowEnd: new Date("2026-08-12T14:00:00.000Z"),
      },
    ]);
    expect(result.blocked).toBe(false);
  });

  it("no bloquea fuera de la ventana temporal", () => {
    const result = isGanttBlockedByFleetStop("veh-1", departAt, arriveAt, [
      {
        vehicleId: "veh-1",
        status: "APPROVED",
        blocksGantt: true,
        windowStart: new Date("2026-08-12T14:00:00.000Z"),
        windowEnd: new Date("2026-08-12T18:00:00.000Z"),
      },
    ]);
    expect(result.blocked).toBe(false);
  });

  it("no bloquea otro vehículo", () => {
    const result = isGanttBlockedByFleetStop("veh-1", departAt, arriveAt, [
      {
        vehicleId: "veh-2",
        status: "APPROVED",
        blocksGantt: true,
        windowStart: new Date("2026-08-12T09:00:00.000Z"),
        windowEnd: new Date("2026-08-12T14:00:00.000Z"),
      },
    ]);
    expect(result.blocked).toBe(false);
  });
});
