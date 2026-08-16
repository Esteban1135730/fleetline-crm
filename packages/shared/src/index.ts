import { z } from "zod";
import { Field, FieldOptional } from "./validation";

/** Roles canónicos (empresa + plataforma + apps) */
export const RoleSchema = z.enum([
  "platform_master",
  "org_admin",
  "lider_ti",
  "gestor_documental",
  "recepcionista",
  "recepcion", // alias legado → recepcionista
  "tecnologia",
  "archivo",
  "gestor_contable",
  "auxiliar_contable",
  "tesoreria",
  "director_financiero",
  "qhse",
  "lider_qhse",
  "compras",
  "lider_compras",
  "director_operativo",
  "gestor_operativo",
  "coordinador_operativo",
  "coordinador_campo",
  "centro_control",
  "operador_centro_control",
  "control_interno",
  "auditor_control_interno",
  "presidencia",
  "presidente",
  "vinculaciones",
  "gestor_vinculaciones",
  "coordinador_comercial",
  "gestor_comercial",
  "director_comercial",
  "gerente_general",
  "juridico",
  "director_juridico",
  "revisor_fiscal",
  "coordinador_taller",
  "auxiliar_contable_taller",
  "auxiliar_almacen_taller",
  "mecanico",
  "coordinador_patio",
  "auxiliar_patio",
  "conductor",
  "sub_gerente",
  "monitora",
  "padre",
  "pasajero",
]);
export type Role = z.infer<typeof RoleSchema>;

export const ROLES: Role[] = [
  "platform_master",
  "org_admin",
  "presidencia",
  "presidente",
  "gerente_general",
  "sub_gerente",
  "director_financiero",
  "director_operativo",
  "control_interno",
  "auditor_control_interno",
  "revisor_fiscal",
  "centro_control",
  "operador_centro_control",
  "coordinador_operativo",
  "coordinador_campo",
  "coordinador_comercial",
  "director_comercial",
  "coordinador_taller",
  "coordinador_patio",
  "gestor_operativo",
  "gestor_comercial",
  "gestor_contable",
  "tesoreria",
  "juridico",
  "director_juridico",
  "qhse",
  "lider_qhse",
  "compras",
  "lider_compras",
  "tecnologia",
  "vinculaciones",
  "gestor_vinculaciones",
  "auxiliar_contable",
  "auxiliar_contable_taller",
  "auxiliar_almacen_taller",
  "auxiliar_patio",
  "archivo",
  "lider_ti",
  "gestor_documental",
  "recepcionista",
  "mecanico",
  "conductor",
  "monitora",
  "padre",
  "pasajero",
];

/**
 * Roles del desplegable «Alta de usuario» por empresa.
 * Lista canónica alineada al seed / MANUAL_DE_USO_SISTEMA (sin maestro ni apps externas).
 */
export const ORG_ASSIGNABLE_ROLES: Role[] = [
  "org_admin",
  "presidente",
  "gerente_general",
  "sub_gerente",
  "recepcionista",
  "lider_ti",
  "gestor_documental",
  "auxiliar_contable",
  "gestor_contable",
  "tesoreria",
  "director_financiero",
  "lider_qhse",
  "lider_compras",
  "director_operativo",
  "gestor_operativo",
  "coordinador_campo",
  "operador_centro_control",
  "auditor_control_interno",
  "gestor_vinculaciones",
  "director_comercial",
  "gestor_comercial",
  "coordinador_comercial",
  "director_juridico",
  "revisor_fiscal",
  "coordinador_taller",
  "auxiliar_almacen_taller",
  "auxiliar_contable_taller",
  "mecanico",
  "coordinador_patio",
  "auxiliar_patio",
  "conductor",
  // Alias / roles de área aún usados en flotas existentes
  "presidencia",
  "control_interno",
  "centro_control",
  "coordinador_operativo",
  "qhse",
  "compras",
  "juridico",
  "vinculaciones",
  "tecnologia",
  "archivo",
];

/** Agrupación UI del desplegable de roles (usuarios por empresa) */
export const ORG_ASSIGNABLE_ROLE_GROUPS: ReadonlyArray<{
  label: string;
  roles: readonly Role[];
}> = [
  {
    label: "Gobierno",
    roles: [
      "org_admin",
      "presidente",
      "presidencia",
      "gerente_general",
      "sub_gerente",
    ],
  },
  {
    label: "Recepción & TI & Archivo",
    roles: ["recepcionista", "lider_ti", "tecnologia", "gestor_documental", "archivo"],
  },
  {
    label: "Finanzas",
    roles: [
      "auxiliar_contable",
      "gestor_contable",
      "tesoreria",
      "director_financiero",
    ],
  },
  {
    label: "QHSE & Compras",
    roles: ["lider_qhse", "qhse", "lider_compras", "compras"],
  },
  {
    label: "Operaciones & Control",
    roles: [
      "director_operativo",
      "gestor_operativo",
      "coordinador_operativo",
      "coordinador_campo",
      "operador_centro_control",
      "centro_control",
      "auditor_control_interno",
      "control_interno",
    ],
  },
  {
    label: "Vinculaciones & Comercial",
    roles: [
      "gestor_vinculaciones",
      "vinculaciones",
      "director_comercial",
      "gestor_comercial",
      "coordinador_comercial",
    ],
  },
  {
    label: "Jurídico & Revisoría",
    roles: ["director_juridico", "juridico", "revisor_fiscal"],
  },
  {
    label: "Taller & Patio & Conductor",
    roles: [
      "coordinador_taller",
      "auxiliar_almacen_taller",
      "auxiliar_contable_taller",
      "mecanico",
      "coordinador_patio",
      "auxiliar_patio",
      "conductor",
    ],
  },
];

