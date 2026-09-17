import type { ModuleId, Role } from "./index";

/**
 * 8 hubs corporativos (fase 2 de navegación).
 * Agrupan pantallas; la visibilidad por perfil sigue ROLE_VIEWS / menús curados.
 * Compartir HUB ≠ compartir permisos.
 */
export type NavDeptId =
  | "direccion"
  | "soporte"
  | "comercial"
  | "juridico"
  | "finanzas"
  | "riesgos"
  | "operaciones"
  | "compras_mtto";

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

/** Módulo → hub de navegación (8 áreas) */
export function hubForModule(view: ModuleId | "cuenta" | string): NavDeptId {
  const key = String(view);
  switch (key) {
    case "plataforma":
    case "presidencia":
    case "gerencia":
    case "dashboard":
      return "direccion";
    case "call_center":
    case "tecnologia_ti":
    case "archivo":
    case "rrhh":
    case "usuarios":
      return "soporte";
    case "comercial":
    case "apps":
      return "comercial";
    case "juridico":
    case "sarlaft":
      return "juridico";
    case "contabilidad":
    case "tesoreria":
      return "finanzas";
    case "qhse":
    case "revisoria_fiscal":
      return "riesgos";
    case "logistica":
    case "tramites":
      return "operaciones";
    case "compras":
    case "taller":
    case "parqueadero":
      return "compras_mtto";
    case "cuenta":
    default:
      return "direccion";
  }
}

/**
 * Catálogo canónico de las 8 áreas (pantallas genéricas por módulo).
 * Los dashboards específicos por cargo viven en los menús curados (*_NAV).
 */
export const NAV_DEPARTMENTS: NavDepartment[] = [
  {
    id: "direccion",
    label: "Dirección",
    tip: "Presidencia, gerencia y tablero ejecutivo.",
    items: [
      {
        href: "/plataforma",
        view: "plataforma",
        label: "Plataforma",
        tip: "Alta de empresas y administradores.",
      },
      {
        href: "/presidencia",
        view: "presidencia",
        label: "Presidencia",
        tip: "Tablero ejecutivo y gobierno corporativo.",
      },
      {
        href: "/gerencia",
        view: "gerencia",
        label: "Gerencia",
        tip: "Cuadro de mando y seguimiento inter-áreas.",
      },
      {
        href: "/dashboard",
        view: "dashboard",
        label: "Inicio",
        tip: "Resumen operativo del día.",
      },
    ],
  },
  {
    id: "soporte",
    label: "Soporte Corporativo",
    tip: "Recepción, tecnología, archivo y recursos humanos.",
    items: [
      {
        href: "/recepcion/dashboard",
        view: "call_center",
        label: "Recepción",
        tip: "Visitantes, mensajes y PQRS.",
      },
      {
        href: "/ti/dashboard",
        view: "tecnologia_ti",
        label: "Tecnología",
        tip: "Salud de sistemas y mesa de ayuda.",
      },
      {
        href: "/usuarios",
        view: "usuarios",
        label: "Usuarios",
        tip: "Cuentas de acceso y roles.",
      },
      {
        href: "/archivo/dashboard",
        view: "archivo",
        label: "Archivo",
        tip: "Custodia documental y papelería.",
      },
      {
        href: "/rrhh",
        view: "rrhh",
        label: "Recursos Humanos",
        tip: "Personal, fatiga y estado laboral.",
      },
    ],
  },
  {
    id: "comercial",
    label: "Comercial",
    tip: "Clientes, cotizaciones, contratos y canales.",
    items: [
      {
        href: "/comercial",
        view: "comercial",
        label: "Comercial",
        tip: "Clientes, cotizaciones y contratos.",
      },
      {
        href: "/apps",
        view: "apps",
        label: "Canales CRM",
        tip: "Indicadores por canal operativo.",
      },
    ],
  },
  {
    id: "juridico",
    label: "Jurídico",
    tip: "Contratos, expedientes y SARLAFT.",
    items: [
      {
        href: "/juridico",
        view: "juridico",
        label: "Jurídico",
        tip: "Contratos, calendario y expedientes.",
      },
      {
        href: "/sarlaft",
        view: "sarlaft",
        label: "SARLAFT",
        tip: "Listas restrictivas y riesgo.",
      },
    ],
  },
  {
    id: "finanzas",
    label: "Finanzas",
    tip: "Contabilidad y tesorería.",
    items: [
      {
        href: "/contabilidad",
        view: "contabilidad",
        label: "Contabilidad",
        tip: "PUC, legalizaciones y facturación.",
      },
      {
        href: "/tesoreria",
        view: "tesoreria",
        label: "Tesorería",
        tip: "CxC / CxP y dispersión.",
      },
    ],
  },
  {
    id: "riesgos",
    label: "Riesgos y Control",
    tip: "Calidad/SST, control interno y revisoría.",
    items: [
      {
        href: "/qhse",
        view: "qhse",
        label: "Calidad y SST",
        tip: "Prevención, siniestros y telemetría.",
      },
      {
        href: "/revisoria-fiscal",
        view: "revisoria_fiscal",
        label: "Revisoría / Control",
        tip: "Revisoría fiscal y control interno.",
      },
    ],
  },
  {
    id: "operaciones",
    label: "Operaciones y Flota",
    tip: "Servicios, conductores, trámites y torre de control.",
    items: [
      {
        href: "/logistica/servicios",
        view: "logistica",
        label: "Servicios y GPS",
        tip: "Programación y seguimiento.",
      },
      {
        href: "/logistica/conductores",
        view: "logistica",
        label: "Conductores",
        tip: "Disponibilidad y fatiga.",
      },
      {
        href: "/logistica/asignaciones",
        view: "logistica",
        label: "Unidades autorizadas",
        tip: "Matriz conductor–vehículo.",
      },
      {
        href: "/logistica/conductores/reporte-nomina",
        view: "logistica",
        label: "Nómina extras",
        tip: "Consolidado mensual de extras.",
      },
      {
        href: "/tramites",
        view: "tramites",
        label: "Trámites",
        tip: "SOAT, tecnomecánica y documentos.",
      },
      {
        href: "/pilot",
        view: "logistica",
        label: "App del conductor",
        tip: "Preoperacional, emergencia y viático.",
      },
    ],
  },
  {
    id: "compras_mtto",
    label: "Compras, Mantenimiento y Patio",
    tip: "Compras, taller y patio.",
    items: [
      {
        href: "/compras/dashboard",
        view: "compras",
        label: "Compras",
        tip: "Requisiciones, órdenes y proveedores.",
      },
      {
        href: "/taller",
        view: "taller",
        label: "Taller",
        tip: "Órdenes de trabajo y flota.",
      },
      {
        href: "/parqueadero",
        view: "parqueadero",
        label: "Patio",
        tip: "Ingreso y salida de vehículos.",
      },
    ],
  },
];

