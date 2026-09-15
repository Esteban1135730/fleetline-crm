/** Política de contraseñas NEXA — SSOT web + API. */

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * Clave genérica de flota (alta/reset).
 * Nunca es permanente: al detectarla en login se fuerza el cambio.
 */
export const GENERIC_TEMP_PASSWORD = "Inretrans2026*" as const;

/** Claves de demo / reset que nunca deben usarse como permanentes. */
export const KNOWN_GENERIC_PASSWORDS = [
  GENERIC_TEMP_PASSWORD,
  "Fleet2026*",
  "fsg2026",
  "Fsg2026*",
  "password",
  "Password1!",
  "12345678",
  "1234567890",
  "admin123",
  "Admin123!",
] as const;

const GENERIC_SET = new Set(
  KNOWN_GENERIC_PASSWORDS.map((p) => p.toLowerCase()),
);

export const PASSWORD_POLICY_MESSAGE =
  "Clave: mín. 10 caracteres, mayúscula, minúscula, número y símbolo";

export function isKnownGenericPassword(plain: string): boolean {
  const t = plain.trim();
  if (!t) return false;
  return GENERIC_SET.has(t.toLowerCase());
}

export type PasswordPolicyResult =
  | { ok: true }
  | { ok: false; message: string };

export function checkPasswordPolicy(plain: string): PasswordPolicyResult {
  const value = typeof plain === "string" ? plain : "";
  if (value.length < PASSWORD_MIN_LENGTH || value.length > PASSWORD_MAX_LENGTH) {
    return { ok: false, message: PASSWORD_POLICY_MESSAGE };
  }
  if (value.trim().length < PASSWORD_MIN_LENGTH) {
    return { ok: false, message: PASSWORD_POLICY_MESSAGE };
  }
  if (!/[A-Z]/.test(value) || !/[a-z]/.test(value)) {
    return { ok: false, message: PASSWORD_POLICY_MESSAGE };
  }
  if (!/[0-9]/.test(value) || !/[^A-Za-z0-9]/.test(value)) {
    return { ok: false, message: PASSWORD_POLICY_MESSAGE };
  }
  if (isKnownGenericPassword(value)) {
    return {
      ok: false,
      message: "Esa clave es genérica o de demo — elige una distinta",
    };
  }
  return { ok: true };
}
