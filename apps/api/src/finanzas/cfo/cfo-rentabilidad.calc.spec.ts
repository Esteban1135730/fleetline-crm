import {
  DEFAULT_MIN_EBITDA_MARGIN,
  cfoMfaThresholdCop,
  requiresCfoMfa,
  simulateRentability,
} from "./cfo-rentabilidad.calc";

describe("simulateRentability", () => {
  it("aprueba cotización con EBITDA ≥ 15%", () => {
    const r = simulateRentability({
      fareAmount: 1_000_000,
      fuelProjected: 200_000,
      tireWear: 50_000,
      driverSalary: 300_000,
      insurancePolicies: 50_000,
    });
    // costs 600k → ebitda 400k → margin 40%
    expect(r.margin).toBeCloseTo(0.4, 5);
    expect(r.canSign).toBe(true);
    expect(r.decision).toBe("APPROVE");
    expect(r.semaphore).toBe("GREEN");
    expect(r.counterOfferSuggested).toBeNull();
  });

  it("rechaza cotización con EBITDA inferior al umbral mínimo", () => {
    const r = simulateRentability({
      fareAmount: 1_000_000,
      fuelProjected: 500_000,
      tireWear: 150_000,
      driverSalary: 300_000,
      insurancePolicies: 100_000,
      minEbitdaMargin: DEFAULT_MIN_EBITDA_MARGIN,
    });
    // costs 1.05M → ebitda -50k → margin -5%
    expect(r.ebitda).toBeLessThan(0);
    expect(r.margin).toBeLessThan(0.15);
    expect(r.canSign).toBe(false);
    expect(r.decision).toBe("REJECT");
    expect(r.semaphore).toBe("RED");
    expect(r.counterOfferSuggested).toBeGreaterThan(r.fareAmount);
  });

  it("marca AMBER cuando margen está justo sobre el umbral", () => {
    const r = simulateRentability({
      fareAmount: 1_000_000,
      fuelProjected: 400_000,
      tireWear: 100_000,
      driverSalary: 300_000,
      insurancePolicies: 40_000,
    });
    // costs 840k → ebitda 160k → 16%
    expect(r.margin).toBeCloseTo(0.16, 5);
    expect(r.canSign).toBe(true);
    expect(r.semaphore).toBe("AMBER");
  });
});

describe("requiresCfoMfa / threshold", () => {
  const prev = process.env.CFO_MFA_THRESHOLD_COP;

  afterEach(() => {
    if (prev === undefined) delete process.env.CFO_MFA_THRESHOLD_COP;
    else process.env.CFO_MFA_THRESHOLD_COP = prev;
  });

  it("exige MFA CFO sobre 20M por defecto", () => {
    delete process.env.CFO_MFA_THRESHOLD_COP;
    expect(cfoMfaThresholdCop()).toBe(20_000_000);
    expect(requiresCfoMfa(20_000_000)).toBe(false);
    expect(requiresCfoMfa(20_000_001)).toBe(true);
  });
});
