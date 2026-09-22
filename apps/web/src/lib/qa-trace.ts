/** Cliente QA Trace — beacon de rutas/acciones en staging. */

const SESSION_KEY = "fsg_qa_session";

export function isQaTraceClientEnabled(): boolean {
  const v = (process.env.NEXT_PUBLIC_QA_TRACE || "").trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off") return false;
  if (v === "1" || v === "true" || v === "on") return true;
  // Por defecto activo fuera de production build
  return process.env.NODE_ENV !== "production";
}

export function isQaViewerClient(email: string | null | undefined): boolean {
  if (!email) return false;
  const raw =
    process.env.NEXT_PUBLIC_QA_TRACE_ALLOWLIST ||
    "esteban@inretrans.com,esteban";
  const list = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const e = email.trim().toLowerCase();
  const local = e.split("@")[0] || "";
  return list.some((entry) => {
    if (entry.includes("@")) return e === entry;
    return local === entry || local.includes(entry) || e.includes(entry);
  });
}

export function getOrCreateQaSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `qa_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export function getQaSessionId(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(SESSION_KEY);
}
