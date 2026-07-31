import type { ModuleId, Role } from "./index";

/**
 * Área corporativa = ítem plano del sidebar (orden oficial dirección).
 * Se mantiene NAV_DEPARTMENTS por compatibilidad de imports.
 */
export type NavDeptId = ModuleId;

export type NavDeptItem = {
  href: string;
  view: ModuleId | "cuenta";
  label: string;
  tip: string;
};

export type NavDepartment = {
  id: NavDeptId;
  label: string;
  tip: string;
  items: NavDeptItem[];
};

const AREA = (
  id: ModuleId,
  href: string,
  label: string,
  tip: string,
): NavDepartment => ({
  id,
  label,
  tip,
  items: [{ href, view: id, label, tip }],
});

/**
 * Lista plana de 17 áreas independientes — orden EXACTO de dirección.
 * Cada área es un módulo con ruta propia.
 */
export const NAV_DEPARTMENTS: NavDepartment[] = [
  AREA(
    "presidencia",
    "/presidencia",
    "Presidencia",
    "Dirección estratégica, gobierno corporativo y tablero ejecutivo de flota.",
  ),
  AREA(
    "gerencia",
    "/gerencia",
    "Gerencia General",
    "Coordinación general de operaciones, metas y seguimiento inter-áreas.",
  ),
  AREA(
    "rrhh",
    "/rrhh",
    "Recursos Humanos",
    "Personal por área, estado laboral y fatiga operativa.",
  ),
  AREA(
    "revisoria_fiscal",
    "/revisoria-fiscal",
    "Revisoría Fiscal",
    "Hallazgos de revisoría fiscal registrados y seguidos en el CRM.",
  ),
  AREA(
    "contabilidad",
    "/contabilidad",
    "Contabilidad",
    "PUC, asientos de partida doble y balance de prueba.",
  ),
  AREA(
    "tesoreria",
    "/tesoreria",
    "Tesorería",
    "Facturas por cobrar y por pagar; control de CxC / CxP.",
  ),
  AREA(
    "logistica",
    "/logistica",
    "Logística",
    "Viajes, despacho, novedades y GPS en vivo.",
  ),
  AREA(
    "comercial",
    "/comercial",
    "Comercial",
    "Clientes, cotizaciones y contratos operativos.",
  ),
  AREA(
    "compras",
    "/compras",
    "Compras",
    "Solicitudes de compra y flujo de aprobación hasta recepción.",
  ),
  AREA(
    "qhse",
    "/qhse",
    "QHSE",
    "Calidad, seguridad, salud ocupacional e incidentes HSQE.",
  ),
  AREA(
    "sarlaft",
    "/sarlaft",
    "SARLAFT",
    "Chequeos de riesgo y bloqueo operativo.",
  ),
  AREA(
    "tramites",
    "/tramites",
    "Trámites",
    "SOAT, tecnomecánica y documentos de flota.",
  ),
  AREA(
    "tecnologia_ti",
    "/tecnologia-ti",
    "Tecnología y TI",
    "NOC, salud API/DB, uptime y alertas operativas.",
  ),
  AREA(
    "archivo",
    "/archivo",
    "Archivo y Papelería",
    "Data Room documental con hash SHA-256 y auditoría.",
  ),
  AREA(
    "call_center",
    "/call-center",
    "Recepción y Call Center",
    "Visitantes en sede y tickets de atención al cliente.",
  ),
  AREA(
    "taller",
    "/taller",
    "Taller",
    "Órdenes de trabajo y estado de mantenimiento de flota.",
  ),
  AREA(
    "parqueadero",
    "/parqueadero",
    "Parqueadero",
    "Ingreso y salida de vehículos en patio.",
  ),
];

export const NAV_AREAS = NAV_DEPARTMENTS;

export const ROLE_DEFAULT_NAV_DEPT: Record<Role, NavDeptId> = {
  presidencia: "presidencia",
  gerencia: "gerencia",
  finanzas: "tesoreria",
  despacho: "logistica",
  rrhh: "rrhh",
  atencion: "call_center",
  sistemas: "tecnologia_ti",
  revisoria: "revisoria_fiscal",
};

const PATH_ALIASES: Record<string, NavDeptId> = {
  finanzas: "tesoreria",
  revisoria: "revisoria_fiscal",
  "revisoria-fiscal": "revisoria_fiscal",
  calidad: "qhse",
  qhse: "qhse",
  sistemas: "tecnologia_ti",
  "tecnologia-ti": "tecnologia_ti",
  atencion: "call_center",
  recepcion: "call_center",
  "call-center": "call_center",
};

export function navDeptForPath(pathname: string): NavDeptId | null {
  const seg = pathname.split("/").filter(Boolean)[0] || "";
  if (PATH_ALIASES[seg]) return PATH_ALIASES[seg];
  for (const dept of NAV_DEPARTMENTS) {
    if (
      dept.items.some((i) => {
        const base = i.href.split("#")[0];
        return base === `/${seg}`;
      })
    ) {
      return dept.id;
    }
  }
  return null;
}