export const ROLE_LABELS: Record<Role, string> = {
  platform_master: "Usuario maestro de plataforma",
  org_admin: "Administrador de empresa",
  lider_ti: "Líder de tecnología e infraestructura",
  gestor_documental: "Gestor documental / Archivo y papelería",
  recepcionista: "Recepcionista",
  recepcion: "Recepcionista (legado)",
  tecnologia: "Tecnología (legado → Líder de TI)",
  archivo: "Archivo (legado → Gestor documental)",
  gestor_contable: "Gestor contable / Facturación DIAN",
  auxiliar_contable: "Auxiliar contable / Operación financiera",
  tesoreria: "Tesorería y dispersión de caja",
  director_financiero: "Director financiero",
  qhse: "Calidad y SST (legado)",
  lider_qhse: "Líder de calidad, SST y PESV",
  compras: "Compras (legado)",
  lider_compras: "Líder de compras y abastecimiento",
  director_operativo: "Director operativo / Estrategia de flota",
  gestor_operativo: "Gestor operativo / Microdespacho",
  coordinador_operativo: "Coordinador operativo",
  coordinador_campo: "Coordinador de campo / Auditor de campo",
  centro_control: "Centro de control (legado)",
  operador_centro_control: "Operador de centro de control 24/7",
  control_interno: "Control interno (legado)",
  auditor_control_interno: "Auditor de control interno / Forense",
  presidencia: "Presidencia (legado)",
  presidente: "Presidente",
  vinculaciones: "Vinculaciones (legado)",
  gestor_vinculaciones: "Gestor de vinculaciones / Alta de afiliados",
  coordinador_comercial: "Coordinador comercial / Licitaciones públicas",
  gestor_comercial: "Gestor comercial / Ejecutivo de ventas",
  director_comercial: "Director comercial / Embudo de ventas empresas",
  gerente_general: "Gerente general / Centro ejecutivo",
  juridico: "Jurídico (legado)",
  director_juridico: "Director jurídico / Legal y cumplimiento",
  revisor_fiscal: "Revisor fiscal / Impuestos",
  coordinador_taller: "Coordinador de taller",
  auxiliar_contable_taller: "Auxiliar contable de taller",
  auxiliar_almacen_taller: "Auxiliar de almacén de taller",
  mecanico: "Mecánico / App de taller",
  coordinador_patio: "Coordinador de patio",
  auxiliar_patio: "Auxiliar de patio / Lavado",
  conductor: "Conductor / App del conductor",
  sub_gerente: "Subgerente / Ejecución táctica",
  monitora: "Monitora escolar",
  padre: "Padre / acudiente",
  pasajero: "Pasajero",
};

/** Jerarquía: mayor = más mando. Alta de rol ≥ actor → PENDING */
export const ROLE_RANK: Record<string, number> = {
  platform_master: 100,
  org_admin: 95,
  presidencia: 90,
  presidente: 95,
  gerente_general: 88,
  sub_gerente: 85,
  director_financiero: 82,
  director_operativo: 80,
  lider_qhse: 72,
  compras: 60,
  lider_compras: 68,
  control_interno: 75,
  auditor_control_interno: 74,
  revisor_fiscal: 72,
  centro_control: 70,
  operador_centro_control: 71,
  coordinador_operativo: 68,
  coordinador_campo: 62,
  coordinador_comercial: 68,
  director_comercial: 78,
  coordinador_taller: 68,
  coordinador_patio: 68,
  gestor_operativo: 65,
  gestor_comercial: 65,
  gestor_contable: 65,
  tesoreria: 60,
  juridico: 60,
  director_juridico: 78,
  qhse: 70,
  lider_ti: 75,
  tecnologia: 75,
  vinculaciones: 60,
  gestor_vinculaciones: 62,
  auxiliar_contable: 50,
  auxiliar_contable_taller: 50,
  auxiliar_almacen_taller: 52,
  auxiliar_patio: 50,
  gestor_documental: 55,
  archivo: 55,
  recepcionista: 50,
  recepcion: 50,
  mecanico: 40,
  conductor: 20,
  monitora: 18,
  padre: 12,
  pasajero: 10,
  // legado
  gerencia: 88,
  finanzas: 60,
  despacho: 65,
  rrhh: 60,
  atencion: 50,
  sistemas: 75,
  revisoria: 72,
  supervisor: 70,
  comercial: 65,
  taller: 68,
};

/** Alias legado → rol canónico */
const ROLE_ALIASES: Record<string, Role> = {
  gerencia: "gerente_general",
  finanzas: "tesoreria",
  despacho: "gestor_operativo",
  rrhh: "vinculaciones",
  atencion: "recepcionista",
  recepcion: "recepcionista",
  sistemas: "lider_ti",
  tecnologia: "lider_ti",
  archivo: "gestor_documental",
  taller: "coordinador_taller",
  revisoria: "revisor_fiscal",
  revisoria_fiscal: "revisor_fiscal",
  supervisor: "centro_control",
  comercial: "gestor_comercial",
};

