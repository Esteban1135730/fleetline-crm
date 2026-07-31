import {
  ContractRateType,
  ContractStatus,
} from "@fsg/db";

export type ContractPricingInput = {
  rateType: ContractRateType | string;
  fixedFare: number | null;
  ratePerKm: number | null;
  monthlyValue: number;
  distanceKm: number;
};

export type ContractGateResult = {
  ok: boolean;
  blocks: string[];
  contractId: string;
  code?: string;
};

/**
 * Tarifa pactada: FIXED | PER_KM | MIXED (fijo + km).
 */
export function calculateContractedFare(input: ContractPricingInput): number {
  const distance = Math.max(0, Number(input.distanceKm) || 0);
  const fixed = Number(input.fixedFare ?? 0);
  const perKm = Number(input.ratePerKm ?? 0);
  const monthly = Number(input.monthlyValue ?? 0);
  const type = String(input.rateType || "FIXED").toUpperCase();

  if (type === "PER_KM") {
    const base = perKm > 0 ? perKm : monthly > 0 ? monthly / 1000 : 0;
    return Math.round(base * distance * 100) / 100;
  }
  if (type === "MIXED") {
    const kmPart = perKm * distance;
    const fixedPart = fixed > 0 ? fixed : monthly > 0 ? monthly / 30 : 0;
    return Math.round((fixedPart + kmPart) * 100) / 100;
  }
  // FIXED
  if (fixed > 0) return Math.round(fixed * 100) / 100;
  if (monthly > 0) return Math.round((monthly / 30) * 100) / 100;
  return 0;
}

export function evaluateContractGate(
  contract: {
    id: string;
    code?: string;
    status: ContractStatus | string;
    startsAt: Date;
    endsAt: Date | null;
    tripQuota: number | null;
    tripsUsed: number;
    budgetCap: number | { toString(): string } | null;
    budgetConsumed: number | { toString(): string };
    vehicleQuota: number | null;
    vehiclesAllocated: number;
  },
  opts?: { departAt?: Date; estimatedFare?: number },
): ContractGateResult {
  const blocks: string[] = [];
  const departAt = opts?.departAt ?? new Date();

  if (contract.status !== ContractStatus.ACTIVE) {
    blocks.push(`CONTRACT_STATUS_${contract.status}`);
  }
  if (contract.startsAt.getTime() > departAt.getTime()) {
    blocks.push("CONTRACT_NOT_STARTED");
  }
  if (contract.endsAt && contract.endsAt.getTime() < departAt.getTime()) {
    blocks.push("CONTRACT_EXPIRED");
  }
  if (
    contract.tripQuota != null &&
    contract.tripsUsed >= contract.tripQuota
  ) {
    blocks.push("CONTRACT_TRIP_QUOTA_EXCEEDED");
  }
  if (contract.budgetCap != null) {
    const remaining =
      Number(contract.budgetCap) - Number(contract.budgetConsumed);
    const est = opts?.estimatedFare ?? 0;
    if (remaining <= 0 || (est > 0 && est > remaining)) {
      blocks.push("CONTRACT_BUDGET_EXCEEDED");
    }
  }
  if (
    contract.vehicleQuota != null &&
    contract.vehiclesAllocated > contract.vehicleQuota
  ) {
    blocks.push("CONTRACT_VEHICLE_QUOTA_EXCEEDED");
  }

  return {
    ok: blocks.length === 0,
    blocks,
    contractId: contract.id,
    code: contract.code,
  };
}
