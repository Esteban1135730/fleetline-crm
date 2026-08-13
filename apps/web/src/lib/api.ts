import type { Role } from "@fsg/shared";

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
  directiveReadOnly?: boolean;
  status?: string;
};

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("fsg_token");
}

export function setSession(token: string, user: AuthUser) {
  localStorage.setItem("fsg_token", token);
  localStorage.setItem("fsg_user", JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem("fsg_token");
  localStorage.removeItem("fsg_user");
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

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers: HeadersInit = {
    ...(options.headers || {}),
  };
  const isForm =
    typeof FormData !== "undefined" && options.body instanceof FormData;
  if (!isForm) {
    (headers as Record<string, string>)["Content-Type"] = "application/json";
  }
  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeoutMs = 12_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
      signal: options.signal ?? controller.signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(formatApiError(err, `Error ${res.status}`));
    }
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Error de sincronización con la red — uplink timeout");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export namespace api {
  export function get<T>(path: string, options?: RequestInit): Promise<T> {
    return api<T>(path, { ...options, method: "GET" });
  }
  export function post<T>(
    path: string,
    body?: unknown,
    options?: RequestInit,
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
