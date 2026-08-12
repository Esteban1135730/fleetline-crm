/**
 * Matriz RBAC Fleetline — scopes por rol (sin inventar altas de usuario).
 * Usado por API Guards y por UI (useHasPermission / <Can />).
 */

export type PermissionAction = "CREATE" | "READ" | "UPDATE" | "DELETE";

export type PermissionResource =
  | "visitas"
  | "omnicanal"
  | "crm_comercial"
  | "qhse_pqrs"
  | "torre_rutas"
  | "finanzas"
  | "rrhh"
  | "contratos"
  | "logistica_despacho"
  | "mis_viajes"
  | "personal"
  | "nomina"
  | "recepcion"
  | "usuarios_roles"
  | "integraciones"
  | "helpdesk_ti"
  | "infra_monitoreo"
  | "audit_forense"
  | "contabilidad"
  | "archivo_digital"
  | "custodia_fisica"
  | "inventario_papeleria"
  | "tramites"
  | "taller"
  | "cxp_proveedores"
  | "legalizacion_gastos"
  | "conciliacion_bancaria"
  | "facturacion_clientes"
  | "puc"
  | "tesoreria_dispersion"
  | "gastos_ruta"
  | "facturacion_electronica";

/** Acciones permitidas por recurso; vacío / omitido = denegado */
export type RolePermissionMap = Partial<
  Record<PermissionResource, readonly PermissionAction[]>
>;

