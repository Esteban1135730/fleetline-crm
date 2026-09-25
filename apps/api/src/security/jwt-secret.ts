/**
 * Resuelve JWT_SECRET. En producción falla el boot si falta o es el secreto de demo.
 * SCRUM-93: soporta JWT_SECRET_PREVIOUS + overlap TTL para rotación graceful.
 */
import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const FORBIDDEN_SECRETS = new Set([
  "dev-secret-fsg-mega-os-2026",
  "cambia_esta_clave",
  "cambia_este_secreto_local_min_32_chars_xx",
  "genera_un_secreto_largo_aleatorio_minimo_32",
  "changeme",
  "secret",
]);

export function resolveJwtSecret(): string {
  const secret = (process.env.JWT_SECRET || "").trim();
  const isProd =
    process.env.NODE_ENV === "production" ||
    process.env.FLEETLINE_ENV === "production";

  if (!secret) {
    if (isProd) {
      throw new Error(
        "JWT_SECRET es obligatorio en producción. Defínelo en .env.production.",
      );
    }
    throw new Error(
      "JWT_SECRET no definido. Cópialo desde .env.example a .env (nunca uses el valor de ejemplo en prod).",
    );
  }

  if (isProd && (FORBIDDEN_SECRETS.has(secret) || secret.length < 32)) {
    throw new Error(
      "JWT_SECRET de producción inválido (demasiado corto o es un secreto de demo).",
    );
  }

  return secret;
}

/** Secreto anterior vigente solo si JWT_SECRET_PREVIOUS_UNTIL > now. */
export function resolveJwtPreviousSecret(): string | null {
  const previous = (process.env.JWT_SECRET_PREVIOUS || "").trim();
  if (!previous) return null;
  const until = Number(process.env.JWT_SECRET_PREVIOUS_UNTIL || 0);
  if (!Number.isFinite(until) || until <= Date.now()) return null;
  return previous;
}

/** Lista de secretos aceptados para verificar tokens (actual + previous en overlap). */
export function resolveJwtVerifySecrets(): string[] {
  const secrets = [resolveJwtSecret()];
  const previous = resolveJwtPreviousSecret();
  if (previous && previous !== secrets[0]) secrets.push(previous);
  return secrets;
}

function b64urlToBuffer(input: string): Buffer {
  const pad = "=".repeat((4 - (input.length % 4)) % 4);
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

/** Verifica firma HS256 + exp sin dependencia directa de jsonwebtoken. */
function jwtHs256Valid(rawJwtToken: string, secret: string): boolean {
  const parts = rawJwtToken.split(".");
  if (parts.length !== 3) return false;
  const [headerB64, payloadB64, sigB64] = parts;
  if (!headerB64 || !payloadB64 || !sigB64) return false;

  const data = `${headerB64}.${payloadB64}`;
  const expected = createHmac("sha256", secret).update(data).digest();
  let actual: Buffer;
  try {
    actual = b64urlToBuffer(sigB64);
  } catch {
    return false;
  }
  if (actual.length !== expected.length) return false;
  if (!timingSafeEqual(actual, expected)) return false;

  try {
    const payload = JSON.parse(b64urlToBuffer(payloadB64).toString("utf8")) as {
      exp?: number;
    };
    if (typeof payload.exp === "number" && payload.exp * 1000 <= Date.now()) {
      return false;
    }
  } catch {
    return false;
  }
  return true;
}

/**
 * Elige el secreto que verifica el JWT crudo (para passport secretOrKeyProvider).
 */
export function pickJwtSecretForToken(rawJwtToken: string): string {
  const secrets = resolveJwtVerifySecrets();
  for (const secret of secrets) {
    if (jwtHs256Valid(rawJwtToken, secret)) return secret;
  }
  return secrets[0]!;
}

/**
 * Rotación graceful in-process: mueve el actual a PREVIOUS con TTL de overlap.
 * No invalida sesiones existentes mientras el secreto anterior esté vigente.
 */
export function rotateJwtSecretGraceful(opts?: {
  overlapHours?: number;
  nextSecret?: string;
}): {
  rotated: true;
  overlapHours: number;
  previousUntil: string;
  sessionsPreserved: true;
} {
  const overlapHours = Math.min(
    168,
    Math.max(1, Math.floor(opts?.overlapHours ?? 24)),
  );
  const current = resolveJwtSecret();
  const next =
    (opts?.nextSecret || "").trim() ||
    randomBytes(48).toString("base64url");

  if (next.length < 32) {
    throw new Error("El nuevo JWT_SECRET debe tener al menos 32 caracteres");
  }

  process.env.JWT_SECRET_PREVIOUS = current;
  process.env.JWT_SECRET_PREVIOUS_UNTIL = String(
    Date.now() + overlapHours * 60 * 60 * 1000,
  );
  process.env.JWT_SECRET = next;

  return {
    rotated: true,
    overlapHours,
    previousUntil: new Date(
      Number(process.env.JWT_SECRET_PREVIOUS_UNTIL),
    ).toISOString(),
    sessionsPreserved: true,
  };
}
