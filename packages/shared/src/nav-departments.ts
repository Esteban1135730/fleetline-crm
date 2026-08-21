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
    "plataforma",
    "/plataforma",
    "Plataforma",
    "Alta de empresas y administradores (maestro INREDSOFT).",
  ),
  AREA(
    "presidencia",
    "/presidencia",
    "Presidencia",
    "Dirección estratégica, gobierno corporativo y tablero ejecutivo de flota.",
  ),
  AREA(
    "gerencia",
    "/gerencia",
    "Gerencia",
    "Coordinación general de operaciones, metas y seguimiento inter-áreas.",
  ),
  AREA(
    "rrhh",
    "/rrhh",
    "RRHH",
    "Personal por área, estado laboral y fatiga operativa.",
  ),
  AREA(
    "revisoria_fiscal",
    "/revisoria-fiscal",
    "Revisoría",
    "Hallazgos de revisoría fiscal registrados y seguidos en el CRM.",
  ),
  AREA(
    "contabilidad",
    "/contabilidad",
    "Contabilidad",
    "CxP · legalizaciones · conciliación · PUC.",
  ),
  AREA(
    "tesoreria",
    "/tesoreria",
    "Tesorería",
    "Facturas por cobrar y por pagar; control de CxC / CxP.",
  ),
  {
    id: "logistica",
    label: "Logística",
    tip: "Programación de servicios, seguimiento GPS, conductores y nómina de extras.",
    items: [
      {
        href: "/logistica/servicios",
        view: "logistica",
        label: "Servicios y GPS",
        tip: "Crear servicios, asignar unidad/conductor y trazar ruta GPS en vivo.",
      },
      {
        href: "/logistica/conductores",
        view: "logistica",
        label: "Conductores",
        tip: "Calendario de disponibilidad, relevos PESV y liquidación de extras.",
      },
      {
        href: "/logistica/conductores/reporte-nomina",
        view: "logistica",
        label: "Nómina extras",
        tip: "Consolidado mensual, detalle día a día y exportación Excel/PDF.",
      },
    ],
  },
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
    "/ti/dashboard",
    "Tecnología",
    "Centro de Control · usuarios · mesa de ayuda · monitoreo.",
  ),
  AREA(
    "archivo",
    "/archivo/dashboard",
    "Archivo",
    "Custodia física · papelería · búsqueda universal.",
  ),
  AREA(
    "call_center",
    "/recepcion/dashboard",
    "Recepción",
    "Visitantes en sede y tickets de atención al cliente.",
  ),
  AREA(
    "taller",
    "/taller/coordinador/dashboard",
    "Taller",
    "Órdenes de trabajo y estado de mantenimiento de flota.",
  ),
  AREA(
    "parqueadero",
    "/patio/dashboard",
    "Parqueadero",
    "Ingreso y salida de vehículos en patio.",
  ),
];

export const NAV_AREAS = NAV_DEPARTMENTS;

export const ROLE_DEFAULT_NAV_DEPT: Record<Role, NavDeptId> = {
  platform_master: "plataforma",
  org_admin: "usuarios",
  presidencia: "presidencia",
  presidente: "presidencia",
  gerente_general: "gerencia",
  sub_gerente: "gerencia",
  director_financiero: "tesoreria",
  tesoreria: "tesoreria",
  director_operativo: "logistica",
  control_interno: "revisoria_fiscal",
  auditor_control_interno: "revisoria_fiscal",
  revisor_fiscal: "revisoria_fiscal",
  centro_control: "logistica",
  operador_centro_control: "logistica",
  coordinador_operativo: "logistica",
  coordinador_campo: "logistica",
  coordinador_comercial: "comercial",
  director_comercial: "comercial",
  coordinador_taller: "taller",
  coordinador_patio: "parqueadero",
  auxiliar_almacen_taller: "taller",
  gestor_operativo: "logistica",
  gestor_comercial: "comercial",
  gestor_contable: "contabilidad",
  juridico: "juridico",
  director_juridico: "juridico",
  qhse: "qhse",
  lider_qhse: "qhse",
  compras: "compras",
  lider_compras: "compras",
  tecnologia: "tecnologia_ti",
  lider_ti: "tecnologia_ti",
  vinculaciones: "rrhh",
  gestor_vinculaciones: "rrhh",
  auxiliar_contable: "contabilidad",
  auxiliar_contable_taller: "taller",
  auxiliar_patio: "parqueadero",
  archivo: "archivo",
  gestor_documental: "archivo",
  recepcionista: "call_center",
  recepcion: "call_center",
  mecanico: "taller",
  conductor: "logistica",
  monitora: "logistica",
  padre: "apps",
  pasajero: "apps",
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
    if (dept.id === seg) return dept.id;
    if (
      dept.items.some((i) => {
        const base = i.href.split("#")[0];
        return (
          base === `/${seg}` ||
          base.startsWith(`/${seg}/`) ||
          pathname === base ||
          pathname.startsWith(`${base}/`)
        );
      })
    ) {
      return dept.id;
    }
  }
  return null;
}