export function normalizeRole(role: string): Role {
  const r = String(role || "")
    .toLowerCase()
    .trim();
  if (r === "superadmin" || r === "usuario_maestro") return "platform_master";
  if (r === "lider_qhse" || r === "qhse_lider") return "lider_qhse";
  if (r === "lider_compras" || r === "compras_lider") return "lider_compras";
  if (r === "coordinador_campo" || r === "campo" || r === "field_commander")
    return "coordinador_campo";
  if (
    r === "operador_centro_control" ||
    r === "watchtower" ||
    r === "operador_cc"
  )
    return "operador_centro_control";
  if (
    r === "auditor_control_interno" ||
    r === "auditor_ci" ||
    r === "forensic" ||
    r === "forense"
  )
    return "auditor_control_interno";
  if (r === "presidente" || r === "president" || r === "founder" || r === "alejandro")
    return "presidente";
  if (
    r === "gestor_vinculaciones" ||
    r === "vinculaciones_gestor" ||
    r === "smart_onboarding"
  )
    return "gestor_vinculaciones";
  if (
    r === "director_comercial" ||
    r === "comercial_director" ||
    r === "felipe"
  )
    return "director_comercial";
  if (
    r === "director_juridico" ||
    r === "juridico_director" ||
    r === "sofia_legal"
  )
    return "director_juridico";
  if (r === "juridico") return "juridico";
  if (
    r === "auxiliar_almacen_taller" ||
    r === "almacen_taller" ||
    r === "camilo_almacen"
  )
    return "auxiliar_almacen_taller";
  if (r === "recepcion" || r === "atencion") return "recepcionista";
  if (r === "supervisor_logistica") return "gestor_operativo";
  if (r === "supervisor") return "centro_control";
  if (r === "finanzas" || r === "tesorero") return "tesoreria";
  if (r === "tecnologia" || r === "sistemas" || r === "lider_ti") return "lider_ti";
  if (r === "archivo" || r === "gestor_documental") return "gestor_documental";
  if ((ROLES as string[]).includes(r)) return r as Role;
  if (ROLE_ALIASES[r]) return ROLE_ALIASES[r];
  return "gestor_operativo";
}

export function roleRank(role: string): number {
  const key = String(role || "").toLowerCase();
  return ROLE_RANK[key] ?? ROLE_RANK[normalizeRole(role)] ?? 0;
}

/**
 * 17 áreas corporativas (orden oficial dirección) + módulos secundarios
 * (usuarios / jurídico / dashboard / apps — fuera del menú principal).
 */
export const MODULES = [
  "plataforma",
  "presidencia",
  "gerencia",
  "rrhh",
  "revisoria_fiscal",
  "contabilidad",
  "tesoreria",
  "logistica",
  "comercial",
  "compras",
  "qhse",
  "sarlaft",
  "tramites",
  "tecnologia_ti",
  "archivo",
  "call_center",
  "taller",
  "parqueadero",
  "usuarios",
  "juridico",
  "dashboard",
  "apps",
] as const;
export type ModuleId = (typeof MODULES)[number];

/** Alias legacy → ModuleId canónico (rutas y RequireModule antiguos) */
export const MODULE_ALIASES: Record<string, ModuleId> = {
  finanzas: "tesoreria",
  revisoria: "revisoria_fiscal",
  calidad: "qhse",
  hqse: "qhse",
  sistemas: "tecnologia_ti",
  ti: "tecnologia_ti",
  atencion: "call_center",
  recepcion: "call_center",
  pqrs: "call_center",
  escolar: "apps",
  monitora: "apps",
  padres: "apps",
  pasajeros: "apps",
  "clientes-b2b": "apps",
  b2b: "apps",
  "revisoria-fiscal": "revisoria_fiscal",
  "tecnologia-ti": "tecnologia_ti",
  "call-center": "call_center",
  gerencia_general: "gerencia",
  operaciones: "logistica",
  despacho: "logistica",
  patio: "parqueadero",
  yard: "parqueadero",
  pilot: "apps",
  conductor: "apps",
};

