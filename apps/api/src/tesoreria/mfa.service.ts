import { ForbiddenException, Injectable } from "@nestjs/common";

/**
 * Validación MFA Tesorería (OTP).
 * En producción exige TREASURY_MFA_STATIC_OTP (≥6 dígitos) — nunca el default 000000.
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

  private expectedOtp(): string {
    const isProd =
      process.env.NODE_ENV === "production" ||
      process.env.FLEETLINE_ENV === "production";
    const fromEnv = (process.env.TREASURY_MFA_STATIC_OTP || "").trim();
    if (isProd) {
      if (!fromEnv || fromEnv === "000000" || !/^\d{6}$/.test(fromEnv)) {
        throw new ForbiddenException(
          "MFA de tesorería no configurado (TREASURY_MFA_STATIC_OTP)",
        );
      }
      return fromEnv;
    }
    return fromEnv || "000000";
  }

  validateToken(token: string, _userEmail?: string): boolean {
    const expected = this.expectedOtp();
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
