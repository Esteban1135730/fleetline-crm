/**
 * Tolerancias 3-Way Matching (SSOT Compras / antifraude).
 * Precio: 0% (solo redondeo COP a 0.01).
 * Cantidad: máx 2%.
 */
export const THREE_WAY_TOLERANCE = {
  PRICE_PERCENT: 0,
  PRICE_ABS_COP: 0.01,
  QTY_PERCENT: 0.02,
} as const;

export type ThreeWayOutcome = "APPROVED" | "DISCREPANCY_REJECTED";

export type ThreeWayLineAudit = {
  description: string;
  poQty: number;
  poUnitCost: number;
  receivedQty: number | null;
  invoiceUnitCost: number | null;
  invoiceLineTotal: number | null;
  qtyOk: boolean;
  priceOk: boolean;
};

export type ThreeWayEvaluation = {
  outcome: ThreeWayOutcome;
  priceDelta: number;
  qtyDelta: number;
  poTotal: number;
  receiptQty: number;
  invoiceTotal: number;
  poQty: number;
  reasons: string[];
  lines: ThreeWayLineAudit[];
  tolerances: typeof THREE_WAY_TOLERANCE;
};