export const ROLE_PERMISSIONS: Record<string, RolePermissionMap> = {
  platform_master: {
    visitas: ["CREATE", "READ", "UPDATE", "DELETE"],
    omnicanal: ["CREATE", "READ", "UPDATE", "DELETE"],
    crm_comercial: ["CREATE", "READ", "UPDATE", "DELETE"],
    qhse_pqrs: ["CREATE", "READ", "UPDATE", "DELETE"],
    torre_rutas: ["CREATE", "READ", "UPDATE", "DELETE"],
    finanzas: ["CREATE", "READ", "UPDATE", "DELETE"],
    rrhh: ["CREATE", "READ", "UPDATE", "DELETE"],
    contratos: ["CREATE", "READ", "UPDATE", "DELETE"],
    logistica_despacho: ["CREATE", "READ", "UPDATE", "DELETE"],
    mis_viajes: ["CREATE", "READ", "UPDATE", "DELETE"],
    personal: ["CREATE", "READ", "UPDATE", "DELETE"],
    nomina: ["CREATE", "READ", "UPDATE", "DELETE"],
    recepcion: ["CREATE", "READ", "UPDATE", "DELETE"],
    usuarios_roles: ["CREATE", "READ", "UPDATE", "DELETE"],
    integraciones: ["CREATE", "READ", "UPDATE", "DELETE"],
    helpdesk_ti: ["CREATE", "READ", "UPDATE", "DELETE"],
    infra_monitoreo: ["CREATE", "READ", "UPDATE", "DELETE"],
    audit_forense: ["CREATE", "READ", "UPDATE", "DELETE"],
    contabilidad: ["CREATE", "READ", "UPDATE", "DELETE"],
    archivo_digital: ["CREATE", "READ", "UPDATE", "DELETE"],
    custodia_fisica: ["CREATE", "READ", "UPDATE", "DELETE"],
    inventario_papeleria: ["CREATE", "READ", "UPDATE", "DELETE"],
    tramites: ["CREATE", "READ", "UPDATE", "DELETE"],
    taller: ["CREATE", "READ", "UPDATE", "DELETE"],
    cxp_proveedores: ["CREATE", "READ", "UPDATE", "DELETE"],
    legalizacion_gastos: ["CREATE", "READ", "UPDATE", "DELETE"],
    conciliacion_bancaria: ["CREATE", "READ", "UPDATE", "DELETE"],
    facturacion_clientes: ["CREATE", "READ", "UPDATE", "DELETE"],
    puc: ["CREATE", "READ", "UPDATE", "DELETE"],
    tesoreria_dispersion: ["CREATE", "READ", "UPDATE", "DELETE"],
    gastos_ruta: ["CREATE", "READ", "UPDATE", "DELETE"],
    facturacion_electronica: ["CREATE", "READ", "UPDATE", "DELETE"],
  },
  org_admin: {
    visitas: ["CREATE", "READ", "UPDATE", "DELETE"],
    omnicanal: ["CREATE", "READ", "UPDATE", "DELETE"],
    crm_comercial: ["CREATE", "READ", "UPDATE", "DELETE"],
    qhse_pqrs: ["CREATE", "READ", "UPDATE", "DELETE"],
    torre_rutas: ["CREATE", "READ", "UPDATE", "DELETE"],
    finanzas: ["CREATE", "READ", "UPDATE", "DELETE"],
    rrhh: ["CREATE", "READ", "UPDATE", "DELETE"],
    contratos: ["CREATE", "READ", "UPDATE", "DELETE"],
    logistica_despacho: ["CREATE", "READ", "UPDATE", "DELETE"],
    mis_viajes: ["READ"],
    personal: ["CREATE", "READ", "UPDATE", "DELETE"],
    nomina: ["CREATE", "READ", "UPDATE", "DELETE"],
    recepcion: ["CREATE", "READ", "UPDATE", "DELETE"],
    usuarios_roles: ["CREATE", "READ", "UPDATE", "DELETE"],
    integraciones: ["CREATE", "READ", "UPDATE", "DELETE"],
    helpdesk_ti: ["CREATE", "READ", "UPDATE", "DELETE"],
    infra_monitoreo: ["READ"],
    audit_forense: ["READ"],
    contabilidad: ["CREATE", "READ", "UPDATE", "DELETE"],
    archivo_digital: ["CREATE", "READ", "UPDATE", "DELETE"],
    custodia_fisica: ["CREATE", "READ", "UPDATE", "DELETE"],
    inventario_papeleria: ["CREATE", "READ", "UPDATE", "DELETE"],
    tramites: ["CREATE", "READ", "UPDATE", "DELETE"],
    taller: ["CREATE", "READ", "UPDATE", "DELETE"],
    cxp_proveedores: ["CREATE", "READ", "UPDATE", "DELETE"],
    legalizacion_gastos: ["CREATE", "READ", "UPDATE", "DELETE"],
    conciliacion_bancaria: ["CREATE", "READ", "UPDATE", "DELETE"],
    facturacion_clientes: ["CREATE", "READ", "UPDATE", "DELETE"],
    puc: ["CREATE", "READ", "UPDATE", "DELETE"],
    tesoreria_dispersion: ["CREATE", "READ", "UPDATE", "DELETE"],
    gastos_ruta: ["CREATE", "READ", "UPDATE", "DELETE"],
    facturacion_electronica: ["CREATE", "READ", "UPDATE", "DELETE"],
  },

  /** Módulo 1 — Recepcionista (Flor) */
  recepcionista: {
    visitas: ["CREATE", "READ", "UPDATE"],
    omnicanal: ["CREATE", "READ", "UPDATE"],
    crm_comercial: ["CREATE"],
    qhse_pqrs: ["CREATE"],
    torre_rutas: ["READ"],
    recepcion: ["CREATE", "READ", "UPDATE"],
    finanzas: [],
    rrhh: [],
    contratos: [],
    logistica_despacho: [],
    mis_viajes: [],
    personal: [],
    nomina: [],
  },

  conductor: {
    mis_viajes: ["CREATE", "READ", "UPDATE"],
    torre_rutas: ["READ"],
  },

  gestor_comercial: {
    crm_comercial: ["CREATE", "READ", "UPDATE", "DELETE"],
    contratos: ["CREATE", "READ", "UPDATE"],
    omnicanal: ["READ", "UPDATE"],
    recepcion: ["READ"],
  },

  /** Alias de negocio → vinculaciones */
  rrhh: {
    personal: ["CREATE", "READ", "UPDATE"],
    nomina: ["CREATE", "READ", "UPDATE"],
    rrhh: ["CREATE", "READ", "UPDATE"],
  },
  vinculaciones: {
    personal: ["CREATE", "READ", "UPDATE"],
    nomina: ["CREATE", "READ", "UPDATE"],
    rrhh: ["CREATE", "READ", "UPDATE"],
  },

  /** Supervisor logística / centro de control */
  supervisor_logistica: {
    torre_rutas: ["CREATE", "READ", "UPDATE", "DELETE"],
    logistica_despacho: ["CREATE", "READ", "UPDATE", "DELETE"],
    mis_viajes: ["READ", "UPDATE"],
  },
  centro_control: {
    torre_rutas: ["CREATE", "READ", "UPDATE", "DELETE"],
    logistica_despacho: ["CREATE", "READ", "UPDATE", "DELETE"],
    mis_viajes: ["READ", "UPDATE"],
  },
  gestor_operativo: {
    torre_rutas: ["CREATE", "READ", "UPDATE", "DELETE"],
    logistica_despacho: ["CREATE", "READ", "UPDATE", "DELETE"],
    mis_viajes: ["READ", "UPDATE"],
    visitas: ["READ"],
    omnicanal: ["READ"],
  },

  /** Finanzas */
  finanzas: {
    finanzas: ["CREATE", "READ", "UPDATE", "DELETE"],
    contratos: ["READ"],
    tesoreria_dispersion: ["CREATE", "READ", "UPDATE", "DELETE"],
    facturacion_clientes: ["CREATE", "READ", "UPDATE", "DELETE"],
  },
  tesoreria: {
    finanzas: ["CREATE", "READ", "UPDATE", "DELETE"],
    contratos: ["READ"],
    tesoreria_dispersion: ["CREATE", "READ", "UPDATE", "DELETE"],
    facturacion_clientes: ["READ"],
  },
  director_financiero: {
    finanzas: ["CREATE", "READ", "UPDATE", "DELETE"],
    contratos: ["READ", "UPDATE"],
    contabilidad: ["CREATE", "READ", "UPDATE", "DELETE"],
    puc: ["CREATE", "READ", "UPDATE", "DELETE"],
    tesoreria_dispersion: ["CREATE", "READ", "UPDATE", "DELETE"],
    facturacion_clientes: ["CREATE", "READ", "UPDATE", "DELETE"],
    cxp_proveedores: ["CREATE", "READ", "UPDATE", "DELETE"],
  },
  gestor_contable: {
    contabilidad: ["CREATE", "READ", "UPDATE", "DELETE"],
    puc: ["CREATE", "READ", "UPDATE", "DELETE"],
    facturacion_electronica: ["CREATE", "READ", "UPDATE"],
    facturacion_clientes: ["CREATE", "READ", "UPDATE"],
    gastos_ruta: ["READ", "UPDATE"],
    legalizacion_gastos: ["READ", "UPDATE"],
    cxp_proveedores: ["CREATE", "READ", "UPDATE"],
    conciliacion_bancaria: ["CREATE", "READ", "UPDATE"],
    nomina: ["READ"],
    rrhh: ["READ"],
    taller: ["READ"],
    finanzas: ["READ"],
    tesoreria_dispersion: [],
    logistica_despacho: [],
    torre_rutas: [],
  },

  /** Módulo 4.1 — Auxiliar Contable (Mateo) */
  auxiliar_contable: {
    cxp_proveedores: ["CREATE", "READ", "UPDATE"],
    legalizacion_gastos: ["READ", "UPDATE"],
    conciliacion_bancaria: ["CREATE", "READ", "UPDATE"],
    facturacion_clientes: ["READ"],
    contabilidad: ["READ"],
    puc: [],
    tesoreria_dispersion: [],
    finanzas: [],
  },

  /** Módulo 2 — Líder TI (David) */
  lider_ti: {
    usuarios_roles: ["CREATE", "READ", "UPDATE", "DELETE"],
    integraciones: ["CREATE", "READ", "UPDATE", "DELETE"],
    helpdesk_ti: ["CREATE", "READ", "UPDATE", "DELETE"],
    infra_monitoreo: ["READ"],
    recepcion: ["READ"],
    finanzas: [],
    contabilidad: [],
    audit_forense: [],
    rrhh: [],
    contratos: [],
  },
  tecnologia: {
    usuarios_roles: ["CREATE", "READ", "UPDATE", "DELETE"],
    integraciones: ["CREATE", "READ", "UPDATE", "DELETE"],
    helpdesk_ti: ["CREATE", "READ", "UPDATE", "DELETE"],
    infra_monitoreo: ["READ"],
    finanzas: [],
    contabilidad: [],
    audit_forense: [],
  },

  /** Módulo 3 — Gestor Documental (Roberto) */
  gestor_documental: {
    archivo_digital: ["CREATE", "READ", "UPDATE"],
    custodia_fisica: ["CREATE", "READ", "UPDATE", "DELETE"],
    inventario_papeleria: ["CREATE", "READ", "UPDATE", "DELETE"],
    tramites: ["READ"],
    rrhh: ["READ"],
    personal: ["READ"],
    contratos: ["READ"],
    nomina: [],
    finanzas: [],
    contabilidad: [],
    logistica_despacho: [],
    taller: [],
    mis_viajes: [],
  },
  archivo: {
    archivo_digital: ["CREATE", "READ", "UPDATE"],
    custodia_fisica: ["CREATE", "READ", "UPDATE", "DELETE"],
    inventario_papeleria: ["CREATE", "READ", "UPDATE", "DELETE"],
    tramites: ["READ"],
    rrhh: ["READ"],
    personal: ["READ"],
    contratos: ["READ"],
    nomina: [],
    finanzas: [],
    contabilidad: [],
    logistica_despacho: [],
    taller: [],
  },
};

