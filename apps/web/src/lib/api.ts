const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role:
    | "presidencia"
    | "gerencia"
    | "finanzas"
    | "despacho"
    | "rrhh"
    | "atencion"
    | "sistemas";
  organizationId: string;
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
      throw new Error(
        Array.isArray(err.message)
          ? err.message.join(", ")
          : err.message || `Error ${res.status}`,
      );
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

export function getTokenPublic() {
  return getToken();
}

export { API_URL };
