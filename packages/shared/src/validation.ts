import { z } from "zod";

/** Tipos de campo canónicos — UI + API */
export type FieldKind =
  | "email"
  | "personName"
  | "legalName"
  | "phone"
  | "document"
  | "nit"
  | "plate"
  | "integer"
  | "decimal"
  | "money"
  | "password"
  | "notes"
  | "text";

export const FIELD_MESSAGES = {
  email: "Correo inválido",
  personName: "Nombre: solo letras, espacios y acentos (2–80)",
  legalName: "Razón social inválida (2–120)",
  phone: "Teléfono inválido (celular 10 dígitos 3xx o fijo 7–10)",
  document: "Documento: 5 a 11 dígitos",
  nit: "NIT inválido (dígitos y DV opcional, ej. 900123456-1)",
  plate: "Placa inválida (ABC123 / ABC12D)",
  integer: "Solo números enteros",
  decimal: "Solo valor numérico",
  money: "Monto inválido",
  password: "Clave: mínimo 8 caracteres",
  notes: "Texto demasiado largo o contiene código no permitido",
  text: "Texto inválido o demasiado largo",
  required: "Campo obligatorio",
} as const;

const HTML_TAG = /<\/?[^>]+>/g;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const DANGEROUS_URI = /javascript:|data:\s*text\/html|vbscript:/gi;