/** Prefijos HTTP denegados por rol (403 inmediato) */
export const ROLE_DENIED_PATH_PREFIXES: Record<string, string[]> = {
  recepcionista: [
    "/finanzas",
    "/api/v1/finanzas",
    "/tesoreria",
    "/contabilidad",
    "/rrhh",
    "/api/v1/rrhh",
    "/comercial/contracts",
    "/contratos",
    "/logistica/servicios/despachar",
    "/logistica/despachar",
  ],
  conductor: [
    "/finanzas",
    "/api/v1/finanzas",
    "/tesoreria",
    "/rrhh",
    "/recepcion",
    "/api/v1/recepcion",
    "/omnicanal",
  ],
  lider_ti: [
    "/finanzas",
    "/api/v1/finanzas",
    "/tesoreria",
    "/contabilidad",
    "/api/v1/audit-forensic",
    "/audit-forensic",
    "/revisoria/audit-trail",
  ],
  tecnologia: [
    "/finanzas",
    "/api/v1/finanzas",
    "/tesoreria",
    "/contabilidad",
    "/api/v1/audit-forensic",
    "/audit-forensic",
    "/revisoria/audit-trail",
  ],
  gestor_documental: [
    "/finanzas",
    "/api/v1/finanzas",
    "/tesoreria",
    "/contabilidad",
    "/taller",
    "/api/v1/taller",
    "/logistica/servicios/despachar",
    "/logistica/despachar",
    "/rrhh/payroll",
    "/api/v1/rrhh/payroll",
  ],
  archivo: [
    "/finanzas",
    "/api/v1/finanzas",
    "/tesoreria",
    "/contabilidad",
    "/taller",
    "/api/v1/taller",
    "/logistica/servicios/despachar",
    "/logistica/despachar",
    "/rrhh/payroll",
    "/api/v1/rrhh/payroll",
  ],
  auxiliar_contable: [
    "/api/v1/tesoreria/dispersar",
    "/tesoreria/dispersar",
    "/tesoreria/payments/disburse",
    "/api/v1/tesoreria/payments/disburse",
    "/api/v1/finanzas/payments/disburse",
    "/finanzas/payments/disburse",
    "/api/v1/contabilidad/puc",
    "/contabilidad/puc",
    "/accounting/puc",
    "/contabilidad/accounts",
    "/accounting/accounts",
    "/api/v1/contabilidad/accounts",
    "/contabilidad/trial-balance",
    "/accounting/trial-balance",
  ],
  gestor_contable: [
    "/logistica/servicios/despachar",
    "/logistica/despachar",
    "/api/v1/logistica/despachar",
    "/api/v1/tesoreria/dispersar",
    "/tesoreria/dispersar",
    "/tesoreria/payments/disburse",
    "/api/v1/tesoreria/payments/disburse",
    "/api/v1/finanzas/payments/disburse",
    "/finanzas/payments/disburse",
    "/parqueadero",
    "/patio",
    "/api/v1/patio",
  ],
};

