import {
  computeFuelSmartAudit,
  fuelHeatLevel,
} from "./dto/control-interno.dto";

describe("computeFuelSmartAudit — algoritmo forense combustible", () => {
  it("marca GREEN cuando consumo alineado al rendimiento", () => {
    const r = computeFuelSmartAudit({
      gallonsPaid: 10,
      kmGps: 80,
      expectedKmPerGallon: 8,
    });
    expect(r.heatLevel).toBe("GREEN");
    expect(r.actualKmPerGallon).toBe(8);
    expect(r.deviationPct).toBe(0);
  });

  it("marca AMBER/RED ante desviación alta", () => {
    const amber = computeFuelSmartAudit({
      gallonsPaid: 10,
      kmGps: 40,
      expectedKmPerGallon: 8,
    });
    expect(amber.deviationPct).toBeGreaterThanOrEqual(20);
    expect(["AMBER", "RED"]).toContain(amber.heatLevel);

    const red = computeFuelSmartAudit({
      gallonsPaid: 10,
      kmGps: 10,
      expectedKmPerGallon: 8,
    });
    expect(red.heatLevel).toBe("RED");
  });

  it("fuelHeatLevel umbrales", () => {
    expect(fuelHeatLevel(0)).toBe("GREEN");
    expect(fuelHeatLevel(20)).toBe("AMBER");
    expect(fuelHeatLevel(40)).toBe("RED");
  });
});
