import { z } from "zod";

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
  "compras",
  "director_operativo",
  "gestor_operativo",
  "coordinador_operativo",
  "centro_control",
  "control_interno",
  "presidencia",
  "vinculaciones",
  "coordinador_comercial",
  "gestor_comercial",
  "gerente_general",
  "juridico",
  "revisor_fiscal",
  "coordinador_taller",
  "auxiliar_contable_taller",
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
  "gerente_general",
  "sub_gerente",
  "director_financiero",
  "director_operativo",
  "control_interno",
  "revisor_fiscal",
  "centro_control",
  "coordinador_operativo",
  "coordinador_comercial",
  "coordinador_taller",
  "coordinador_patio",
  "gestor_operativo",
  "gestor_comercial",
  "gestor_contable",
  "tesoreria",
  "juridico",
  "qhse",
  "tecnologia",
  "compras",
  "vinculaciones",
  "auxiliar_contable",
  "auxiliar_contable_taller",
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

/** Roles asignables en alta de usuarios de empresa (sin maestro) */
export const ORG_ASSIGNABLE_ROLES: Role[] = ROLES.filter(
  (r) => r !== "platform_master" && r !== "monitora" && r !== "padre" && r !== "pasajero",
);

export const ROLE_LABELS: Record<Role, string> = {
  platform_master: "Usuario Maestro (SUPERADMIN)",
  org_admin: "Admin de empresa",
  lider_ti: "Líder TI",
  gestor_documental: "Gestor documental",
  recepcionista: "Recepcionista",
  recepcion: "Recepcionista (legado)",
  tecnologia: "Tecnología",
  archivo: "Archivo (legado)",
  gestor_contable: "Gestor contable",
  auxiliar_contable: "Auxiliar contable",
  tesoreria: "Tesorería",
  director_financiero: "Director financiero",
  qhse: "QHSE",
  compras: "Compras",
  director_operativo: "Director operativo",
  gestor_operativo: "Gestor operativo",
  coordinador_operativo: "Coordinador operativo",
  centro_control: "Centro de control",
  control_interno: "Control interno",
  presidencia: "Presidencia",
  vinculaciones: "Vinculaciones",
  coordinador_comercial: "Coordinador comercial",
  gestor_comercial: "Gestor comercial",
  gerente_general: "Gerente general",
  juridico: "Jurídico",
  revisor_fiscal: "Revisor fiscal",
  coordinador_taller: "Coordinador taller",
  auxiliar_contable_taller: "Auxiliar contable taller",
  mecanico: "Mecánico",
  coordinador_patio: "Coordinador patio",
  auxiliar_patio: "Auxiliar patio",
  conductor: "Conductor",
  sub_gerente: "Sub gerente",
  monitora: "Monitora escolar",
  padre: "Padre / acudiente",
  pasajero: "Pasajero",
};