const RESOURCE_ALIASES: Record<string, PermissionResource> = {
  visitor_control: "visitas",
  visitas: "visitas",
  visitors: "visitas",
  omnicanal: "omnicanal",
  bandeja: "omnicanal",
  comercial_crm: "crm_comercial",
  crm_comercial: "crm_comercial",
  crm: "crm_comercial",
  leads: "crm_comercial",
  qhse_pqrs: "qhse_pqrs",
  pqrs: "qhse_pqrs",
  qhse: "qhse_pqrs",
  torre_rutas: "torre_rutas",
  rutas: "torre_rutas",
  radar: "torre_rutas",
  finanzas: "finanzas",
  tesoreria: "finanzas",
  rrhh: "rrhh",
  personal: "personal",
  nomina: "nomina",
  contratos: "contratos",
  contracts: "contratos",
  logistica_despacho: "logistica_despacho",
  despacho: "logistica_despacho",
  despachar: "logistica_despacho",
  mis_viajes: "mis_viajes",
  recepcion: "recepcion",
  usuarios_roles: "usuarios_roles",
  usuarios: "usuarios_roles",
  roles: "usuarios_roles",
  integraciones: "integraciones",
  integrations: "integraciones",
  helpdesk_ti: "helpdesk_ti",
  helpdesk: "helpdesk_ti",
  infra_monitoreo: "infra_monitoreo",
  monitoreo: "infra_monitoreo",
  noc: "infra_monitoreo",
  audit_forense: "audit_forense",
  audit: "audit_forense",
  contabilidad: "contabilidad",
  archivo_digital: "archivo_digital",
  archivo: "archivo_digital",
  data_room: "archivo_digital",
  custodia_fisica: "custodia_fisica",
  custodia: "custodia_fisica",
  inventario_papeleria: "inventario_papeleria",
  papeleria: "inventario_papeleria",
  suministros: "inventario_papeleria",
  tramites: "tramites",
  taller: "taller",
  cxp_proveedores: "cxp_proveedores",
  cxp: "cxp_proveedores",
  cuentas_por_pagar: "cxp_proveedores",
  legalizacion_gastos: "legalizacion_gastos",
  legalizaciones: "legalizacion_gastos",
  viaticos: "legalizacion_gastos",
  conciliacion_bancaria: "conciliacion_bancaria",
  conciliacion: "conciliacion_bancaria",
  facturacion_clientes: "facturacion_clientes",
  cartera: "facturacion_clientes",
  puc: "puc",
  plan_cuentas: "puc",
  tesoreria_dispersion: "tesoreria_dispersion",
  dispersar: "tesoreria_dispersion",
  disburse: "tesoreria_dispersion",
  gastos_ruta: "gastos_ruta",
  smart_wallet: "gastos_ruta",
  peajes: "gastos_ruta",
  facturacion_electronica: "facturacion_electronica",
  dian: "facturacion_electronica",
  emitir_dian: "facturacion_electronica",
};

