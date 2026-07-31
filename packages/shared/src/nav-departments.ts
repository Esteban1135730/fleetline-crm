import type { ModuleId, Role } from "./index";

/** Departamentos de navegación UI (IA simplificada — Zero Clutter) */
export type NavDeptId =
  | "operaciones"
  | "comercial"
  | "mantenimiento"
  | "finanzas"
  | "mando";

export type NavDeptItem = {
  href: string;
  view: ModuleId | "cuenta";
  /** Etiqueta corta operativa (no el MODULE_LABELS genérico) */
  label: string;
};

export type NavDepartment = {
  id: NavDeptId;
  label: string;
  items: NavDeptItem[];
};

/**
 * Menú lateral por departamentos (4–5 categorías).
 * Los ítems se filtran luego por ROLE_VIEWS.
 */
export const NAV_DEPARTMENTS: NavDepartment[] = [
  {
    id: "operaciones",
    label: "Operaciones y flota",
    items: [
      {
        href: "/logistica",
        view: "logistica",
        label: "Logística y GPS en vivo",
      },
      {
        href: "/parqueadero",
        view: "parqueadero",
        label: "Parqueadero y patio",
      },
      {
        href: "/tramites",
        view: "tramites",
        label: "Trámites y documentación",
      },
    ],
  },
  {
    id: "comercial",
    label: "Comercial y clientes",
    items: [
      {
        href: "/comercial",
        view: "comercial",
        label: "Cotizaciones y contratos",
      },
      {
        href: "/comercial#clientes",
        view: "comercial",
        label: "Clientes / B2B",
      },
      { href: "/apps", view: "apps", label: "Canales CRM" },
    ],
  },
  {
    id: "mantenimiento",
    label: "Mantenimiento y taller",
    items: [
      { href: "/taller", view: "taller", label: "Órdenes de trabajo" },
      { href: "/compras", view: "compras", label: "Inventario / compras" },
    ],
  },
  {
    id: "finanzas",
    label: "Finanzas y gobierno",
    items: [
      { href: "/finanzas", view: "finanzas", label: "Tesorería (CxC / CxP)" },
      {
        href: "/contabilidad",
        view: "contabilidad",
        label: "Contabilidad",
      },
      { href: "/archivo", view: "archivo", label: "Archivo digital" },
      { href: "/sarlaft", view: "sarlaft", label: "SARLAFT" },
      { href: "/calidad", view: "calidad", label: "Calidad / incidentes" },
      { href: "/revisoria", view: "revisoria", label: "Revisoría fiscal" },
      { href: "/juridico", view: "juridico", label: "Jurídico / FUEC" },
    ],
  },
  {
    id: "mando",
    label: "Personas y mando",
    items: [
      { href: "/dashboard", view: "dashboard", label: "Inicio operativo" },
      { href: "/rrhh", view: "rrhh", label: "Recursos humanos" },
      { href: "/atencion", view: "atencion", label: "Call center" },
      { href: "/recepcion", view: "recepcion", label: "Recepción" },
      { href: "/sistemas", view: "sistemas", label: "Sistemas / NOC" },
      { href: "/usuarios", view: "usuarios", label: "Usuarios" },
      { href: "/cuenta", view: "cuenta", label: "Mi cuenta" },
    ],
  },
];

/** Departamento abierto por defecto según rol (resto colapsado) */
export const ROLE_DEFAULT_NAV_DEPT: Record<Role, NavDeptId> = {
  presidencia: "mando",
  gerencia: "operaciones",
  finanzas: "finanzas",
  despacho: "operaciones",
  rrhh: "mando",
  atencion: "mando",
  sistemas: "mando",
};

export function navDeptForPath(pathname: string): NavDeptId | null {
  const seg = pathname.split("/").filter(Boolean)[0] || "dashboard";
  for (const dept of NAV_DEPARTMENTS) {
    if (
      dept.items.some((i) => {
        const base = i.href.split("#")[0];
        return base === `/${seg}` || (seg === "dashboard" && base === "/dashboard");
      })
    ) {
      return dept.id;
    }
  }
  return null;
}
