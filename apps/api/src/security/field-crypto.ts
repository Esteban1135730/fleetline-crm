import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;
const PREFIX = "enc:v1:";

function deriveKey(): Buffer {
  const raw = (process.env.FIELD_ENCRYPTION_KEY || process.env.JWT_SECRET || "").trim();
  if (!raw) {
    throw new Error("FIELD_ENCRYPTION_KEY (o JWT_SECRET) requerido para cifrado de campos");
  }
  return scryptSync(raw, "fleetline-field-crypto-v1", 32);
}

/** Cifra texto sensible (AES-256-GCM). Vacío → vacío. */
export function encryptField(plain: string | null | undefined): string | null {
  if (plain == null || plain === "") return plain ?? null;
  if (plain.startsWith(PREFIX)) return plain;
  const key = deriveKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${Buffer.concat([iv, tag, enc]).toString("base64url")}`;
}

/** Descifra valor `enc:v1:…`. Si no está cifrado, lo devuelve tal cual (migración gradual). */
export function decryptField(stored: string | null | undefined): string | null {
  if (stored == null || stored === "") return stored ?? null;
  if (!stored.startsWith(PREFIX)) return stored;
  const key = deriveKey();
  const buf = Buffer.from(stored.slice(PREFIX.length), "base64url");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const data = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function isEncryptedField(value: string | null | undefined): boolean {
  return Boolean(value?.startsWith(PREFIX));
}
