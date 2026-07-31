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
    label: "Call Center",
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

/** Áreas de empleado alineadas al Excel */
export const EMPLOYEE_AREAS = [
  "Operaciones",
  "Call Center",
  "Archivo",
  "Tesorería",
  "Contabilidad",
  "HSQE / Calidad",
  "Jurídico",
  "Compras",
  "Recursos Humanos",
  "Comercial",
  "Trámites",
  "Parqueadero",
  "Taller",
  "Gerencia",
] as const;

export type EmployeeArea = (typeof EMPLOYEE_AREAS)[number];

export function departmentForModule(module: ModuleId): Department | undefined {
  return DEPARTMENTS.find((d) => d.modules.includes(module));
}
