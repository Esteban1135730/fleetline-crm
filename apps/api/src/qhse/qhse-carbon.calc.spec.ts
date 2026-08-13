import {
  computeCarbonFootprint,
  DEFAULT_KG_CO2_PER_GALLON,
} from "./qhse-carbon.calc";

describe("computeCarbonFootprint", () => {
  it("cruza galones × factor vs kilómetros", () => {
    const r = computeCarbonFootprint({
      gallons: 40,
      distanceKm: 320,
    });
    expect(r.kgCo2).toBe(Number((40 * DEFAULT_KG_CO2_PER_GALLON).toFixed(2)));
    expect(r.kmPerGallon).toBe(8);
    expect(r.gCo2PerKm).toBeGreaterThan(0);
  });
});
