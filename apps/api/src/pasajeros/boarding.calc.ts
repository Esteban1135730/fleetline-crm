import { createHash, randomBytes } from "crypto";

export const BOARDING_PASS_TTL_MINUTES = 120;

export function generateBoardingToken(): string {
  return randomBytes(24).toString("base64url");
}

export function buildBoardingQrPayload(input: {
  token: string;
  tripId: string;
  passengerId: string;
  organizationId: string;
  expiresAt: Date;
}): string {
  return JSON.stringify({
    v: 1,
    kind: "CORPORATE_BOARDING_PASS",
    token: input.token,
    tripId: input.tripId,
    passengerId: input.passengerId,
    organizationId: input.organizationId,
    expiresAt: input.expiresAt.toISOString(),
    fingerprint: createHash("sha256")
      .update(`${input.token}:${input.tripId}:${input.passengerId}`)
      .digest("hex")
      .slice(0, 16),
  });
}

export function verifyBoardingPassToken(input: {
  token: string;
  storedToken: string;
  status: string;
  expiresAt: Date;
  now?: Date;
}): { ok: boolean; reason?: string } {
  const now = input.now ?? new Date();
  if (input.status === "REVOKED") return { ok: false, reason: "REVOKED" };
  if (input.status === "VALIDATED") return { ok: false, reason: "ALREADY_USED" };
  if (input.status === "EXPIRED" || input.expiresAt.getTime() < now.getTime()) {
    return { ok: false, reason: "EXPIRED" };
  }
  if (input.token !== input.storedToken) {
    return { ok: false, reason: "TOKEN_MISMATCH" };
  }
  return { ok: true };
}

/** ETA simple: distancia haversine / velocidad promedio urbana. */
export function estimateEtaMinutes(input: {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  speedKmh?: number;
}): { distanceKm: number; etaMinutes: number } {
  const speed = input.speedKmh ?? 28;
  const R = 6371;
  const dLat = ((input.toLat - input.fromLat) * Math.PI) / 180;
  const dLng = ((input.toLng - input.fromLng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((input.fromLat * Math.PI) / 180) *
      Math.cos((input.toLat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const distanceKm =
    Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 100) / 100;
  const etaMinutes = Math.max(1, Math.round((distanceKm / speed) * 60));
  return { distanceKm, etaMinutes };
}

export type B2bDashboardInput = {
  tripsTotal: number;
  tripsCompleted: number;
  tripsOnTime: number;
  budgetCap: number | null;
  budgetConsumed: number;
  tripQuota: number | null;
  tripsUsed: number;
  draftInvoices: number;
  draftInvoiceAmount: number;
  issuedInvoices: number;
  activeVehicles: number;
};

export function consolidateB2bDashboard(input: B2bDashboardInput) {
  const slaCompliancePct =
    input.tripsCompleted > 0
      ? Math.round((input.tripsOnTime / input.tripsCompleted) * 1000) / 10
      : 100;
  const budgetPct =
    input.budgetCap != null && input.budgetCap > 0
      ? Math.round((input.budgetConsumed / input.budgetCap) * 1000) / 10
      : null;
  const tripQuotaPct =
    input.tripQuota != null && input.tripQuota > 0
      ? Math.round((input.tripsUsed / input.tripQuota) * 1000) / 10
      : null;

  let health: "NOMINAL" | "ALERT" | "CRITICAL" = "NOMINAL";
  if (
    slaCompliancePct < 70 ||
    (budgetPct != null && budgetPct >= 95) ||
    (tripQuotaPct != null && tripQuotaPct >= 95)
  ) {
    health = "CRITICAL";
  } else if (
    slaCompliancePct < 85 ||
    (budgetPct != null && budgetPct >= 80) ||
    (tripQuotaPct != null && tripQuotaPct >= 80)
  ) {
    health = "ALERT";
  }

  return {
    health,
    sla: {
      tripsTotal: input.tripsTotal,
      tripsCompleted: input.tripsCompleted,
      tripsOnTime: input.tripsOnTime,
      compliancePct: slaCompliancePct,
    },
    budget: {
      cap: input.budgetCap,
      consumed: input.budgetConsumed,
      remaining:
        input.budgetCap != null
          ? Math.max(0, input.budgetCap - input.budgetConsumed)
          : null,
      consumedPct: budgetPct,
    },
    tripQuota: {
      quota: input.tripQuota,
      used: input.tripsUsed,
      remaining:
        input.tripQuota != null
          ? Math.max(0, input.tripQuota - input.tripsUsed)
          : null,
      usedPct: tripQuotaPct,
    },
    preInvoices: {
      draftCount: input.draftInvoices,
      draftAmount: input.draftInvoiceAmount,
      issuedCount: input.issuedInvoices,
    },
    activeVehicles: input.activeVehicles,
  };
}