export function resolveModuleId(raw: string): ModuleId | null {
  const key = raw.trim().toLowerCase().replace(/^\//, "");
  if ((MODULES as readonly string[]).includes(key)) return key as ModuleId;
  return MODULE_ALIASES[key] ?? null;
}

/** Path segment (URL) por módulo canónico */
export const MODULE_PATHS: Record<ModuleId, string> = {
  plataforma: "/plataforma",
  presidencia: "/presidencia",
  gerencia: "/gerencia",
  rrhh: "/rrhh",
  revisoria_fiscal: "/revisoria-fiscal",
  contabilidad: "/contabilidad/auxiliar/dashboard",
  tesoreria: "/tesoreria",
  logistica: "/logistica/servicios",
  comercial: "/comercial",
  compras: "/compras/dashboard",
  qhse: "/qhse/dashboard",
  sarlaft: "/sarlaft",
  tramites: "/tramites",
  tecnologia_ti: "/ti/dashboard",
  archivo: "/archivo/dashboard",
  call_center: "/recepcion/dashboard",
  taller: "/taller",
  parqueadero: "/parqueadero",
  usuarios: "/usuarios",
  juridico: "/juridico",
  dashboard: "/dashboard",
  apps: "/apps",
};

export const MODULE_LABELS: Record<ModuleId, string> = {
  plataforma: "Plataforma · empresas",
  presidencia: "Presidencia",
  gerencia: "Gerencia General",
  rrhh: "Recursos Humanos",
  revisoria_fiscal: "Revisoría Fiscal",
  contabilidad: "Contabilidad",
  tesoreria: "Tesorería",
  logistica: "Logística",
  comercial: "Comercial",
  compras: "Compras",
  qhse: "Calidad y SST",
  sarlaft: "SARLAFT",
  tramites: "Trámites",
  tecnologia_ti: "Tecnología y TI",
  archivo: "Archivo y Papelería",
  call_center: "Recepción y centro de llamadas",
  taller: "Taller",
  parqueadero: "Parqueadero",
  usuarios: "Usuarios",
  juridico: "Jurídico",
  dashboard: "Inicio",
  apps: "Canales CRM",
};

/** Texto corto para tooltips y PageIntro */
export const MODULE_HELP: Record<ModuleId, string> = {
  plataforma:
    "Maestro INREDSOFT: registra empresas y crea el admin de cada organización.",
  presidencia:
    "Dirección estratégica, gobierno corporativo y tablero ejecutivo de flota.",
  gerencia:
    "Coordinación general de operaciones, metas y seguimiento inter-áreas.",
  rrhh: "Expedientes, fatiga PESV, nómina operativa y capacitaciones.",
  revisoria_fiscal:
    "Centro de revisoría: impuestos DIAN, detalle forense y cierre de periodo.",
  contabilidad: "PUC, asientos de partida doble y balance de prueba.",
  tesoreria: "Facturas por cobrar y por pagar; marcar pago cuando ocurre.",
  logistica:
    "Crear y gestionar viajes, reportar novedades y ver coordenadas GPS registradas.",
  comercial:
    "Clientes, cotizaciones y contratos operativos (privado o licitación).",
  compras: "Solicitudes de compra y flujo de aprobación hasta recepción.",
  qhse: "Calidad, seguridad, salud ocupacional e incidentes.",
  sarlaft: "Chequeos de riesgo con bloqueo operativo en clientes y pagos CxP.",
  tramites:
    "SOAT, tecnomecánica y documentos del vehículo con control de vencimiento.",
  tecnologia_ti:
    "Salud real de API y base de datos, disponibilidad del proceso, monitoreo y alertas operativas.",
  archivo: "Sala documental: bóveda con sello digital y auditoría inmutable.",
  call_center:
    "Recepción de visitantes y tickets del centro de llamadas en un solo tablero.",
  taller: "Alta de flota y órdenes de trabajo con cambio de estado del vehículo.",
  parqueadero:
    "Ingreso y salida de vehículos en patio con registro real en base de datos.",
  usuarios: "Cuentas de acceso y roles por persona.",
  juridico: "Centro jurídico: contratos, expedientes y SARLAFT.",
  dashboard: "Resumen del día con métricas calculadas desde la base de datos.",
  apps: "Indicadores del CRM por canal operativo. Las apps móviles aún no están integradas.",
};

/** Las 17 áreas del menú lateral (orden oficial) */
export const CORPORATE_AREA_MODULES: ModuleId[] = [
  "presidencia",
  "gerencia",
  "rrhh",
  "revisoria_fiscal",
  "contabilidad",
  "tesoreria",
  "logistica",
  "comercial",
  "compras",
  "qhse",
  "sarlaft",
  "tramites",
  "tecnologia_ti",
  "archivo",
  "call_center",
  "taller",
  "parqueadero",
];

export const ROLE_VIEWS: Record<Role, ModuleId[]> = {
  platform_master: [...MODULES],
  org_admin: [...MODULES.filter((m) => m !== "plataforma")],
  presidencia: [
    "presidencia",
    "gerencia",
    "dashboard",
    "comercial",
    "logistica",
    "tesoreria",
    "contabilidad",
    "rrhh",
    "qhse",
    "archivo",
  ],
  presidente: [
    "presidencia",
    "gerencia",
    "dashboard",
    "comercial",
    "logistica",
    "tesoreria",
    "contabilidad",
    "compras",
    "rrhh",
    "qhse",
    "taller",
    "archivo",
    "revisoria_fiscal",
    "sarlaft",
  ],
  gerente_general: [
    "presidencia",
    "gerencia",
    "dashboard",
    "comercial",
    "logistica",
    "tesoreria",
    "contabilidad",
    "taller",
    "compras",
    "rrhh",
    "revisoria_fiscal",
    "qhse",
    "archivo",
    "usuarios",
  ],
  sub_gerente: [
    "gerencia",
    "dashboard",
    "comercial",
    "logistica",
    "parqueadero",
    "tramites",
    "taller",
    "rrhh",
    "qhse",
    "apps",
  ],
  director_financiero: [
    "tesoreria",
    "contabilidad",
    "comercial",
    "dashboard",
    "compras",
    "revisoria_fiscal",
    "juridico",
    "sarlaft",
    "archivo",
    "gerencia",
    "taller",
    "rrhh",
  ],
  director_operativo: [
    "dashboard",
    "logistica",
    "parqueadero",
    "tramites",
    "taller",
    "rrhh",
    "qhse",
  ],
  control_interno: [
    "dashboard",
    "revisoria_fiscal",
    "contabilidad",
    "tesoreria",
    "compras",
    "logistica",
    "taller",
    "rrhh",
    "archivo",
    "sarlaft",
    "gerencia",
  ],
  auditor_control_interno: [
    "dashboard",
    "revisoria_fiscal",
    "contabilidad",
    "tesoreria",
    "compras",
    "logistica",
    "taller",
    "rrhh",
    "archivo",
    "sarlaft",
  ],
  revisor_fiscal: [
    "dashboard",
    "revisoria_fiscal",
    "contabilidad",
    "tesoreria",
    "compras",
    "presidencia",
    "gerencia",
    "archivo",
    "sarlaft",
  ],
  centro_control: [
    "dashboard",
    "logistica",
    "qhse",
    "apps",
    "parqueadero",
    "tramites",
    "gerencia",
  ],
  operador_centro_control: [
    "dashboard",
    "logistica",
    "qhse",
    "apps",
    "parqueadero",
    "tramites",
  ],
  coordinador_operativo: [
    "dashboard",
    "logistica",
    "parqueadero",
    "tramites",
    "apps",
    "gerencia",
  ],
  coordinador_campo: [
    "dashboard",
    "logistica",
    "qhse",
    "parqueadero",
    "apps",
  ],
  coordinador_comercial: [
    "dashboard",
    "comercial",
    "logistica",
    "call_center",
    "gerencia",
    "archivo",
  ],
  director_comercial: [
    "dashboard",
    "comercial",
    "logistica",
    "tesoreria",
    "gerencia",
  ],
  coordinador_taller: ["dashboard", "taller", "compras", "logistica", "parqueadero"],
  auxiliar_almacen_taller: ["dashboard", "taller", "compras"],
  coordinador_patio: ["dashboard", "parqueadero", "logistica", "tramites"],
  gestor_operativo: [
    "dashboard",
    "logistica",
    "parqueadero",
    "tramites",
    "taller",
    "comercial",
    "rrhh",
    "archivo",
  ],
  gestor_comercial: ["dashboard", "comercial", "call_center"],
  gestor_contable: [
    "dashboard",
    "contabilidad",
    "tesoreria",
    "compras",
    "archivo",
    "rrhh",
    "taller",
  ],
  tesoreria: ["dashboard", "tesoreria", "contabilidad", "compras", "archivo"],
  juridico: ["dashboard", "juridico", "sarlaft", "archivo", "tramites"],
  director_juridico: [
    "dashboard",
    "juridico",
    "sarlaft",
    "archivo",
    "tramites",
    "comercial",
    "rrhh",
    "logistica",
    "taller",
  ],
  qhse: ["dashboard", "qhse", "logistica", "taller", "archivo", "rrhh", "call_center"],
  lider_qhse: [
    "dashboard",
    "qhse",
    "logistica",
    "taller",
    "archivo",
    "rrhh",
    "call_center",
  ],
  tecnologia: [
    "dashboard",
    "tecnologia_ti",
    "usuarios",
    "archivo",
    "presidencia",
    "gerencia",
  ],
  lider_ti: [
    "dashboard",
    "tecnologia_ti",
    "usuarios",
    "archivo",
    "presidencia",
    "gerencia",
  ],
  compras: [
    "dashboard",
    "compras",
    "taller",
    "tesoreria",
    "contabilidad",
    "tramites",
    "archivo",
  ],
  lider_compras: [
    "dashboard",
    "compras",
    "taller",
    "tesoreria",
    "contabilidad",
    "tramites",
    "archivo",
  ],
  vinculaciones: ["dashboard", "rrhh", "qhse", "archivo", "gerencia", "usuarios"],
  gestor_vinculaciones: [
    "dashboard",
    "rrhh",
    "archivo",
    "tramites",
    "qhse",
  ],
  auxiliar_contable: ["dashboard", "contabilidad"],
  auxiliar_contable_taller: ["dashboard", "taller", "contabilidad", "compras"],
  auxiliar_patio: ["dashboard", "parqueadero"],
  archivo: ["dashboard", "archivo", "tramites"],
  gestor_documental: ["dashboard", "archivo", "tramites"],
  /** Módulo 1 — Flor: visitas + omnicanal + radar lectura; sin finanzas/RRHH/contratos */
  recepcionista: ["dashboard", "call_center", "logistica", "apps"],
  recepcion: ["dashboard", "call_center", "logistica", "apps"],
  mecanico: ["dashboard", "taller"],
  conductor: ["logistica", "apps"],
  monitora: ["apps", "logistica"],
  padre: ["apps"],
  pasajero: ["apps"],
};

/** ¿El rol puede acceder a este módulo? (misma regla UI + API) */
export function canAccessModule(
  role: string | Role,
  module: ModuleId | string,
): boolean {
  const key = normalizeRole(String(role));
  const views = ROLE_VIEWS[key] ?? ROLE_VIEWS[String(role).toLowerCase() as Role];
  if (!views) return false;
  const resolved = resolveModuleId(String(module));
  if (!resolved) return false;
  return views.includes(resolved);
}

export function modulesForRole(role: string | Role): ModuleId[] {
  const key = normalizeRole(String(role));
  const views = ROLE_VIEWS[key] ?? ROLE_VIEWS[String(role).toLowerCase() as Role];
  return views ? [...views] : [];
}

export * from "./rbac";
export * from "./departments";
export * from "./nav-departments";
export * from "./labels-es";
export type { FieldKind } from "./validation";
export {
  Field,
  FieldOptional,
  FIELD_MESSAGES,
  digitsOnly,
  sanitizeText,
  sanitizeUnknown,
  inferFieldKind,
  isAllowedPartial,
  filterPasted,
  validateComplete,
} from "./validation";

export const LoginSchema = z.object({
  email: Field.email,
  password: z.string().min(4).max(128),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const CreateUserSchema = z.object({
  name: Field.personName,
  email: Field.email,
  password: Field.password,
  role: RoleSchema,
  active: z.boolean().optional(),
});
export type CreateUserInput = z.infer<typeof CreateUserSchema>;

export const CustomerSchema = z.object({
  name: Field.legalName,
  nit: Field.nit,
  email: FieldOptional.email,
  phone: FieldOptional.phone,
  segment: z.enum(["B2B", "ESCOLAR", "TURISMO"]).default("B2B"),
});
export type CustomerInput = z.infer<typeof CustomerSchema>;

export const TripStatusSchema = z.enum([
  "PENDING",
  "ASSIGNED",
  "IN_TRANSIT",
  "COMPLETED",
  "CANCELLED",
  "INCIDENT",
]);
export type TripStatus = z.infer<typeof TripStatusSchema>;

export const VehicleStatusSchema = z.enum([
  "AVAILABLE",
  "IN_SERVICE",
  "MAINTENANCE",
  "OUT_OF_SERVICE",
]);
export type VehicleStatus = z.infer<typeof VehicleStatusSchema>;

export const InvoiceStatusSchema = z.enum([
  "DRAFT",
  "ISSUED",
  "PAID",
  "OVERDUE",
  "CANCELLED",
]);
export type InvoiceStatus = z.infer<typeof InvoiceStatusSchema>;

export const WorkOrderStatusSchema = z.enum([
  "OPEN",
  "IN_PROGRESS",
  "WAITING_PARTS",
  "DONE",
]);
export type WorkOrderStatus = z.infer<typeof WorkOrderStatusSchema>;

/** Hard rules — umbrales operativos Inretrans OS */
export const HARD_RULES = {
  /** Días para semáforo amarillo / DocStatus.EXPIRING */
  DOC_EXPIRING_DAYS: 15,
  /** Fatiga alta bloquea despacho (Driver.fatigueScore) */
  FATIGUE_BLOCK_SCORE: 80,
  /** Micro-Dispatch 4.0 — fatiga máxima para asignación inteligente */
  DISPATCH_FATIGUE_MAX: 30,
  /** Watchtower — umbral inferior Zona Amarilla (fatiga) */
  FATIGUE_YELLOW_MIN: 40,
  /** Watchtower — umbral superior Zona Amarilla (antes de bloqueo) */
  FATIGUE_YELLOW_MAX: 79,
  /** Watchtower — distancia (km) para instrucción de parada activa */
  FATIGUE_STOP_INSTRUCTION_KM: 15,
  /** Horas mínimas de descanso legal entre turnos (PESV) */
  MIN_LEGAL_REST_HOURS: 8,
  /** Horas continuas de conducción — umbral legal (bloquea despacho) */
  FATIGUE_CONTINUOUS_HOURS: 8,
  /** Horas acumuladas en ventana de 24h — umbral diario */
  FATIGUE_DAILY_HOURS: 12,
  /** Km entre OT preventivas */
  MAINTENANCE_INTERVAL_KM: 10000,
  /** Smart Audit — desviación % galones vs GPS que marca anomalía */
  FUEL_AUDIT_DEVIATION_PCT: 20,
  /** Distancia por defecto al cerrar viaje si no se envía distanceKm */
  DEFAULT_TRIP_DISTANCE_KM: 45,
  /** Margen mínimo sano cotizador B2B (%). Inferior → escala CFO */
  COMERCIAL_MIN_MARGIN_PCT: 12,
  /** Radar renovaciones — días antes del vencimiento */
  COMERCIAL_RENEWAL_RADAR_DAYS: 90,
  /** Cuota mensual demo Director Comercial (COP) */
  COMERCIAL_MONTHLY_QUOTA_COP: 450_000_000,
  /** Tope descuento Gestor Comercial (%). Superior → escala Director */
  GESTOR_COMERCIAL_MAX_DISCOUNT_PCT: 5,
  /** Tope aprobación Nivel 1 Coordinador Comercial (%). Superior → escala CFO */
  COORDINADOR_COMERCIAL_MAX_DISCOUNT_PCT: 15,
  /** SLA primer contacto lead (horas) — rojo + reasignación */
  COMERCIAL_LEAD_SLA_HOURS: 2,
  /** PIN firma ejecutiva Gerente General (dígitos) */
  GERENTE_EXECUTIVE_PIN_DIGITS: 6,
  /** Tope % penalidad contractual permitido por política FSG */
  LEGAL_MAX_PENALTY_CLAUSE_PCT: 15,
  /** Muestreo aleatorio Revisoría Fiscal (% transacciones del mes) */
  REVISORIA_SAMPLE_PCT: 5,
  /** Tolerancia retenciones DIAN (puntos porcentuales) */
  REVISORIA_RETENTION_TOLERANCE_PP: 0.5,
  /** ReteFuente estándar demo proveedores (%) */
  REVISORIA_DEFAULT_RETEFUENTE_PCT: 2.5,
  /** Alerta predictiva mantenimiento (km antes del intervalo) */
  TALLER_PREVENTIVE_ALERT_KM: 500,
  /** Bloqueo UI Pilot App si velocidad > umbral (km/h) */
  PILOT_SPEED_LOCK_KPH: 15,
} as const;

/** PIN demo Gerencia (solo seed / tests — hash en User.executivePinHash) */
export const GERENTE_DEMO_EXECUTIVE_PIN = "258014";

/** Costo salarial zona → COP/km (historial nómina / zona) */
export const COMERCIAL_ZONE_SALARY_PER_KM: Record<string, number> = {
  BOGOTA: 980,
  MEDELLIN: 920,
  CALI: 890,
  BARRANQUILLA: 860,
  DEFAULT: 900,
};

/** Riesgos SARLAFT que bloquean alta de cliente / pago CxP */
export const SARLAFT_BLOCK_RISKS = ["HIGH", "BLOCKED"] as const;

export const ArchiveCategorySchema = z.enum([
  "CONTRACT",
  "INVOICE",
  "LEGAL",
  "HR",
  "OPS",
  "OTHER",
]);
export type ArchiveCategoryCode = z.infer<typeof ArchiveCategorySchema>;

export const ArchiveUploadMetaSchema = z.object({
  title: z.string().min(1).optional(),
  category: ArchiveCategorySchema.optional(),
  tags: z.string().optional(),
});
export type ArchiveUploadMeta = z.infer<typeof ArchiveUploadMetaSchema>;

export const SarlaftForceSchema = z.object({
  forceDespiteSarlaft: z.boolean().optional(),
});

export const PreoperationalChecklistSchema = z.object({
  frenos: z.boolean(),
  luces: z.boolean(),
  llantas: z.boolean(),
  kitCarretera: z.boolean(),
  nivelAceite: z.boolean(),
  observaciones: z.string().optional(),
});
export type PreoperationalChecklist = z.infer<
  typeof PreoperationalChecklistSchema
>;

/** Ítems de inspección (etiqueta UI) */
export const PREOPERATIONAL_ITEMS = [
  { key: "frenos" as const, label: "Frenos" },
  { key: "luces" as const, label: "Luces" },
  { key: "llantas" as const, label: "Llantas" },
  { key: "kitCarretera" as const, label: "Kit de carretera" },
  { key: "nivelAceite" as const, label: "Nivel de aceite" },
] as const;

/** Normaliza payload legacy (en) → schema ES */
export function normalizePreoperational(
  raw: unknown,
): PreoperationalChecklist | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const frenos = o.frenos ?? o.brakes;
  const luces = o.luces ?? o.lights;
  const llantas = o.llantas ?? o.tires;
  const kitCarretera = o.kitCarretera ?? o.roadKit;
  const nivelAceite = o.nivelAceite ?? o.oilLevel ?? true;
  const observaciones =
    typeof o.observaciones === "string"
      ? o.observaciones
      : typeof o.notes === "string"
        ? o.notes
        : undefined;
  if (
    typeof frenos !== "boolean" ||
    typeof luces !== "boolean" ||
    typeof llantas !== "boolean" ||
    typeof kitCarretera !== "boolean" ||
    typeof nivelAceite !== "boolean"
  ) {
    return null;
  }
  return {
    frenos,
    luces,
    llantas,
    kitCarretera,
    nivelAceite,
    observaciones,
  };
}

/** Tipos de vehículo para cotizador comercial (capacidad de pasajeros). */
export const QuoteVehicleTypeSchema = z.enum([
  "CAMIONETA_STATION_WAGON",
  "CAMIONETA_CAMPERO",
  "CAMIONETA_DOBLE_CABINA",
  "VAN",
  "MICROBUS",
  "BUSETA",
  "BUS",
]);
export type QuoteVehicleType = z.infer<typeof QuoteVehicleTypeSchema>;

/** Códigos legado → catálogo vigente */
const QUOTE_VEHICLE_LEGACY: Record<string, QuoteVehicleType> = {
  BUS_ESCOLAR: "BUS",
  BUS_TURISMO: "BUS",
  CAMION_CARGA: "CAMIONETA_DOBLE_CABINA",
};

export function resolveQuoteVehicleType(raw: string): QuoteVehicleType {
  const mapped = QUOTE_VEHICLE_LEGACY[raw] ?? raw;
  if (mapped in QUOTE_VEHICLE_COSTS) return mapped as QuoteVehicleType;
  return "BUS";
}

export const QUOTE_VEHICLE_COSTS: Record<
  QuoteVehicleType,
  {
    label: string;
    passengers: string;
    passengersMin: number;
    passengersMax: number;
    costPerKm: number;
    driverPay: number;
  }
> = {
  CAMIONETA_STATION_WAGON: {
    label: "Camioneta station wagon — 1 a 4 pasajeros",
    passengers: "1 a 4 pasajeros",
    passengersMin: 1,
    passengersMax: 4,
    costPerKm: 1800,
    driverPay: 70_000,
  },
  CAMIONETA_CAMPERO: {
    label: "Camioneta campero — 1 a 4 pasajeros",
    passengers: "1 a 4 pasajeros",
    passengersMin: 1,
    passengersMax: 4,
    costPerKm: 1900,
    driverPay: 70_000,
  },
  CAMIONETA_DOBLE_CABINA: {
    label: "Camioneta doble cabina — 1 a 4 pasajeros",
    passengers: "1 a 4 pasajeros",
    passengersMin: 1,
    passengersMax: 4,
    costPerKm: 2000,
    driverPay: 75_000,
  },
  VAN: {
    label: "Van — 5 a 9 pasajeros",
    passengers: "5 a 9 pasajeros",
    passengersMin: 5,
    passengersMax: 9,
    costPerKm: 2200,
    driverPay: 80_000,
  },
  MICROBUS: {
    label: "Microbus — 10 a 18 pasajeros",
    passengers: "10 a 18 pasajeros",
    passengersMin: 10,
    passengersMax: 18,
    costPerKm: 2800,
    driverPay: 100_000,
  },
  BUSETA: {
    label: "Buseta — 19 a 25 pasajeros",
    passengers: "19 a 25 pasajeros",
    passengersMin: 19,
    passengersMax: 25,
    costPerKm: 3500,
    driverPay: 120_000,
  },
  BUS: {
    label: "Bus — 26 a 41 pasajeros",
    passengers: "26 a 41 pasajeros",
    passengersMin: 26,
    passengersMax: 41,
    costPerKm: 4500,
    driverPay: 150_000,
  },
};

/** Costo promedio peaje COP (piloto) */
export const QUOTE_AVG_TOLL_COP = 18_000;
export const QUOTE_DEFAULT_MARGIN_PCT = 30;

export const QuoteCalculateInputSchema = z.object({
  origen: z.string().min(1),
  destino: z.string().min(1),
  tipoVehiculo: QuoteVehicleTypeSchema,
  distanciaKm: z.number().positive(),
  cantidadPeajes: z.number().int().min(0).default(0),
  margenDeseado: z.number().min(1).max(80).default(QUOTE_DEFAULT_MARGIN_PCT),
});
export type QuoteCalculateInput = z.infer<typeof QuoteCalculateInputSchema>;

export type QuoteCostBreakdown = {
  origen: string;
  destino: string;
  tipoVehiculo: QuoteVehicleType;
  tipoVehiculoLabel: string;
  distanciaKm: number;
  cantidadPeajes: number;
  margenDeseado: number;
  costoKmVehiculo: number;
  costoDistancia: number;
  costoPeajes: number;
  costoPromedioPeaje: number;
  pagoConductor: number;
  costoOperativo: number;
  utilidadBruta: number;
  precioSugerido: number;
  currency: "COP";
  formula: string;
};

export function calculateQuotePrice(
  input: QuoteCalculateInput,
): QuoteCostBreakdown {
  const tipo = resolveQuoteVehicleType(input.tipoVehiculo);
  const vehicle = QUOTE_VEHICLE_COSTS[tipo];
  const margen = input.margenDeseado ?? QUOTE_DEFAULT_MARGIN_PCT;
  const peajes = input.cantidadPeajes ?? 0;
  const costoDistancia = input.distanciaKm * vehicle.costPerKm;
  const costoPeajes = peajes * QUOTE_AVG_TOLL_COP;
  const pagoConductor = vehicle.driverPay;
  const costoOperativo = costoDistancia + costoPeajes + pagoConductor;
  const divisor = 1 - margen / 100;
  const precioSugerido = divisor > 0 ? costoOperativo / divisor : costoOperativo;
  const utilidadBruta = precioSugerido - costoOperativo;

  return {
    origen: input.origen.trim(),
    destino: input.destino.trim(),
    tipoVehiculo: tipo,
    tipoVehiculoLabel: vehicle.label,
    distanciaKm: input.distanciaKm,
    cantidadPeajes: peajes,
    margenDeseado: margen,
    costoKmVehiculo: vehicle.costPerKm,
    costoDistancia: Math.round(costoDistancia),
    costoPeajes: Math.round(costoPeajes),
    costoPromedioPeaje: QUOTE_AVG_TOLL_COP,
    pagoConductor,
    costoOperativo: Math.round(costoOperativo),
    utilidadBruta: Math.round(utilidadBruta),
    precioSugerido: Math.round(precioSugerido),
    currency: "COP",
    formula:
      "Precio = (km×costoKm + peajes×peajeAvg + pagoConductor) / (1 − margen/100)",
  };
}
export type DispatchSemaphore = "GREEN" | "YELLOW" | "RED";

export type DashboardMetrics = {
  ingresosMtd: number;
  margenUtilidad: number;
  flotaOperacion: number;
  flotaTotal: number;
  viajesActivos: number;
  novedades: number;
  bloqueosHoy: number;
  nps: number;
};

export type GpsPoint = {
  vehicleId: string;
  plate: string;
  lat: number;
  lng: number;
  status: VehicleStatus;
  updatedAt: string;
};
