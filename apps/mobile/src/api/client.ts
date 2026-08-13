import { Platform } from "react-native";
import Constants from "expo-constants";
import {
  clearSession,
  getToken,
  isTokenExpired,
  setSession,
  tokenExpiresSoon,
} from "../auth/session";
import type { AuthUser } from "../types";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

export class SessionExpiredError extends Error {
  constructor(message = "Sesión expirada — autentique de nuevo") {
    super(message);
    this.name = "SessionExpiredError";
  }
}

type GlobalHandlers = {
  onUnauthorized?: () => void;
  onOffline?: () => void;
};

const handlers: GlobalHandlers = {};

export function setApiHandlers(next: GlobalHandlers) {
  Object.assign(handlers, next);
}

function lanHostFromExpo(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants as { manifest?: { debuggerHost?: string } }).manifest
      ?.debuggerHost ??
    null;
  if (!hostUri) return null;
  const host = String(hostUri).split("/")[0]?.split(":")[0];
  if (!host || host === "localhost" || host === "127.0.0.1") return null;
  return host;
}

export function getApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const lan = lanHostFromExpo();
  if (lan) return `http://${lan}:4000`;
  if (Platform.OS === "android") return "http://10.0.2.2:4000";
  return "http://localhost:4000";
}

let refreshInFlight: Promise<boolean> | null = null;

async function silentRefresh(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const token = await getToken();
    if (!token || isTokenExpired(token)) return false;
    try {
      const res = await fetch(`${getApiUrl()}/auth/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) return false;
      const data = (await res.json()) as {
        accessToken: string;
        refreshToken?: string;
        user: AuthUser;
      };
      await setSession(data.accessToken, data.user, data.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  opts?: { skipAuth?: boolean; retryOn401?: boolean },
): Promise<T> {
  let token = opts?.skipAuth ? null : await getToken();

  if (token && tokenExpiresSoon(token) && !opts?.skipAuth) {
    await silentRefresh();
    token = await getToken();
  }

  if (token && isTokenExpired(token)) {
    await clearSession();
    handlers.onUnauthorized?.();
    throw new SessionExpiredError();
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${getApiUrl()}${path}`, { ...options, headers });
  } catch {
    handlers.onOffline?.();
    throw new Error(
      `Sin uplink (${getApiUrl()}). Operación puede encolarse offline.`,
    );
  }

  if (res.status === 401 && opts?.retryOn401 !== false && !opts?.skipAuth) {
    const renewed = await silentRefresh();
    if (renewed) {
      return apiFetch<T>(path, options, { ...opts, retryOn401: false });
    }
    await clearSession();
    handlers.onUnauthorized?.();
    throw new SessionExpiredError();
  }

  if (!res.ok) {
    let message = `Error ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (body.message) {
        message = Array.isArray(body.message)
          ? body.message.join(", ")
          : body.message;
      }
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
