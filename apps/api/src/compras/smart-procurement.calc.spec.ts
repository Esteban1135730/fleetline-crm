import {
  bidOptimalityScore,
  comprasCfoThresholdCop,
} from "./dto/smart-procurement.dto";

describe("smart-procurement helpers", () => {
  it("prioriza menor precio y lead time en score", () => {
    const fastCheap = bidOptimalityScore(100, 2);
    const slowExpensive = bidOptimalityScore(120, 10);
    expect(fastCheap).toBeLessThan(slowExpensive);
  });

  it("lee tope CFO desde env", () => {
    const prev = process.env.COMPRAS_CFO_THRESHOLD_COP;
    process.env.COMPRAS_CFO_THRESHOLD_COP = "5000000";
    expect(comprasCfoThresholdCop()).toBe(5_000_000);
    if (prev === undefined) delete process.env.COMPRAS_CFO_THRESHOLD_COP;
    else process.env.COMPRAS_CFO_THRESHOLD_COP = prev;
  });
});
