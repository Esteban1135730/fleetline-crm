export class MutationCancelled extends Error {
  constructor() {
    super("Operación cancelada — no se aplicaron cambios");
    this.name = "MutationCancelled";
  }
}

export function isMutationCancelled(err: unknown) {
  return err instanceof MutationCancelled || (err as { name?: string })?.name === "MutationCancelled";
}

export type MutationKind = "edit" | "delete";

export type MutationConfirmInput = {
  kind: MutationKind;
  title?: string;
  previous?: Record<string, unknown> | null;
  next?: Record<string, unknown> | null;
  record?: Record<string, unknown> | null;
  path?: string;
};

export type MutationRow = {
  key: string;
  label: string;
  before: string;
  after: string;
  changed: boolean;
};

const FIELD_LABELS: Record<string, string> = {
  plate: "Placa",
  brand: "Marca",
  model: "Línea / modelo",
  year: "Año del vehículo",
  capacity: "Cupo de pasajeros",
  status: "Estado",
  name: "Nombre",
  email: "Email",
  phone: "Teléfono",
  document: "Documento",
  role: "Rol",
  active: "Activo",
  description: "Descripción",
  subject: "Asunto",
  requester: "Solicitante",
  message: "Mensaje",
  hostName: "Anfitrión",
  company: "Empresa",
  amount: "Monto",
  notes: "Notas",
  code: "Código",
  title: "Título",
  type: "Tipo",
  channel: "Canal",
  priority: "Prioridad",
  validTo: "Vigencia",
  reference: "Referencia",
  vehicleId: "Unidad",
  id: "ID",
};

const HIDDEN = new Set([
  "password",
  "currentPassword",
  "newPassword",
  "token",
  "accessToken",
  "organizationId",
  "createdAt",
  "updatedAt",
]);

export function fieldLabel(key: string) {
  return FIELD_LABELS[key] || key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
}

export function formatConfirmValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((v) => formatConfirmValue(v)).join(", ");
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (typeof o.plate === "string") return o.plate;
    if (typeof o.name === "string") return o.name;
    if (typeof o.code === "string") return o.code;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function flatten(input: Record<string, unknown> | null | undefined) {
  const out: Record<string, unknown> = {};
  if (!input) return out;
  for (const [k, v] of Object.entries(input)) {
    if (HIDDEN.has(k) || k.startsWith("_")) continue;
    out[k] = v;
  }
  return out;
}

export function buildEditRows(
  previous?: Record<string, unknown> | null,
  next?: Record<string, unknown> | null,
): MutationRow[] {
  const a = flatten(previous);
  const b = flatten(next);
  const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)]));
  return keys.map((key) => {
    const before = formatConfirmValue(a[key]);
    const after = formatConfirmValue(b[key]);
    return {
      key,
      label: fieldLabel(key),
      before,
      after,
      changed: before !== after,
    };
  });
}

export function buildDeleteRows(record?: Record<string, unknown> | null): MutationRow[] {
  const a = flatten(record);
  return Object.keys(a).map((key) => ({
    key,
    label: fieldLabel(key),
    before: formatConfirmValue(a[key]),
    after: "Se eliminará",
    changed: true,
  }));
}

export function parseJsonBody(body: unknown): Record<string, unknown> | null {
  if (!body) return null;
  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return { payload: body };
    }
    return null;
  }
  if (typeof body === "object" && !(body instanceof FormData) && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return null;
}

type Handler = (input: MutationConfirmInput) => Promise<boolean>;

let handler: Handler | null = null;

export function registerMutationConfirmHandler(fn: Handler | null) {
  handler = fn;
}

export async function requestMutationConfirm(input: MutationConfirmInput) {
  if (!handler) return true;
  return handler(input);
}
