import { Injectable } from "@nestjs/common";

/**
 * Validación MFA Tesorería (OTP / TOTP simulado).
 * - Umbral: TREASURY_MFA_THRESHOLD_COP (default 5_000_000)
 * - Token demo: TREASURY_MFA_STATIC_OTP (default 000000) o TOTP real si se integra después
 */
@Injectable()
export class MfaService {
  thresholdCop(): number {
    const raw = process.env.TREASURY_MFA_THRESHOLD_COP;
    const n = raw ? Number(raw) : 5_000_000;
    return Number.isFinite(n) && n >= 0 ? n : 5_000_000;
  }

  requiresMfa(amount: number): boolean {
    return Number(amount) > this.thresholdCop();
  }

  validateToken(token: string, _userEmail?: string): boolean {
    const expected = (process.env.TREASURY_MFA_STATIC_OTP || "000000").trim();
    const clean = String(token || "").replace(/\s/g, "");
    if (clean.length !== 6 || !/^\d{6}$/.test(clean)) return false;
    return clean === expected;
  }

  assertMfaForAmount(amount: number, mfaToken?: string, userEmail?: string) {
    if (!this.requiresMfa(amount)) {
      return { required: false, verified: false };
    }
    if (!mfaToken?.trim()) {
      return { required: true, verified: false, error: "MFA_REQUIRED" as const };
    }
    if (!this.validateToken(mfaToken, userEmail)) {
      return { required: true, verified: false, error: "MFA_INVALID" as const };
    }
    return { required: true, verified: true };
  }
}