export function resolvePermissionResource(
  raw: string,
): PermissionResource | null {
  const key = String(raw || "")
    .toLowerCase()
    .trim()
    .replace(/-/g, "_");
  return RESOURCE_ALIASES[key] ?? null;
}

export function hasPermission(
  role: string,
  resource: PermissionResource | string,
  action: PermissionAction,
): boolean {
  const r = String(role || "")
    .toLowerCase()
    .trim();
  const res =
    typeof resource === "string" && !(resource in ({} as Record<PermissionResource, 1>))
      ? resolvePermissionResource(resource) || (resource as PermissionResource)
      : (resource as PermissionResource);

  const map =
    ROLE_PERMISSIONS[r] ||
    ROLE_PERMISSIONS[
      r === "recepcion" || r === "atencion"
        ? "recepcionista"
        : r === "supervisor" || r === "despacho"
          ? "centro_control"
          :       r === "tecnologia" || r === "sistemas"
            ? "lider_ti"
            : r === "archivo"
              ? "gestor_documental"
              : r
    ];

  if (!map) return false;
  const actions = map[res as PermissionResource];
  if (!actions || actions.length === 0) return false;
  return actions.includes(action);
}

export function isPathDeniedForRole(role: string, path: string): boolean {
  const r = String(role || "")
    .toLowerCase()
    .trim();
  const normalizedRole =
    r === "recepcion" || r === "atencion"
      ? "recepcionista"
      : r === "tecnologia" || r === "sistemas"
        ? "lider_ti"
        : r === "archivo"
          ? "gestor_documental"
          : r;
  const prefixes =
    ROLE_DENIED_PATH_PREFIXES[normalizedRole] ||
    ROLE_DENIED_PATH_PREFIXES[r] ||
    [];
  const p = String(path || "").toLowerCase();
  return prefixes.some(
    (prefix) => p === prefix || p.startsWith(`${prefix}/`) || p.startsWith(prefix),
  );
}

