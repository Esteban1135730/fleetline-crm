import type { AuthUser } from "@/lib/api";
import {
  AUTH_COPY,
  AuthNodeError,
  type AuthSession,
  type AuthUserProfile,
} from "@/lib/auth-types";

const UPLINK_MIN_MS = 900;
const UPLINK_MAX_MS = 1400;

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function uplinkLatency() {
  return (
    UPLINK_MIN_MS +
    Math.floor(Math.random() * (UPLINK_MAX_MS - UPLINK_MIN_MS + 1))
  );
}

function toProfile(user: AuthUser): AuthUserProfile {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    companyId: user.organizationId,
  };
}

/**
 * Simula latencia de uplink y normaliza errores a microcopy de torre.
 * Delega la autenticación real al callback de API (Nest `/auth/login`).
 */
export async function authenticateNode(
  email: string,
  password: string,
  apiLogin: (email: string, password: string) => Promise<AuthUser>,
): Promise<AuthSession> {
  const latency = uplinkLatency();
  const trimmedEmail = email.trim();
  const trimmedPassword = password.trim();

  if (!trimmedEmail || !trimmedPassword) {
    await delay(320);
    throw new AuthNodeError(
      "EMPTY_PAYLOAD",
      AUTH_COPY.errors.EMPTY_PAYLOAD,
    );
  }

  await delay(latency);

  try {
    const user = await apiLogin(trimmedEmail, trimmedPassword);
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("fsg_token") || `flt.session.${user.id}`
        : `flt.session.${user.id}`;

    return {
      accessToken: token,
      user: toProfile(user),
      authenticatedAt: new Date().toISOString(),
      uplinkLatencyMs: latency,
      systemStatus: "NOMINAL",
    };
  } catch (err) {
    const raw = err instanceof Error ? err.message : "";
    const networkLike =
      /failed to fetch|network|timeout|ECONNREFUSED|abort/i.test(raw) ||
      raw === "Failed to fetch";

    if (networkLike) {
      throw new AuthNodeError(
        "NETWORK_SYNC_FAILURE",
        AUTH_COPY.errors.NETWORK_SYNC_FAILURE,
      );
    }

    throw new AuthNodeError(
      "NODE_CREDENTIALS_NOT_FOUND",
      AUTH_COPY.errors.NODE_CREDENTIALS_NOT_FOUND,
    );
  }
}

/**
 * Mock puro para demos offline (sin API). Credencial de laboratorio:
 * `ops@fleetline.demo` / `fleetline`
 */
export async function mockAuthenticate(
  email: string,
  password: string,
): Promise<AuthSession> {
  const latency = uplinkLatency();
  await delay(latency);

  const ok =
    email.trim().toLowerCase() === "ops@fleetline.demo" &&
    password === "fleetline";

  if (!email.trim() || !password.trim()) {
    throw new AuthNodeError(
      "EMPTY_PAYLOAD",
      AUTH_COPY.errors.EMPTY_PAYLOAD,
    );
  }

  if (!ok) {
    throw new AuthNodeError(
      "NODE_CREDENTIALS_NOT_FOUND",
      AUTH_COPY.errors.NODE_CREDENTIALS_NOT_FOUND,
    );
  }

  return {
    accessToken: `flt.mock.${Date.now()}`,
    user: {
      id: "mock-node-001",
      email: "ops@fleetline.demo",
      name: "Operador Torre",
      role: "gestor_operativo",
      companyId: "org-mock-fleetline",
    },
    authenticatedAt: new Date().toISOString(),
    uplinkLatencyMs: latency,
    systemStatus: "NOMINAL",
  };
}
