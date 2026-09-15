import { randomBytes } from "crypto";
import * as bcrypt from "bcryptjs";
import {
  checkPasswordPolicy,
  GENERIC_TEMP_PASSWORD,
  isKnownGenericPassword,
  PASSWORD_POLICY_MESSAGE,
} from "@fsg/shared";
import { BadRequestException } from "@nestjs/common";

/** Coste mínimo bcrypt (OWASP ≥ 12). */
export const BCRYPT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  plain: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, passwordHash);
}

export { isKnownGenericPassword, GENERIC_TEMP_PASSWORD };

/** Valida política fuerte; lanza BadRequest si falla. */
export function assertPasswordPolicy(plain: string): void {
  const result = checkPasswordPolicy(plain);
  if (!result.ok) {
    throw new BadRequestException(result.message || PASSWORD_POLICY_MESSAGE);
  }
}

/** Clave genérica de flota para reset / handoff (fuerza cambio en login). */
export function getGenericTempPassword(): string {
  return GENERIC_TEMP_PASSWORD;
}

/**
 * Contraseña temporal única (handoff admin → usuario).
 * Garantiza mayúscula, minúscula, dígito y símbolo.
 */
export function generateTempPassword(length = 14): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%&*";
  const all = upper + lower + digits + symbols;
  const size = Math.max(14, length);

  const pick = (alphabet: string) => {
    const bytes = randomBytes(1);
    return alphabet[bytes[0]! % alphabet.length]!;
  };

  const chars: string[] = [
    pick(upper),
    pick(lower),
    pick(digits),
    pick(symbols),
  ];

  const fill = randomBytes(size - chars.length);
  for (let i = 0; i < fill.length; i++) {
    chars.push(all[fill[i]! % all.length]!);
  }

  // Fisher–Yates con entropy crypto
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0]! % (i + 1);
    const tmp = chars[i]!;
    chars[i] = chars[j]!;
    chars[j] = tmp;
  }

  return chars.join("");
}
