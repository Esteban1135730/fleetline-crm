import type { Role } from "@fsg/shared";
import {
  MutationCancelled,
  parseJsonBody,
  requestMutationConfirm,
} from "@/lib/mutation-confirm";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  organizationId: string;
  /** Alias multi-tenant (= organizationId) */
  tenantId?: string;
  companyId?: string;
  organizationName?: string;
  directiveReadOnly?: boolean;
  status?: string;
};

const ACTIVE_ORG_KEY = "fsg_active_org";

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("fsg_token");
}

export function getActiveOrganizationId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACTIVE_ORG_KEY);
}

export function setActiveOrganizationId(id: string | null) {
  if (typeof window === "undefined") return;
  if (!id) localStorage.removeItem(ACTIVE_ORG_KEY);
  else localStorage.setItem(ACTIVE_ORG_KEY, id);
}

export function setSession(token: string, user: AuthUser) {
  localStorage.setItem("fsg_token", token);
  localStorage.setItem("fsg_user", JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem("fsg_token");
  localStorage.removeItem("fsg_user");
  localStorage.removeItem(ACTIVE_ORG_KEY);
}

function skipTenantHeader(path: string) {
  return (
    path.startsWith("/plataforma") ||
    path.startsWith("/api/v1/plataforma") ||
    path.startsWith("/auth/login") ||
    path.startsWith("/auth/register")
  );
}

function tenantHeaderFor(path: string): string | null {
  if (skipTenantHeader(path)) return null;
  const stored = getStoredUser();
  if (stored?.role !== "platform_master") return null;
  return getActiveOrganizationId() || stored.organizationId || null;
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("fsg_user");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

function formatApiError(err: unknown, fallback: string): string {
  if (!err || typeof err !== "object") return fallback;
  const e = err as {
    message?: unknown;
    violations?: Array<{ message?: string }>;
  };
  if (typeof e.message === "string" && e.message.trim()) return e.message;
  if (Array.isArray(e.message)) {
    return e.message
      .map((m) =>
        typeof m === "string"
          ? m
          : m && typeof m === "object" && "message" in m
            ? String((m as { message: unknown }).message)
            : JSON.stringify(m),
      )
      .join(" · ");
  }
  if (e.message && typeof e.message === "object") {
    const nested = e.message as {
      message?: unknown;
      violations?: Array<{ message?: string }>;
    };
    if (typeof nested.message === "string") {
      const extras = nested.violations
        ?.map((v) => v.message)
        .filter(Boolean)
        .join(" · ");
      return extras ? `${nested.message} (${extras})` : nested.message;
    }
  }
  if (e.violations?.length) {
    return e.violations.map((v) => v.message).filter(Boolean).join(" · ");
  }
  return fallback;
}

export type MutationConfirmOptions = {
  skip?: boolean;
  title?: string;
  previous?: Record<string, unknown>;
  record?: Record<string, unknown>;
};

export type ApiOptions = RequestInit & {
  confirm?: MutationConfirmOptions;
};

const SKIP_CONFIRM_PATH =
  /notifications|\/health\b|\/auth\/me\b|telemetry|gps|heartbeat|presence|socket/i;

async function confirmMutationIfNeeded(
  path: string,
  options: ApiOptions,
) {
  const confirm = options.confirm;
  if (confirm?.skip) return;
  const method = String(options.method || "GET").toUpperCase();
  if (method !== "PATCH" && method !== "PUT" && method !== "DELETE") return;
  if (SKIP_CONFIRM_PATH.test(path)) return;
  const next = parseJsonBody(options.body);
  const kind = method === "DELETE" ? "delete" : "edit";
  const ok = await requestMutationConfirm({
    kind,
    title:
      confirm?.title ||
      (kind === "delete" ? "Confirmar eliminación" : "Confirmar edición"),
    previous: confirm?.previous,
    next: kind === "edit" ? next : undefined,
    record: confirm?.record || (kind === "delete" ? next || confirm?.previous : undefined),
    path,
  });
  if (!ok) throw new MutationCancelled();
}

export async function api<T>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  await confirmMutationIfNeeded(path, options);

  const { confirm: _confirm, ...fetchOptions } = options;
  const token = getToken();
  const headers: HeadersInit = {
    ...(fetchOptions.headers || {}),
  };
  const isForm =
    typeof FormData !== "undefined" && fetchOptions.body instanceof FormData;
  if (!isForm) {
    (headers as Record<string, string>)["Content-Type"] = "application/json";
  }
  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }
  const tenantId = tenantHeaderFor(path);
  if (tenantId) {
    (headers as Record<string, string>)["X-Organization-Id"] = tenantId;
  }

  const controller = new AbortController();
  const timeoutMs = 12_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...fetchOptions,
      headers,
      signal: fetchOptions.signal ?? controller.signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(formatApiError(err, `Error ${res.status}`));
    }
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  } catch (err) {
    if (err instanceof MutationCancelled) throw err;
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Error de sincronización con la red — tiempo de espera agotado");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export namespace api {
  export function get<T>(path: string, options?: ApiOptions): Promise<T> {
    return api<T>(path, { ...options, method: "GET" });
  }
  export function post<T>(
    path: string,
    body?: unknown,
    options?: ApiOptions,
  ): Promise<T> {
    return api<T>(path, {
      ...options,
      method: "POST",
      body:
        body === undefined
          ? options?.body
          : typeof body === "string"
            ? body
            : JSON.stringify(body),
    });
  }
}

export async function apiDownload(
  path: string,
  filename: string,
): Promise<void> {
  const token = getToken();
  const headers: HeadersInit = {};
  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }
  const tenantId = tenantHeaderFor(path);
  if (tenantId) {
    (headers as Record<string, string>)["X-Organization-Id"] = tenantId;
  }

  const res = await fetch(`${API_URL}${path}`, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(
      Array.isArray(err.message)
        ? err.message.join(", ")
        : err.message || `Error ${res.status}`,
    );
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function getTokenPublic() {
  return getToken();
}

export { API_URL };
