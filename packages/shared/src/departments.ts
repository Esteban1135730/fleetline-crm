import type { ModuleId } from "./index";

/** Áreas operativas según organigrama Excel FSG */
export type DepartmentId =
  | "call_center"
  | "archivo"
  | "tesoreria"
  | "hsqe"
  | "juridico"
  | "compras"
  | "rrhh"
  | "operaciones"
  | "comercial"
  | "tramites"
  | "parqueadero"
  | "taller"
  | "gerencia";

export type Department = {
  id: DepartmentId;
  label: string;
  /** Sub-áreas del Excel (papelería, nómina, mecánicos, etc.) */
  subAreas: string[];
  modules: ModuleId[];
};

export const DEPARTMENTS: Department[] = [
  {
    id: "gerencia",
    label: "Gerencia / Presidencia",
    subAreas: ["Director", "Contador", "Revisoría fiscal", "Asistente gerencia"],
    modules: ["dashboard", "apps", "usuarios"],
  },
  {
    id: "comercial",
    label: "Comercial",
    subAreas: [
      "Empresas privadas",
      "Licitaciones entidades públicas",
      "Cotizaciones",
      "Contratos",
    ],
    modules: ["comercial"],
  },
  {
    id: "operaciones",
    label: "Operaciones / Centro de control",
    subAreas: [
      "Despacho",
      "Operativos por contrato",
      "GPS y novedades",
      "Coordinación rutas",
    ],
    modules: ["logistica"],
  },
  {
    id: "parqueadero",
    label: "Parqueadero",
    subAreas: ["Verificación ingreso/salida", "Control de placas", "Guardas"],
    modules: ["parqueadero"],
  },
  {
    id: "taller",
    label: "Taller",
    subAreas: ["Mecánicos", "Órdenes de trabajo", "Repuestos"],
    modules: ["taller"],
  },
  {
    id: "tramites",
    label: "Trámites / Carros",
    subAreas: [
      "SOAT",
      "Tecnomecánica",
      "Tarjeta de operación",
      "Licencia de tránsito",
    ],
    modules: ["tramites", "juridico"],
  },
  {
    id: "compras",
    label: "Compras",
    subAreas: ["Solicitudes", "Proveedores", "Aprobaciones"],
    modules: ["compras"],
  },
  {
    id: "tesoreria",
    label: "Tesorería (pagos)",
    subAreas: [
      "Cuentas por cobrar",
      "Cuentas por pagar",
      "Auxiliar contable",
      "Gestora contable",
    ],
    modules: ["tesoreria", "contabilidad"],
  },
  {
    id: "rrhh",
    label: "Recursos humanos",
    subAreas: ["Personal", "Nómina", "Aprendiz SENA", "Selección"],
    modules: ["rrhh"],
  },
  {
    id: "call_center",
    label: "Centro de llamadas",
    subAreas: ["Tickets", "WhatsApp", "Correo", "Teléfono"],
    modules: ["call_center"],
  },
  {
    id: "hsqe",
    label: "HSQE / Calidad",
    subAreas: ["NPS", "Incidentes", "SARLAFT", "Auditorías"],
    modules: ["qhse", "sarlaft"],
  },
  {
    id: "juridico",
    label: "Jurídico",
    subAreas: ["FUEC", "Contratos legales", "Pólizas"],
    modules: ["juridico"],
  },
  {
    id: "archivo",
    label: "Archivo",
    subAreas: ["Papelería", "Contratos", "Documentos históricos"],
    modules: ["archivo", "call_center"],
  },
];

/** Áreas de empleado — alineadas a módulos Fleetline / organigrama operativo */
export const EMPLOYEE_AREAS = [
  "Presidencia",
  "Gerencia",
  "Subgerencia",
  "Recepción / Centro de llamadas",
  "Tecnología / TI",
  "Archivo",
  "Contabilidad",
  "Tesorería",
  "Dirección Financiera",
  "QHSE / PESV",
  "Compras",
  "Dirección Operativa",
  "Despacho / Logística",
  "Coordinación de Campo",
  "Centro de Control",
  "Control Interno",
  "Vinculaciones / RRHH",
  "Comercial",
  "Jurídico",
  "Revisoría Fiscal",
  "Taller",
  "Almacén Taller",
  "Parqueadero / Patio",
  "Conductores / Flota",
  "Trámites",
  // Legado (expedientes históricos)
  "Operaciones",
  "Centro de llamadas",
  "HSQE / Calidad",
  "Recursos Humanos",
  "Parqueadero",
] as const;

export type EmployeeArea = (typeof EMPLOYEE_AREAS)[number];

/** Cargos tipificados para alta de expediente (campo Cargo) */
export const EMPLOYEE_TITLES = [
  "Recepcionista",
  "Líder TI",
  "Gestor documental",
  "Auxiliar contable",
  "Gestor contable",
  "Tesorero",
  "Director financiero",
  "Líder de calidad y SST",
  "Líder Compras",
  "Director operativo",
  "Gestor operativo / Despacho",
  "Coordinador de campo",
  "Operador centro de control",
  "Auditor control interno",
  "Presidente",
  "Gestor vinculaciones",
  "Director de recursos humanos",
  "Director comercial",
  "Gestor comercial",
  "Ejecutivo de ventas",
  "Coordinador comercial",
  "Gerente general",
  "Subgerente",
  "Director jurídico",
  "Revisor fiscal",
  "Coordinador taller",
  "Auxiliar almacén taller",
  "Mecánico",
  "Coordinador patio",
  "Auxiliar patio",
  "Conductor",
  "Monitora escolar",
  "Analista",
  "Auxiliar administrativo",
  "Aprendiz SENA",
  "Otro",
] as const;

export type EmployeeTitle = (typeof EMPLOYEE_TITLES)[number];

/** Grupos UI del desplegable de área */
export const EMPLOYEE_AREA_GROUPS: ReadonlyArray<{
  label: string;
  areas: readonly EmployeeArea[];
}> = [
  {
    label: "Gobierno",
    areas: ["Presidencia", "Gerencia", "Subgerencia"],
  },
  {
    label: "Soporte corporativo",
    areas: [
      "Recepción / Centro de llamadas",
      "Tecnología / TI",
      "Archivo",
      "Vinculaciones / RRHH",
      "Trámites",
    ],
  },
  {
    label: "Finanzas",
    areas: ["Contabilidad", "Tesorería", "Dirección Financiera"],
  },
  {
    label: "Calidad & Abastecimiento",
    areas: ["QHSE / PESV", "Compras"],
  },
  {
    label: "Operaciones",
    areas: [
      "Dirección Operativa",
      "Despacho / Logística",
      "Coordinación de Campo",
      "Centro de Control",
      "Control Interno",
      "Conductores / Flota",
    ],
  },
  {
    label: "Comercial y jurídico",
    areas: ["Comercial", "Jurídico", "Revisoría Fiscal"],
  },
  {
    label: "Mantenimiento y patio",
    areas: ["Taller", "Almacén Taller", "Parqueadero / Patio"],
  },
  {
    label: "Legado (expedientes previos)",
    areas: [
      "Operaciones",
      "Centro de llamadas",
      "HSQE / Calidad",
      "Recursos Humanos",
      "Parqueadero",
    ],
  },
];

export function departmentForModule(module: ModuleId): Department | undefined {
  return DEPARTMENTS.find((d) => d.modules.includes(module));
}
