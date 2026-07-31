import type { Role } from "@fsg/shared";

/** Roles operativos del nodo Fleetline (alias de dominio + API). */
export type UserRole = Role;

export type SystemStatus = "NOMINAL" | "ALERT" | "OFFLINE";

export interface AuthUserProfile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  companyId: string;
}

export interface AuthSession {
  accessToken: string;
  user: AuthUserProfile;
  authenticatedAt: string;
  uplinkLatencyMs: number;
  systemStatus: SystemStatus;
}

export type AuthErrorCode =
  | "NODE_CREDENTIALS_NOT_FOUND"
  | "NETWORK_SYNC_FAILURE"
  | "EMPTY_PAYLOAD"
  | "UPLINK_TIMEOUT";

export class AuthNodeError extends Error {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, message: string) {
    super(message);
    this.name = "AuthNodeError";
    this.code = code;
  }
}

export const AUTH_COPY = {
  brandOs: "FLEETLINE OS",
  engineVersion: "TELEMETRY ENGINE V2.4",
  accessTitle: "ACCESO A TORRE DE CONTROL",
  accessSubtitle: "Autenticación de nodo para flota y telemetría en vivo.",
  nodeEmailLabel: "Identificador de nodo",
  nodeEmailPlaceholder: "logistica@fsg.co",
  passwordLabel: "Clave de acceso",
  passwordPlaceholder: "fsg2026",
  submitIdle: "Autenticar",
  submitLoading: "Sincronizando uplink…",
  submitSuccess: "Nodo autenticado",
  registerHint: "¿Nuevo operador?",
  registerCta: "Registrar nodo organizacional",
  backToLogin: "Volver a autenticación",
  registerTitle: "REGISTRO DE NODO",
  registerSubtitle: "Alta de organización y administrador de torre.",
  orgNameLabel: "Organización",
  nitLabel: "NIT",
  adminNameLabel: "Operador administrador",
  registerSubmit: "Provisionar y entrar",
  demoHint:
    "Demo seed: logistica@fsg.co · presidencia@fsg.co · revisoria@fsg.co — clave fsg2026",
  themeLight: "Claro",
  themeDark: "Oscuro",
  systemNominal: "SYSTEM STATUS: NOMINAL // ALL SYSTEMS GO",
  systemAlert: "SYSTEM STATUS: ALERT // UPLINK DEGRADED",
  systemOffline: "SYSTEM STATUS: OFFLINE // SIGNAL LOST",
  errors: {
    NODE_CREDENTIALS_NOT_FOUND:
      "Credenciales de nodo no encontradas — use logistica@fsg.co / fsg2026 (seed)",
    NETWORK_SYNC_FAILURE: "Error de sincronización con la red",
    EMPTY_PAYLOAD: "Payload incompleto — complete identificador y clave",
    UPLINK_TIMEOUT: "Signal lost — retrying uplink",
  },
  coords: `4°35'56"N 74°04'51"W`,
} as const;
