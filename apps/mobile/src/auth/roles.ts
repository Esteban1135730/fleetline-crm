import type { MobileRole } from "../types";

export function normalizeRole(role: string): MobileRole {
  return String(role).toLowerCase().trim() as MobileRole;
}

export function isConductor(role: string) {
  return normalizeRole(role) === "conductor";
}

export function isMecanico(role: string) {
  return normalizeRole(role) === "mecanico";
}

export function isPatio(role: string) {
  const r = normalizeRole(role);
  return r === "auxiliar_patio" || r === "coordinador_patio";
}

export function isCampo(role: string) {
  return normalizeRole(role) === "coordinador_campo";
}

export type HomeRoute =
  | "ConductorHome"
  | "MechanicHome"
  | "PatioHome"
  | "CampoHome"
  | "UnsupportedHome";

export function homeRouteForRole(role: string): HomeRoute {
  if (isConductor(role)) return "ConductorHome";
  if (isMecanico(role)) return "MechanicHome";
  if (isPatio(role)) return "PatioHome";
  if (isCampo(role)) return "CampoHome";
  return "UnsupportedHome";
}

export function roleLabel(role: string): string {
  switch (normalizeRole(role)) {
    case "conductor":
      return "Conductor · En vía";
    case "mecanico":
      return "Mecánico · Taller";
    case "auxiliar_patio":
      return "Auxiliar · Patio";
    case "coordinador_patio":
      return "Coordinador · Patio";
    case "coordinador_campo":
      return "Coordinador · Campo";
    default:
      return "Fleetline OS";
  }
}