/** Compat Módulo 1 */
export const RECEPCIONISTA_PERMISSIONS = {
  visitor_control: ROLE_PERMISSIONS.recepcionista!.visitas!,
  omnicanal: ROLE_PERMISSIONS.recepcionista!.omnicanal!,
  comercial_crm: ROLE_PERMISSIONS.recepcionista!.crm_comercial!,
  qhse_pqrs: ROLE_PERMISSIONS.recepcionista!.qhse_pqrs!,
  torre_rutas: ROLE_PERMISSIONS.recepcionista!.torre_rutas!,
  finanzas: [] as PermissionAction[],
  rrhh: [] as PermissionAction[],
  contratos: [] as PermissionAction[],
} as const;

export type RecepcionPermissionAction = PermissionAction;
export type RecepcionPermissionDomain = keyof typeof RECEPCIONISTA_PERMISSIONS;

export function recepcionistaCan(
  domain: RecepcionPermissionDomain,
  action: PermissionAction,
): boolean {
  return (RECEPCIONISTA_PERMISSIONS[domain] as readonly string[]).includes(
    action,
  );
}

export const RECEPCIONISTA_DENIED_MODULES = [
  "tesoreria",
  "contabilidad",
  "rrhh",
  "compras",
  "comercial",
  "juridico",
  "sarlaft",
  "finanzas",
] as const;

export function isRecepcionistaDeniedModule(module: string): boolean {
  const m = String(module || "")
    .toLowerCase()
    .replace(/-/g, "_");
  return (RECEPCIONISTA_DENIED_MODULES as readonly string[]).some(
    (d) => d === m || m.includes(d),
  );
}

/** Ítems de menú forzados para recepcionista (sidebar) */
export type RoleNavItem = {
  href: string;
  label: string;
  view: string;
  tip: string;
};

export const RECEPCIONISTA_NAV: RoleNavItem[] = [
  {
    href: "/recepcion/dashboard",
    label: "Recepción (Omnicanal)",
    view: "call_center",
    tip: "Bandeja WhatsApp / Email / VoIP",
  },
  {
    href: "/recepcion/dashboard#visitantes",
    label: "Visitantes",
    view: "call_center",
    tip: "Smart Visitor Board · check-in y gafete RFID",
  },
  {
    href: "/recepcion/dashboard#pqrs",
    label: "Radicar PQRS",
    view: "call_center",
    tip: "Quejas e incidentes de primer contacto",
  },
  {
    href: "/recepcion/dashboard#radar",
    label: "Radar de Rutas (Lectura)",
    view: "logistica",
    tip: "Estado GPS de buses · sin despacho",
  },
];

