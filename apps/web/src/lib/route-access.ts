import {
  ROLE_VIEWS,
  hasPermission,
  isPathDeniedForRole,
  normalizeRole,
  resolveModuleId,
  type PermissionAction,
} from "@fsg/shared";
import { useCallback } from "react";
import { useAuth } from "@/lib/auth-context";

/**
 * Requisito real (backend) del endpoint que carga cada pantalla.
 * `roles` replica el `@Roles(...)` del controlador; `capability` el `@Permissions`.
 * Mantener sincronizado con el controlador indicado.
 */
type ScreenRequirement = {
  roles?: readonly string[];
  capability?: `${string}:${PermissionAction}`;
};

/** TallerController */
const TALLER_API_ROLES = [
  "coordinador_taller",
  "auxiliar_almacen_taller",
  "auxiliar_contable_taller",
  "mecanico",
  "director_operativo",
  "gerente_general",
  "org_admin",
  "platform_master",
  "superadmin",
] as const;

/** ComercialController · @Roles de GET /comercial/contracts (carga la pantalla) */
const COMERCIAL_API_ROLES = [
  "gestor_comercial",
  "coordinador_comercial",
  "director_comercial",
  "gerente_general",
  "org_admin",
  "platform_master",
  "director_operativo",
  "comercial",
  "director_financiero",
] as const;

/** RrhhController */
const RRHH_API_ROLES = [
  "vinculaciones",
  "rrhh",
  "org_admin",
  "platform_master",
  "gerente_general",
  "sub_gerente",
  "lider_qhse",
] as const;

/** ComprasController */
const COMPRAS_API_ROLES = [
  "lider_compras",
  "compras",
  "org_admin",
  "platform_master",
  "superadmin",
  "gerente_general",
  "director_financiero",
] as const;

/** GestorContableController */
const GESTOR_CONTABLE_API_ROLES = [
  "gestor_contable",
  "director_financiero",
  "org_admin",
  "platform_master",
  "gerente_general",
] as const;

const SCREEN_REQUIREMENTS: Record<string, ScreenRequirement> = {
  "/contabilidad/gestor/dashboard": {
    roles: GESTOR_CONTABLE_API_ROLES,
    capability: "contabilidad:READ",
  },
  "/comercial": { roles: COMERCIAL_API_ROLES, capability: "contratos:READ" },
  "/rrhh": { roles: RRHH_API_ROLES, capability: "rrhh:READ" },
  "/compras/dashboard": { roles: COMPRAS_API_ROLES, capability: "compras_oc:READ" },
  "/gerencia/dashboard": { capability: "balance_scorecard:READ" },
  "/pilot": { capability: "pilot_preop:READ" },
  "/taller/coordinador/dashboard": { roles: TALLER_API_ROLES, capability: "taller_ot:READ" },
  "/taller/almacen/dashboard": { roles: TALLER_API_ROLES, capability: "taller_inventario:READ" },
  "/taller/mecanico": { roles: TALLER_API_ROLES, capability: "taller_mecanico:READ" },
};

/** Páginas índice que solo hacen `redirect()` a una pantalla con requisito propio. */
const INDEX_REDIRECTS: Record<string, string> = {
  "/gerencia": "/gerencia/dashboard",
};

/** ServiciosController: POST / · :id/asignar · despachar */
const DESPACHO_CREATE_ROLES = [
  "gestor_operativo",
  "director_operativo",
  "centro_control",
  "supervisor_logistica",
  "coordinador_operativo",
  "org_admin",
  "platform_master",
  "gerente_general",
] as const;

/** UsersController AUTHORIZERS */
const USER_AUTHORIZER_ROLES = [
  "platform_master",
  "org_admin",
  "presidencia",
  "gerente_general",
  "sub_gerente",
  "gerencia",
] as const;

const ACTION_REQUIREMENTS = {
  "logistica.servicio.crear": {
    roles: DESPACHO_CREATE_ROLES,
    capability: "logistica_despacho:CREATE",
  },
  "logistica.servicio.asignar": {
    roles: DESPACHO_CREATE_ROLES,
    capability: "logistica_despacho:CREATE",
  },
  "logistica.servicio.borrar": {
    roles: [...DESPACHO_CREATE_ROLES, "operador_centro_control"],
    capability: "logistica_despacho:UPDATE",
  },
  "logistica.servicio.reasignar": {
    roles: DESPACHO_CREATE_ROLES,
    capability: "logistica_despacho:UPDATE",
  },
  "logistica.servicio.fallaMecanica": {
    roles: [...DESPACHO_CREATE_ROLES, "operador_centro_control"],
    capability: "logistica_despacho:UPDATE",
  },
  "usuarios.autorizar": { roles: USER_AUTHORIZER_ROLES },
} satisfies Record<string, ScreenRequirement>;

export type ActionKey = keyof typeof ACTION_REQUIREMENTS;

/** Destino del hub `/taller` según cargo (SCRUM-57). */
export function tallerHubPath(role: string): string {
  const key = normalizeRole(role);
  if (key === "mecanico") return "/taller/mecanico";
  if (key === "auxiliar_almacen_taller") return "/taller/almacen/dashboard";
  return "/taller/coordinador/dashboard";
}

function meetsRequirement(role: string, req: ScreenRequirement): boolean {
  if (role === "platform_master") return true;
  if (req.roles) {
    const allowed: string[] = req.roles.map((r) => normalizeRole(r));
    if (!allowed.includes(role)) return false;
  }
  if (req.capability) {
    const sep = req.capability.lastIndexOf(":");
    const resource = req.capability.slice(0, sep);
    const action = req.capability.slice(sep + 1) as PermissionAction;
    if (!hasPermission(role, resource, action)) return false;
  }
  return true;
}

/**
 * ¿Puede el rol abrir `href` por navegación normal sin terminar en redirección
 * al inicio (guarda de ShellFrame) ni en 403 al cargar la pantalla destino?
 */
export function canOpenPath(role: string | undefined | null, href: string): boolean {
  if (!role) return false;
  const key = normalizeRole(role);
  const path = href.split("#")[0].split("?")[0].replace(/\/+$/, "") || "/";
  const seg = path.split("/").filter(Boolean)[0] || "dashboard";
  if (seg === "cuenta") return true;
  if (isPathDeniedForRole(key, path)) return false;
  const moduleId = resolveModuleId(seg) || seg;
  if (!(ROLE_VIEWS[key] || []).includes(moduleId as never)) return false;
  const target = path === "/taller" ? tallerHubPath(key) : (INDEX_REDIRECTS[path] ?? path);
  const req = SCREEN_REQUIREMENTS[target];
  return req ? meetsRequirement(key, req) : true;
}

export function useCanOpenPath(): (href: string) => boolean {
  const { user } = useAuth();
  const role = user?.role;
  return useCallback((href: string) => canOpenPath(role, href), [role]);
}

/** ¿El backend aceptará la acción (roles del endpoint + permiso)? */
export function canPerform(role: string | undefined | null, action: ActionKey): boolean {
  if (!role) return false;
  return meetsRequirement(normalizeRole(role), ACTION_REQUIREMENTS[action]);
}

export function useCanPerform(action: ActionKey): boolean {
  const { user } = useAuth();
  return canPerform(user?.role, action);
}