const PERSON_NAME_PARTIAL = /^[\p{L} .'\-]*$/u;
const PERSON_NAME_FULL =
  /^[\p{L}]+(?:[ .'\-]+[\p{L}]+)*\.?$/u;
const LEGAL_NAME_PARTIAL = /^[\p{L}0-9 .,&'\-]*$/u;
const EMAIL_PARTIAL = /^[^\s<>'"]*$/;
const PHONE_PARTIAL = /^[+\d\s().-]*$/;
const DOC_PARTIAL = /^[\d.\-]*$/;
const PLATE_PARTIAL = /^[A-Za-z0-9]*$/;
const INT_PARTIAL = /^\d*$/;
const DEC_PARTIAL = /^\d*([.,]\d*)?$/;
/** COP formateado: $11´000.000 / $11.000.000 */
const MONEY_PARTIAL = /^[$]?\s*[\d.´'’,\s]*$/;

export function digitsOnly(value: string): string {
  return value.replace(/\D+/g, "");
}

export function sanitizeText(
  raw: string,
  opts?: { max?: number; multiline?: boolean; trim?: boolean },
): string {
  let s = String(raw)
    .replace(HTML_TAG, "")
    .replace(CONTROL, "")
    .replace(DANGEROUS_URI, "");
  if (opts?.multiline) {
    s = s.replace(/[^\S\n\r]+/g, " ").replace(/\n{3,}/g, "\n\n");
  } else {
    s = s.replace(/\s+/g, " ");
  }
  if (opts?.trim !== false) s = s.trim();
  return s.slice(0, opts?.max ?? 4000);
}

export function sanitizeUnknown(value: unknown, keyHint = "", depth = 0): unknown {
  if (depth > 10) return undefined;
  if (typeof value === "string") {
    if (/password|clave|secret|token|pin|hash/i.test(keyHint)) {
      return value.replace(/\0/g, "").slice(0, 256);
    }
    return sanitizeText(value, {
      max: /notes|message|body|text|observ|comment|raw/i.test(keyHint)
        ? 20_000
        : 4000,
      multiline: /notes|message|body|text|observ|comment|raw/i.test(keyHint),
    });
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return 0;
    return value;
  }
  if (typeof value === "boolean" || value == null) return value;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) return value;
  if (Array.isArray(value)) {
    return value.slice(0, 500).map((item) => sanitizeUnknown(item, keyHint, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
      if (k.length > 80) continue;
      out[k] = sanitizeUnknown(v, k, depth + 1);
    }
    return out;
  }
  return undefined;
}

function emptyToUndef(val: unknown) {
  if (val == null) return undefined;
  if (typeof val === "string" && val.trim() === "") return undefined;
  return val;
}

export const Field = {
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(5, FIELD_MESSAGES.email)
    .max(254, FIELD_MESSAGES.email)
    .email(FIELD_MESSAGES.email)
    .refine((v) => !v.includes("..") && !v.startsWith("."), FIELD_MESSAGES.email),

  personName: z
    .string()
    .transform((v) => sanitizeText(v, { max: 80 }))
    .pipe(
      z
        .string()
        .min(2, FIELD_MESSAGES.personName)
        .max(80, FIELD_MESSAGES.personName)
        .regex(PERSON_NAME_FULL, FIELD_MESSAGES.personName),
    ),

  legalName: z
    .string()
    .transform((v) => sanitizeText(v, { max: 120 }))
    .pipe(
      z
        .string()
        .min(2, FIELD_MESSAGES.legalName)
        .max(120, FIELD_MESSAGES.legalName)
        .regex(LEGAL_NAME_PARTIAL, FIELD_MESSAGES.legalName),
    ),

  phone: z
    .string()
    .transform((v) => digitsOnly(v))
    .pipe(
      z.string().refine((d) => {
        if (d.startsWith("57") && d.length === 12) d = d.slice(2);
        if (d.length === 10 && d.startsWith("3")) return true;
        return d.length >= 7 && d.length <= 10;
      }, FIELD_MESSAGES.phone),
    ),

  document: z
    .string()
    .transform((v) => digitsOnly(v))
    .pipe(
      z
        .string()
        .min(5, FIELD_MESSAGES.document)
        .max(11, FIELD_MESSAGES.document)
        .regex(/^\d+$/, FIELD_MESSAGES.document),
    ),

  nit: z
    .string()
    .transform((v) => v.trim().replace(/\s+/g, ""))
    .pipe(
      z.string().refine((v) => {
        const compact = v.replace(/[.\s]/g, "");
        return /^\d{5,12}(-\d)?$/.test(compact);
      }, FIELD_MESSAGES.nit),
    ),

  plate: z
    .string()
    .transform((v) => v.trim().toUpperCase().replace(/[\s-]/g, ""))
    .pipe(
      z
        .string()
        .regex(/^[A-Z]{3}[0-9]{2}[A-Z0-9]$|^[A-Z]{3}[0-9]{3}$/, FIELD_MESSAGES.plate),
    ),

  integer: z.coerce
    .number({ invalid_type_error: FIELD_MESSAGES.integer })
    .int(FIELD_MESSAGES.integer)
    .finite(),

  decimal: z.coerce
    .number({ invalid_type_error: FIELD_MESSAGES.decimal })
    .finite(FIELD_MESSAGES.decimal),

  money: z.preprocess((v) => {
    if (typeof v === "string") {
      const d = v.replace(/[^\d]/g, "");
      return d ? Number(d) : v;
    }
    return v;
  }, z.number({ invalid_type_error: FIELD_MESSAGES.money })
    .finite()
    .nonnegative(FIELD_MESSAGES.money)
    .max(999_999_999_999, FIELD_MESSAGES.money)),

  password: z
    .string()
    .min(8, FIELD_MESSAGES.password)
    .max(128, FIELD_MESSAGES.password)
    .refine((v) => v.trim().length >= 8, FIELD_MESSAGES.password),

  notes: z
    .string()
    .transform((v) => sanitizeText(v, { max: 4000, multiline: true }))
    .pipe(z.string().max(4000, FIELD_MESSAGES.notes)),

  text: z
    .string()
    .transform((v) => sanitizeText(v, { max: 500 }))
    .pipe(z.string().min(1).max(500)),
};

export const FieldOptional = {
  email: z.preprocess(emptyToUndef, Field.email.optional()),
  personName: z.preprocess(emptyToUndef, Field.personName.optional()),
  legalName: z.preprocess(emptyToUndef, Field.legalName.optional()),
  phone: z.preprocess(emptyToUndef, Field.phone.optional()),
  document: z.preprocess(emptyToUndef, Field.document.optional()),
  nit: z.preprocess(emptyToUndef, Field.nit.optional()),
  plate: z.preprocess(emptyToUndef, Field.plate.optional()),
  notes: z.preprocess(emptyToUndef, Field.notes.optional()),
  text: z.preprocess(emptyToUndef, Field.text.optional()),
};

export function inferFieldKind(hints: {
  type?: string;
  name?: string;
  id?: string;
  inputMode?: string;
  autocomplete?: string;
  placeholder?: string;
  ariaLabel?: string;
  dataField?: string | null;
}): FieldKind | null {
  const data = (hints.dataField || "").trim();
  if (data === "skip" || data === "off") return null;
  const allowed: FieldKind[] = [
    "email",
    "personName",
    "legalName",
    "phone",
    "document",
    "nit",
    "plate",
    "integer",
    "decimal",
    "money",
    "password",
    "notes",
    "text",
  ];
  if (allowed.includes(data as FieldKind)) return data as FieldKind;

  const type = (hints.type || "").toLowerCase();
  if (
    [
      "hidden",
      "checkbox",
      "radio",
      "file",
      "button",
      "submit",
      "reset",
      "color",
      "range",
      "date",
      "datetime-local",
      "month",
      "week",
      "time",
      "search",
      "url",
    ].includes(type)
  ) {
    return null;
  }

  const blob = [
    hints.name,
    hints.id,
    hints.autocomplete,
    hints.placeholder,
    hints.ariaLabel,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (/\b(buscar|search|filtro|query)\b/.test(blob) || type === "search") {
    return null;
  }

  if (type === "email" || hints.inputMode === "email" || /email|correo/.test(blob)) {
    return "email";
  }
  if (type === "password" || /password|clave|contrasena/.test(blob)) {
    if (
      hints.autocomplete === "current-password" ||
      /current-password|contrasena actual|clave actual/.test(blob)
    ) {
      return null;
    }
    return "password";
  }
  if (type === "tel" || hints.inputMode === "tel" || /tel|phone|celular|movil|whatsapp/.test(blob)) {
    return "phone";
  }
  if (/\bnit\b/.test(blob)) return "nit";
  if (/cedula|documento|identificacion|nuip|\bid\b/.test(blob)) return "document";
  if (/placa|plate/.test(blob)) return "plate";
  if (
    /salario|monto|valor|precio|amount|salary|cop|total|costo|tarifa/.test(blob)
  ) {
    return "money";
  }
  if (type === "number") {
    return hints.inputMode === "decimal" ? "decimal" : "integer";
  }
  if (hints.inputMode === "numeric") return "integer";
  if (hints.inputMode === "decimal") return "decimal";
  if (/licencias|maxusers|km\b|horas|cantidad|cupo|score/.test(blob)) {
    return "integer";
  }
  if (/razon social|organizacion|empresa|compania|accountname/.test(blob)) {
    return "legalName";
  }
  if (/nombre|name|apellido|conductor|host|solicitante|requester/.test(blob)) {
    return "personName";
  }
  if (type === "textarea" || /observ|nota|mensaje|message|comentario/.test(blob)) {
    return "notes";
  }
  return "text";
}

export function isAllowedPartial(kind: FieldKind, value: string): boolean {
  if (value.length > maxLen(kind)) return false;
  switch (kind) {
    case "email":
      return EMAIL_PARTIAL.test(value) && !value.includes(" ");
    case "personName":
      return PERSON_NAME_PARTIAL.test(value);
    case "legalName":
      return LEGAL_NAME_PARTIAL.test(value);
    case "phone":
      return PHONE_PARTIAL.test(value);
    case "document":
    case "nit":
      return DOC_PARTIAL.test(value);
    case "plate":
      return PLATE_PARTIAL.test(value);
    case "integer":
      return INT_PARTIAL.test(value);
    case "decimal":
      return DEC_PARTIAL.test(value);
    case "money":
      return MONEY_PARTIAL.test(value);
    case "password":
      return value.length <= 128 && !/[\u0000-\u0008]/.test(value);
    case "notes":
    case "text":
      return !/<\/?[^>]+>/.test(value) && !/javascript:|data:\s*text\/html|vbscript:/i.test(value);
    default:
      return true;
  }
}

export function filterPasted(kind: FieldKind, raw: string): string {
  const cut = raw.slice(0, maxLen(kind));
  switch (kind) {
    case "email":
      return cut.replace(/\s+/g, "").toLowerCase();
    case "personName":
      return [...cut].filter((ch) => PERSON_NAME_PARTIAL.test(ch)).join("");
    case "legalName":
      return [...cut].filter((ch) => LEGAL_NAME_PARTIAL.test(ch)).join("");
    case "phone":
      return cut.replace(/[^\d+\s().-]/g, "");
    case "document":
      return cut.replace(/[^\d.\-]/g, "");
    case "nit":
      return cut.replace(/[^\d.\-]/g, "");
    case "plate":
      return cut.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    case "integer":
      return digitsOnly(cut);
    case "decimal":
      return cut.replace(/[^\d.,]/g, "");
    case "money":
      return cut.replace(/[^\d$´'’.,\s]/g, "");
    case "password":
      return cut.replace(/\0/g, "");
    case "notes":
      return sanitizeText(cut, { max: 4000, multiline: true, trim: false });
    default:
      return sanitizeText(cut, { max: 500, trim: false });
  }
}

export function validateComplete(
  kind: FieldKind,
  value: string,
  required: boolean,
): string | null {
  const trimmed = value.trim();
  if (!trimmed) return required ? FIELD_MESSAGES.required : null;
  const schema = schemaForKind(kind);
  const parsed = schema.safeParse(value);
  return parsed.success ? null : FIELD_MESSAGES[kind];
}

function schemaForKind(kind: FieldKind) {
  switch (kind) {
    case "email":
      return Field.email;
    case "personName":
      return Field.personName;
    case "legalName":
      return Field.legalName;
    case "phone":
      return Field.phone;
    case "document":
      return Field.document;
    case "nit":
      return Field.nit;
    case "plate":
      return Field.plate;
    case "integer":
      return Field.integer;
    case "decimal":
      return Field.decimal;
    case "money":
      return Field.money;
    case "password":
      return Field.password;
    case "notes":
      return Field.notes;
    default:
      return Field.text;
  }
}

function maxLen(kind: FieldKind): number {
  switch (kind) {
    case "email":
      return 254;
    case "personName":
      return 80;
    case "legalName":
      return 120;
    case "phone":
      return 18;
    case "document":
      return 14;
    case "nit":
      return 16;
    case "plate":
      return 8;
    case "integer":
      return 15;
    case "decimal":
    case "money":
      return 18;
    case "password":
      return 128;
    case "notes":
      return 4000;
    default:
      return 500;
  }
}