/** Alias de compatibilidad */
export const NAV_AREAS = NAV_DEPARTMENTS;

/** IDs válidos de hub (persistencia sidebar) */
export const NAV_HUB_IDS: readonly NavDeptId[] = [
  "direccion",
  "soporte",
  "comercial",
  "juridico",
  "finanzas",
  "riesgos",
  "operaciones",
  "compras_mtto",
];

export const ROLE_DEFAULT_NAV_DEPT: Record<Role, NavDeptId> = {
  platform_master: "direccion",
  org_admin: "direccion",
  presidencia: "direccion",
  presidente: "direccion",
  gerente_general: "direccion",
  sub_gerente: "direccion",
  director_financiero: "finanzas",
  tesoreria: "finanzas",
  director_operativo: "operaciones",
  control_interno: "riesgos",
  auditor_control_interno: "riesgos",
  revisor_fiscal: "riesgos",
  centro_control: "operaciones",
  operador_centro_control: "operaciones",
  coordinador_operativo: "operaciones",
  coordinador_campo: "operaciones",
  coordinador_comercial: "comercial",
  director_comercial: "comercial",
  coordinador_taller: "compras_mtto",
  coordinador_patio: "compras_mtto",
  auxiliar_almacen_taller: "compras_mtto",
  gestor_operativo: "operaciones",
  gestor_comercial: "comercial",
  gestor_contable: "finanzas",
  juridico: "juridico",
  director_juridico: "juridico",
  qhse: "riesgos",
  lider_qhse: "riesgos",
  compras: "compras_mtto",
  lider_compras: "compras_mtto",
  tecnologia: "soporte",
  lider_ti: "soporte",
  vinculaciones: "soporte",
  gestor_vinculaciones: "soporte",
  auxiliar_contable: "finanzas",
  auxiliar_contable_taller: "compras_mtto",
  auxiliar_patio: "compras_mtto",
  archivo: "soporte",
  gestor_documental: "soporte",
  recepcionista: "soporte",
  recepcion: "soporte",
  mecanico: "compras_mtto",
  conductor: "operaciones",
  monitora: "operaciones",
  padre: "comercial",
  pasajero: "comercial",
};

/** Primer segmento de URL → hub */
const PATH_TO_HUB: Record<string, NavDeptId> = {
  plataforma: "direccion",
  presidencia: "direccion",
  gerencia: "direccion",
  subgerencia: "direccion",
  dashboard: "direccion",
  cuenta: "direccion",
  recepcion: "soporte",
  "call-center": "soporte",
  atencion: "soporte",
  ti: "soporte",
  sistemas: "soporte",
  "tecnologia-ti": "soporte",
  usuarios: "soporte",
  archivo: "soporte",
  rrhh: "soporte",
  vinculaciones: "soporte",
  comercial: "comercial",
  apps: "comercial",
  juridico: "juridico",
  sarlaft: "juridico",
  tesoreria: "finanzas",
  finanzas: "finanzas",
  contabilidad: "finanzas",
  qhse: "riesgos",
  calidad: "riesgos",
  "revisoria-fiscal": "riesgos",
  revisoria: "riesgos",
  "control-interno": "riesgos",
  logistica: "operaciones",
  operaciones: "operaciones",
  "centro-control": "operaciones",
  tramites: "operaciones",
  pilot: "operaciones",
  compras: "compras_mtto",
  taller: "compras_mtto",
  patio: "compras_mtto",
  parqueadero: "compras_mtto",
};

export function navDeptForPath(pathname: string): NavDeptId | null {
  const seg = pathname.split("/").filter(Boolean)[0] || "";
  if (PATH_TO_HUB[seg]) return PATH_TO_HUB[seg];
  for (const dept of NAV_DEPARTMENTS) {
    if (
      dept.items.some((i) => {
        const base = i.href.split("#")[0];
        return (
          pathname === base ||
          pathname.startsWith(`${base}/`) ||
          base === `/${seg}` ||
          base.startsWith(`/${seg}/`)
        );
      })
    ) {
      return dept.id;
    }
  }
  return null;
}
