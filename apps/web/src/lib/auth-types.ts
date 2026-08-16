import type { Role } from "@fsg/shared";

/** Roles operativos del nodo Inretrans (alias de dominio + API). */
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
  brandOs: "INRETRANS OS",
  engineVersion: "MOTOR DE TELEMETRÍA V2.4",
  accessTitle: "ACCESO A TORRE DE CONTROL",
  accessSubtitle: "Autenticación para flota y telemetría en vivo.",
  nodeEmailLabel: "Correo de acceso",
  nodeEmailPlaceholder: "correo@empresa.com",
  passwordLabel: "Clave de acceso",
  passwordPlaceholder: "••••••••",
  submitIdle: "Entrar",
  submitLoading: "Conectando…",
  submitSuccess: "Sesión iniciada",
  registerHint: "¿Nueva empresa?",
  registerCta: "Registrar organización",
  backToLogin: "Volver al ingreso",
  registerTitle: "REGISTRO DE EMPRESA",
  registerSubtitle: "Alta de organización y administrador.",
  orgNameLabel: "Organización",
  nitLabel: "NIT",
  adminNameLabel: "Administrador",
  registerSubmit: "Crear y entrar",
  themeLight: "Claro",
  themeDark: "Oscuro",
  systemNominal: "ESTADO DEL SISTEMA: NOMINAL — TODO EN ORDEN",
  systemAlert: "ESTADO DEL SISTEMA: ALERTA — SEÑAL DEGRADADA",
  systemOffline: "ESTADO DEL SISTEMA: SIN CONEXIÓN — SEÑAL PERDIDA",
  errors: {
    NODE_CREDENTIALS_NOT_FOUND:
      "Credenciales no encontradas — verifique correo y clave",
    NETWORK_SYNC_FAILURE: "Error de sincronización con la red",
    EMPTY_PAYLOAD: "Complete correo y clave",
    UPLINK_TIMEOUT: "Señal perdida — reintentando conexión",
  },
  coords: `4°35'56"N 74°04'51"W`,
} as const;
