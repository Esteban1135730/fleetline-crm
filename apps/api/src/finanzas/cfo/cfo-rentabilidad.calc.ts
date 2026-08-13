/**
 * P&L predictivo CFO — funciones puras (testeables sin Nest).
 * Umbral EBITDA por defecto: 15%.
 */

export const DEFAULT_MIN_EBITDA_MARGIN = 0.15;

export type RentabilityInput = {
  fareAmount: number;
  fuelProjected: number;
  tireWear: number;
  driverSalary: number;
  insurancePolicies: number;
  /** Margen EBITDA mínimo (0–1). Default 0.15 */
  minEbitdaMargin?: number;
};

export type RentabilitySemaphore = "GREEN" | "AMBER" | "RED";

export type RentabilityResult = {
  fareAmount: number;
  totalCosts: number;
  ebitda: number;
  margin: number;
  minMargin: number;
  semaphore: RentabilitySemaphore;
  decision: "APPROVE" | "REJECT";
  canSign: boolean;
  /** Tarifa sugerida para alcanzar margen mínimo + 2 pp buffer */
  counterOfferSuggested: number | null;
  costBreakdown: {
    fuelProjected: number;
    tireWear: number;
    driverSalary: number;
    insurancePolicies: number;
  };
};

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export function simulateRentability(input: RentabilityInput): RentabilityResult {
  const fareAmount = Math.max(0, n(input.fareAmount));
  const fuelProjected = Math.max(0, n(input.fuelProjected));
  const tireWear = Math.max(0, n(input.tireWear));
  const driverSalary = Math.max(0, n(input.driverSalary));
  const insurancePolicies = Math.max(0, n(input.insurancePolicies));
  const minMargin =
    input.minEbitdaMargin != null && Number.isFinite(input.minEbitdaMargin)
      ? Math.max(0, Math.min(1, Number(input.minEbitdaMargin)))
      : DEFAULT_MIN_EBITDA_MARGIN;

  const totalCosts =
    fuelProjected + tireWear + driverSalary + insurancePolicies;
  const ebitda = fareAmount - totalCosts;
  const margin = fareAmount > 0 ? ebitda / fareAmount : 0;

  let semaphore: RentabilitySemaphore = "RED";
  if (margin >= 0.25) semaphore = "GREEN";
  else if (margin >= minMargin) semaphore = "AMBER";

  const canSign = margin >= minMargin;
  const decision: "APPROVE" | "REJECT" = canSign ? "APPROVE" : "REJECT";

  let counterOfferSuggested: number | null = null;
  if (!canSign && totalCosts > 0) {
    const targetMargin = minMargin + 0.02;
    const denom = 1 - targetMargin;
    counterOfferSuggested =
      denom > 0.01 ? Math.ceil(totalCosts / denom) : Math.ceil(totalCosts * 1.2);
  }

  return {
    fareAmount,
    totalCosts,
    ebitda,
    margin,
    minMargin,
    semaphore,
    decision,
    canSign,
    counterOfferSuggested,
    costBreakdown: {
      fuelProjected,
      tireWear,
      driverSalary,
      insurancePolicies,
    },
  };
}

/** Umbral CFO para lotes que requieren MFA de Dirección Financiera (default 20M COP) */
export function cfoMfaThresholdCop(): number {
  const raw = process.env.CFO_MFA_THRESHOLD_COP;
  const n = raw ? Number(raw) : 20_000_000;
  return Number.isFinite(n) && n >= 0 ? n : 20_000_000;
}

export function requiresCfoMfa(amount: number): boolean {
  return Number(amount) > cfoMfaThresholdCop();
}
