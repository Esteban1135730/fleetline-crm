/** Módulos canónicos esperados en un recorrido QA completo (staging). */
export const QA_EXPECTED_MODULES = [
  "comercial",
  "logistica",
  "operaciones",
  "patio",
  "tramites",
  "taller",
  "compras",
  "tesoreria",
  "contabilidad",
  "rrhh",
  "recepcion",
  "qhse",
  "sarlaft",
  "archivo",
  "ti",
  "presidencia",
  "gerencia",
] as const;

const ALIAS: Record<string, string> = {
  dashboard: "dashboard",
  clientes: "comercial",
  customers: "comercial",
  logistics: "logistica",
  despacho: "operaciones",
  parqueadero: "patio",
  yard: "patio",
  workshop: "taller",
  finance: "tesoreria",
  finanzas: "tesoreria",
  nominas: "rrhh",
  nomina: "rrhh",
  hqse: "qhse",
  call_center: "recepcion",
  "call-center": "recepcion",
  tecnologia: "ti",
  "control-interno": "revisoria",
  revisoria: "revisoria",
  "revisoria-fiscal": "revisoria",
  juridico: "juridico",
  vinculaciones: "vinculaciones",
  escolar: "escolar",
  pasajeros: "pasajeros",
  "clientes-b2b": "comercial",
  fuec: "tramites",
  fleet: "logistica",
  apps: "apps",
  "qa-trace": "qa-trace",
  cuenta: "cuenta",
  login: "login",
};

export function moduleKeyFromPath(path: string | null | undefined): string | null {
  if (!path) return null;
  const clean = path.split("?")[0].replace(/^\/+/, "");
  const seg = clean.split("/").filter(Boolean)[0];
  if (!seg) return "dashboard";
  const lower = seg.toLowerCase();
  if (ALIAS[lower]) return ALIAS[lower];
  return lower;
}

export function isQaTraceEnabled(): boolean {
  const v = (process.env.QA_TRACE_ENABLED || "").trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes") return true;
  // Staging / non-production by default when FLEETLINE_ENV is not production
  const env = (process.env.FLEETLINE_ENV || process.env.NODE_ENV || "").toLowerCase();
  return env !== "production";
}

export function qaAllowlist(): string[] {
  const raw =
    process.env.QA_TRACE_ALLOWLIST ||
    "esteban@inretrans.com,esteban";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isQaViewerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  const local = e.split("@")[0] || "";
  const list = qaAllowlist();
  return list.some((entry) => {
    if (entry.includes("@")) return e === entry;
    return local === entry || local.includes(entry) || e.includes(entry);
  });
}

export function clientIp(req: {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
}): string | null {
  const xf = req.headers?.["x-forwarded-for"];
  const fromXf = Array.isArray(xf) ? xf[0] : xf;
  const first = (fromXf || "").split(",")[0]?.trim();
  if (first) return first.slice(0, 120);
  if (req.ip) return String(req.ip).slice(0, 120);
  return null;
}

export function coverageScore(modulesTouched: string[]): {
  score: number;
  expected: number;
  hit: number;
  missing: string[];
} {
  const set = new Set(modulesTouched.map((m) => m.toLowerCase()));
  const missing = QA_EXPECTED_MODULES.filter((m) => !set.has(m));
  const hit = QA_EXPECTED_MODULES.length - missing.length;
  const score = Math.round((hit / QA_EXPECTED_MODULES.length) * 100);
  return {
    score,
    expected: QA_EXPECTED_MODULES.length,
    hit,
    missing: [...missing],
  };
}