/** Sidebar forzado — Líder TI (David) */
export const LIDER_TI_NAV: RoleNavItem[] = [
  {
    href: "/ti/dashboard",
    label: "Centro de Control TI",
    view: "tecnologia_ti",
    tip: "Salud de APIs, usuarios y help desk",
  },
  {
    href: "/ti/dashboard#usuarios",
    label: "Usuarios y roles",
    view: "usuarios",
    tip: "Aprovisionamiento y suspensión",
  },
  {
    href: "/ti/dashboard#helpdesk",
    label: "Mesa de ayuda",
    view: "tecnologia_ti",
    tip: "Tickets técnicos internos",
  },
  {
    href: "/ti/dashboard#integraciones",
    label: "Integraciones & APIs",
    view: "tecnologia_ti",
    tip: "GPS, WhatsApp, facturación electrónica",
  },
];

/** Sidebar forzado — Gestor Documental (Roberto) */
export const GESTOR_DOCUMENTAL_NAV: RoleNavItem[] = [
  {
    href: "/archivo/dashboard",
    label: "Archivo y Papelería",
    view: "archivo",
    tip: "Búsqueda universal · custodia · inventario",
  },
  {
    href: "/archivo/dashboard#pendientes",
    label: "Pendientes de digitalizar",
    view: "archivo",
    tip: "Escaneos solicitados",
  },
  {
    href: "/archivo/dashboard#prestamos",
    label: "Carpetas en préstamo",
    view: "archivo",
    tip: "Cadena de custodia física",
  },
  {
    href: "/archivo/dashboard#inventario",
    label: "Inventario administrativo",
    view: "archivo",
    tip: "Papelería y dotación · stock crítico",
  },
];

/** Sidebar forzado — Auxiliar Contable (Mateo) */
export const AUXILIAR_CONTABLE_NAV: RoleNavItem[] = [
  {
    href: "/contabilidad/auxiliar/dashboard",
    label: "Operación financiera",
    view: "contabilidad",
    tip: "CxP · legalizaciones · conciliación",
  },
  {
    href: "/contabilidad/auxiliar/dashboard#facturas",
    label: "Facturas por radicar",
    view: "contabilidad",
    tip: "3-Way Match · causar / devolver",
  },
  {
    href: "/contabilidad/auxiliar/dashboard#legalizaciones",
    label: "Anticipos por legalizar",
    view: "contabilidad",
    tip: "Viáticos y caja menor",
  },
  {
    href: "/contabilidad/auxiliar/dashboard#conciliacion",
    label: "Transacciones por conciliar",
    view: "contabilidad",
    tip: "Auto-Match extracto bancario",
  },
];

/** Sidebar forzado — Gestor Contable (Diana) */
export const GESTOR_CONTABLE_NAV: RoleNavItem[] = [
  {
    href: "/contabilidad/gestor/dashboard",
    label: "Libro diario & facturación",
    view: "contabilidad",
    tip: "PUC · DIAN · Smart Wallet · costeo flota",
  },
  {
    href: "/contabilidad/gestor/dashboard#gastos",
    label: "Gastos de ruta",
    view: "contabilidad",
    tip: "Auditar peajes y tanqueos",
  },
  {
    href: "/contabilidad/gestor/dashboard#facturacion",
    label: "Facturación B2B",
    view: "contabilidad",
    tip: "Prefactura y timbrado DIAN",
  },
  {
    href: "/contabilidad/gestor/dashboard#diario",
    label: "Libro diario",
    view: "contabilidad",
    tip: "Filtro por placa / cuenta PUC",
  },
];

export const RBAC_FORBIDDEN_MESSAGE =
  "No tienes permisos para acceder a este recurso.";
