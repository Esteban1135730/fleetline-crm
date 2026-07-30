import { z } from "zod";

export const RoleSchema = z.enum([
  "presidencia",
  "gerencia",
  "finanzas",
  "despacho",
  "rrhh",
  "atencion",
  "sistemas",
]);
export type Role = z.infer<typeof RoleSchema>;

export const ROLES: Role[] = [
  "presidencia",
  "gerencia",
  "finanzas",
  "despacho",
  "rrhh",
  "atencion",
  "sistemas",
];

export const ROLE_LABELS: Record<Role, string> = {
  presidencia: "Gerencia general",
  gerencia: "Operaciones",
  finanzas: "Finanzas",
  despacho: "Despacho",
  rrhh: "Recursos humanos",
  atencion: "Atención al cliente",
  sistemas: "Tecnología",
};

/** Módulos del producto */
export const MODULES = [
  "dashboard",
  "apps",
  "comercial",
  "logistica",
  "parqueadero",
  "tramites",
  "taller",
  "compras",
  "finanzas",
  "contabilidad",
  "revisoria",
  "rrhh",
  "atencion",
  "calidad",
  "juridico",
  "sarlaft",
  "archivo",
  "recepcion",
  "sistemas",
  "usuarios",
] as const;
export type ModuleId = (typeof MODULES)[number];

export const MODULE_LABELS: Record<ModuleId, string> = {
  dashboard: "Inicio",
  apps: "Canales CRM",
  comercial: "Comercial",
  logistica: "Operaciones",
  parqueadero: "Parqueadero",
  tramites: "Trámites / Carros",
  taller: "Taller",
  compras: "Compras",
  finanzas: "Tesorería",
  contabilidad: "Contabilidad",
  revisoria: "Revisoría fiscal",
  rrhh: "Recursos humanos",
  atencion: "Call Center",
  calidad: "HSQE / Calidad",
  juridico: "Jurídico",
  sarlaft: "SARLAFT",
  archivo: "Archivo",
  recepcion: "Recepción",
  sistemas: "Sistemas",
  usuarios: "Usuarios",
};

/** Texto corto para que cualquiera entienda el módulo */
export const MODULE_HELP: Record<ModuleId, string> = {
  dashboard: "Resumen del día con métricas calculadas desde la base de datos.",
  apps: "Indicadores del CRM por canal operativo. Las apps móviles aún no están integradas.",
  comercial:
    "Clientes, cotizaciones y contratos operativos (privado o licitación).",
  logistica:
    "Crear y gestionar viajes, reportar novedades y ver coordenadas GPS registradas.",
  parqueadero:
    "Ingreso y salida de vehículos en patio con registro real en base de datos.",
  tramites:
    "SOAT, tecnomecánica y documentos del vehículo con control de vencimiento.",
  taller: "Alta de flota y órdenes de trabajo con cambio de estado del vehículo.",
  compras: "Solicitudes de compra y flujo de aprobación hasta recepción.",
  finanzas: "Facturas por cobrar y por pagar; marcar pago cuando ocurre.",
  contabilidad: "PUC, asientos de partida doble y balance de prueba.",
  revisoria: "Hallazgos de revisoría fiscal registrados y seguidos en el CRM.",
  rrhh: "Personal por área, estado laboral y fatiga operativa.",
  atencion: "Tickets de call center registrados manualmente (sin WhatsApp API aún).",
  calidad: "Eventos NPS e incidentes HSQE cargados en el sistema.",
  juridico: "Documentos FUEC vinculados a vehículos y contratos.",
  sarlaft: "Registro manual de chequeos de riesgo (sin listas externas aún).",
  archivo: "Metadatos de documentos archivados (referencia de archivo).",
  recepcion: "Check-in y check-out de visitantes en sede.",
  sistemas: "Salud real de API/DB, uptime del proceso y alertas operativas.",
  usuarios: "Cuentas de acceso y roles por persona.",
};

export const ROLE_VIEWS: Record<Role, ModuleId[]> = {
  presidencia: [...MODULES],
  gerencia: [
    "dashboard",
    "apps",
    "comercial",
    "logistica",
    "parqueadero",
    "tramites",
    "taller",
    "compras",
    "rrhh",
    "atencion",
    "calidad",
    "recepcion",
  ],
  finanzas: [
    "dashboard",
    "finanzas",
    "contabilidad",
    "revisoria",
    "compras",
    "juridico",
    "sarlaft",
    "archivo",
  ],
  despacho: [
    "dashboard",
    "logistica",
    "parqueadero",
    "tramites",
    "taller",
    "comercial",
    "apps",
  ],
  rrhh: ["dashboard", "rrhh", "calidad", "archivo"],
  atencion: ["dashboard", "atencion", "calidad", "recepcion", "apps"],
  sistemas: ["dashboard", "sistemas", "usuarios", "archivo"],
};

/** ¿El rol puede acceder a este módulo? (misma regla UI + API) */
export function canAccessModule(
  role: string | Role,
  module: ModuleId,
): boolean {
  const key = String(role).toLowerCase() as Role;
  const views = ROLE_VIEWS[key];
  if (!views) return false;
  return views.includes(module);
}

export function modulesForRole(role: string | Role): ModuleId[] {
  const key = String(role).toLowerCase() as Role;
  return ROLE_VIEWS[key] ? [...ROLE_VIEWS[key]] : [];
}

export * from "./departments";

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
