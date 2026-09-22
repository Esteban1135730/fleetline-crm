/**
 * 6 hubs canónicos del MVP NEXA OS — mapeo de roles legacy → hub.
 * Usado por menú, alta de usuarios y documentación de permisos.
 */

export type MvpHubId =
  | "c_level"
  | "operaciones"
  | "comercial"
  | "finops"
  | "talento_compliance"
  | "acceso_edge";

export const MVP_HUB_LABELS: Record<MvpHubId, string> = {
  c_level: "Dirección / dueño",
  operaciones: "Operaciones",
  comercial: "Comercial",
  finops: "Finanzas / admin",
  talento_compliance: "Talento y cumplimiento",
  acceso_edge: "Portería / acceso",
};

/** Roles del sistema que pertenecen a cada hub MVP */
export const MVP_HUB_ROLES: Record<MvpHubId, readonly string[]> = {
  c_level: [
    "presidente",
    "presidencia",
    "gerente_general",
    "sub_gerente",
    "platform_master",
    "org_admin",
  ],
  operaciones: [
    "director_operativo",
    "gestor_operativo",
    "coordinador_campo",
    "operador_centro_control",
    "centro_control",
    "coordinador_taller",
    "auxiliar_almacen_taller",
    "mecanico",
    "coordinador_patio",
    "auxiliar_patio",
    "conductor",
    "logistica",
  ],
  comercial: [
    "director_comercial",
    "gestor_comercial",
    "coordinador_comercial",
    "comercial",
  ],
  finops: [
    "director_financiero",
    "gestor_contable",
    "auxiliar_contable",
    "auxiliar_contable_taller",
    "tesoreria",
    "finanzas",
    "contabilidad",
    "compras",
    "lider_compras",
  ],
  talento_compliance: [
    "gestor_vinculaciones",
    "vinculaciones",
    "rrhh",
    "lider_qhse",
    "qhse",
    "auditor_control_interno",
    "control_interno",
    "revisor_fiscal",
    "director_juridico",
    "juridico",
    "gestor_documental",
    "lider_ti",
    "tecnologia",
  ],
  acceso_edge: ["recepcionista", "recepcion", "monitora"],
};

export function mapRoleToMvpHub(role: string): MvpHubId | null {
  const r = String(role || "")
    .trim()
    .toLowerCase();
  for (const [hub, roles] of Object.entries(MVP_HUB_ROLES) as [
    MvpHubId,
    readonly string[],
  ][]) {
    if (roles.includes(r)) return hub;
  }
  return null;
}

export function mvpHubLabelForRole(role: string): string {
  const hub = mapRoleToMvpHub(role);
  return hub ? MVP_HUB_LABELS[hub] : "Sin hub MVP";
}
