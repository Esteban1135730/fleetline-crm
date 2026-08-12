import { AuxiliarContableService } from "./auxiliar-contable.service";
import { ThreeWayMatchingService } from "../../compras/three-way-matching.service";

describe("AuxiliarContableService — bloqueo causación 3-Way", () => {
  const threeWay = new ThreeWayMatchingService(
    {} as never,
    { emit: jest.fn() } as never,
  );
  const svc = new AuxiliarContableService(
    {} as never,
    threeWay,
    {} as never,
  );

  it("bloquea causar cuando hay discrepancia de valor", () => {
    const evaluation = threeWay.evaluate({
      poTotal: 100000,
      poQty: 10,
      receiptQty: 10,
      invoiceTotal: 150000,
    });
    expect(evaluation.outcome).toBe("DISCREPANCY_REJECTED");
    const gate = svc.canCausarFactura(evaluation);
    expect(gate.allowed).toBe(false);
    expect(gate.blockReason).toMatch(/discrepancia|PRICE_MISMATCH/i);
  });

  it("habilita causar cuando OC, remisión y factura coinciden", () => {
    const evaluation = threeWay.evaluate({
      poTotal: 100000,
      poQty: 10,
      receiptQty: 10,
      invoiceTotal: 100000,
    });
    expect(evaluation.outcome).toBe("APPROVED");
    const gate = svc.canCausarFactura(evaluation);
    expect(gate.allowed).toBe(true);
    expect(gate.blockReason).toBeNull();
  });
});