/** Jerarquía: mayor = más mando. Alta de rol ≥ actor → PENDING */
export const ROLE_RANK: Record<string, number> = {
  platform_master: 100,
  org_admin: 95,
  presidencia: 90,
  gerente_general: 88,
  sub_gerente: 85,
  director_financiero: 82,
  director_operativo: 80,
  control_interno: 75,
  revisor_fiscal: 72,
  centro_control: 70,
  coordinador_operativo: 68,
  coordinador_comercial: 68,
  coordinador_taller: 68,
  coordinador_patio: 68,
  gestor_operativo: 65,
  gestor_comercial: 65,
  gestor_contable: 65,
  tesoreria: 60,
  juridico: 60,
  qhse: 60,
  lider_ti: 75,
  tecnologia: 75,
  compras: 60,
  vinculaciones: 60,
  auxiliar_contable: 50,
  auxiliar_contable_taller: 50,
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
  compras: "/compras",
  qhse: "/qhse",
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
  qhse: "QHSE",
  sarlaft: "SARLAFT",
  tramites: "Trámites",
  tecnologia_ti: "Tecnología y TI",
  archivo: "Archivo y Papelería",
  call_center: "Recepción y Call Center",
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
    "Hallazgos de revisoría fiscal registrados y seguidos en el CRM.",
  contabilidad: "PUC, asientos de partida doble y balance de prueba.",
  tesoreria: "Facturas por cobrar y por pagar; marcar pago cuando ocurre.",
  logistica:
    "Crear y gestionar viajes, reportar novedades y ver coordenadas GPS registradas.",
  comercial:
    "Clientes, cotizaciones y contratos operativos (privado o licitación).",
  compras: "Solicitudes de compra y flujo de aprobación hasta recepción.",
  qhse: "Calidad, seguridad, salud ocupacional e incidentes HSQE.",
  sarlaft: "Chequeos de riesgo con bloqueo operativo en clientes y pagos CxP.",
  tramites:
    "SOAT, tecnomecánica y documentos del vehículo con control de vencimiento.",
  tecnologia_ti:
    "Salud real de API/DB, uptime del proceso, NOC y alertas operativas.",
  archivo: "Data Room: bóveda documental con hash SHA-256 y auditoría inmutable.",
  call_center:
    "Recepción de visitantes y tickets de call center en un solo cockpit.",
  taller: "Alta de flota y órdenes de trabajo con cambio de estado del vehículo.",
  parqueadero:
    "Ingreso y salida de vehículos en patio con registro real en base de datos.",
  usuarios: "Cuentas de acceso y roles por persona.",
  juridico: "Documentos FUEC vinculados a vehículos y contratos.",
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
  gerente_general: [
    "presidencia",
    "gerencia",
    "dashboard",
    "apps",
    "comercial",
    "logistica",
    "parqueadero",
    "tramites",
    "taller",
    "compras",
    "rrhh",
    "call_center",
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
    "dashboard",
    "tesoreria",
    "contabilidad",
    "compras",
    "revisoria_fiscal",
    "juridico",
    "sarlaft",
    "archivo",
    "gerencia",
  ],
  director_operativo: [
    "dashboard",
    "logistica",
    "parqueadero",
    "tramites",
    "taller",
    "comercial",
    "rrhh",
    "apps",
    "gerencia",
    "qhse",
  ],
  control_interno: [
    "dashboard",
    "revisoria_fiscal",
    "contabilidad",
    "tesoreria",
    "compras",
    "archivo",
    "sarlaft",
    "gerencia",
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
    "apps",
    "parqueadero",
    "tramites",
    "gerencia",
  ],
  coordinador_operativo: [
    "dashboard",
    "logistica",
    "parqueadero",
    "tramites",
    "apps",
    "gerencia",
  ],
  coordinador_comercial: ["dashboard", "comercial", "logistica", "apps", "gerencia"],
  coordinador_taller: ["dashboard", "taller", "compras", "logistica", "parqueadero"],
  coordinador_patio: ["dashboard", "parqueadero", "logistica", "tramites"],
  gestor_operativo: [
    "dashboard",
    "logistica",
    "parqueadero",
    "tramites",
    "taller",
    "comercial",
    "contabilidad",
    "tesoreria",
    "compras",
    "archivo",
    "rrhh",
    "apps",
    "gerencia",
    "usuarios",
  ],
  gestor_comercial: ["dashboard", "comercial", "logistica", "apps", "archivo"],
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
  qhse: ["dashboard", "qhse", "logistica", "taller", "archivo"],
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
  compras: ["dashboard", "compras", "taller", "tesoreria", "archivo"],
  vinculaciones: ["dashboard", "rrhh", "qhse", "archivo", "gerencia", "usuarios"],
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

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(4),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const CreateUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: RoleSchema,
  active: z.boolean().optional(),
});
export type CreateUserInput = z.infer<typeof CreateUserSchema>;

export const CustomerSchema = z.object({
  name: z.string().min(2),
  nit: z.string().min(5),
  email: z.string().email().optional(),
  phone: z.string().optional(),
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
  /** Horas continuas de conducción — umbral legal (bloquea despacho) */
  FATIGUE_CONTINUOUS_HOURS: 8,
  /** Horas acumuladas en ventana de 24h — umbral diario */
  FATIGUE_DAILY_HOURS: 12,
  /** Km entre OT preventivas */
  MAINTENANCE_INTERVAL_KM: 10000,
  /** Distancia por defecto al cerrar viaje si no se envía distanceKm */
  DEFAULT_TRIP_DISTANCE_KM: 45,
} as const;

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

/** Tipos de vehículo para cotizador comercial */
export const QuoteVehicleTypeSchema = z.enum([
  "BUS_ESCOLAR",
  "BUS_TURISMO",
  "CAMION_CARGA",
  "VAN",
]);
export type QuoteVehicleType = z.infer<typeof QuoteVehicleTypeSchema>;

export const QUOTE_VEHICLE_COSTS: Record<
  QuoteVehicleType,
  { label: string; costPerKm: number; driverPay: number }
> = {
  BUS_ESCOLAR: {
    label: "Bus escolar",
    costPerKm: 3200,
    driverPay: 120_000,
  },
  BUS_TURISMO: {
    label: "Bus turismo",
    costPerKm: 4500,
    driverPay: 150_000,
  },
  CAMION_CARGA: {
    label: "Camión de carga",
    costPerKm: 2800,
    driverPay: 100_000,
  },
  VAN: { label: "Van / microbús", costPerKm: 2200, driverPay: 80_000 },
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
  const vehicle = QUOTE_VEHICLE_COSTS[input.tipoVehiculo];
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
    tipoVehiculo: input.tipoVehiculo,
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
