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

/**
 * Catálogo RRHH: Área (8 hubs) → Cargos (perfiles funcionales).
 * El formulario de alta usa Área arriba y Cargo abajo (dependiente).
 * El rol de acceso se deriva del cargo vía EMPLOYEE_CARGO_ROLE.
 */
export const EMPLOYEE_AREA_CATALOG: ReadonlyArray<{
  area: string;
  cargos: readonly string[];
}> = [
  {
    area: "Dirección",
    cargos: [
      "Presidente",
      "Gerente general",
      "Subgerente",
      "Administrador de empresa",
    ],
  },
  {
    area: "Soporte Corporativo",
    cargos: [
      "Recepcionista",
      "Líder de tecnología",
      "Gestor documental",
      "Gestor de vinculaciones",
    ],
  },
  {
    area: "Comercial",
    cargos: [
      "Director comercial",
      "Gestor comercial",
      "Coordinador comercial",
      "Ejecutivo de ventas",
    ],
  },
  {
    area: "Jurídico",
    cargos: ["Jurídico", "Director jurídico"],
  },
  {
    area: "Finanzas",
    cargos: [
      "Auxiliar contable",
      "Gestor contable",
      "Tesorero",
      "Director financiero",
    ],
  },
  {
    area: "Riesgos y Control",
    cargos: [
      "Líder de calidad y SST",
      "Auditor control interno",
      "Revisor fiscal",
    ],
  },
  {
    area: "Operaciones y Flota",
    cargos: [
      "Director operativo",
      "Gestor operativo",
      "Coordinador de campo",
      "Operador centro de control",
      "Conductor",
      "Monitora escolar",
    ],
  },
  {
    area: "Compras, Mantenimiento y Patio",
    cargos: [
      "Líder de compras",
      "Coordinador de taller",
      "Auxiliar de almacén",
      "Mecánico",
      "Coordinador de patio",
      "Auxiliar de patio",
    ],
  },
];

/** Valores del desplegable Área (8 hubs) */
export const EMPLOYEE_AREAS = EMPLOYEE_AREA_CATALOG.map(
  (entry) => entry.area,
) as unknown as readonly [
  "Dirección",
  "Soporte Corporativo",
  "Comercial",
  "Jurídico",
  "Finanzas",
  "Riesgos y Control",
  "Operaciones y Flota",
  "Compras, Mantenimiento y Patio",
];

export type EmployeeArea = (typeof EMPLOYEE_AREAS)[number];

/** Todos los cargos tipificados (derivado del catálogo) */
export const EMPLOYEE_TITLES = [
  ...EMPLOYEE_AREA_CATALOG.flatMap((entry) => entry.cargos),
  "Aprendiz SENA",
  "Auxiliar administrativo",
  "Otro",
] as const;

export type EmployeeTitle = (typeof EMPLOYEE_TITLES)[number];

/**
 * Áreas legadas — expedientes indexados antes de los 8 hubs.
 * Se muestran como "(legado)" al editar; no aparecen en el alta nueva.
 */
export const LEGACY_EMPLOYEE_AREAS = [
  "Alta dirección",
  "Soporte corporativo",
  "Calidad & Abastecimiento",
  "Operaciones",
  "Comercial y jurídico",
  "Mantenimiento y patio",
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
  "Centro de llamadas",
  "HSQE / Calidad",
  "Recursos Humanos",
  "Parqueadero",
] as const;

/** @deprecated Usar EMPLOYEE_AREA_CATALOG — conservado para expedientes legados */
export const EMPLOYEE_AREA_GROUPS: ReadonlyArray<{
  label: string;
  areas: readonly string[];
}> = [
  {
    label: "Legado (expedientes previos)",
    areas: [...LEGACY_EMPLOYEE_AREAS],
  },
];

export function cargosForEmployeeArea(area: string): readonly string[] {
  return (
    EMPLOYEE_AREA_CATALOG.find((entry) => entry.area === area)?.cargos ?? []
  );
}

export function employeeAreaForCargo(cargo: string): string | undefined {
  for (const entry of EMPLOYEE_AREA_CATALOG) {
    if (entry.cargos.includes(cargo)) return entry.area;
  }
  return undefined;
}

export function isKnownEmployeeArea(area: string): boolean {
  return EMPLOYEE_AREA_CATALOG.some((entry) => entry.area === area);
}

/**
 * Mapa cargo laboral → rol de acceso Fleetline.
 * El alta RRHH deriva el rol del cargo (sin select aparte).
 * Incluye alias de cargos legados para no romper expedientes existentes.
 */
export const EMPLOYEE_CARGO_ROLE: Readonly<Record<string, string>> = {
  Presidente: "presidente",
  "Gerente general": "gerente_general",
  Subgerente: "sub_gerente",
  "Administrador de empresa": "org_admin",
  Recepcionista: "recepcionista",
  "Líder de tecnología": "lider_ti",
  "Gestor documental": "gestor_documental",
  "Gestor de vinculaciones": "gestor_vinculaciones",
  /** Legado RRHH */
  "Director de recursos humanos": "gestor_vinculaciones",
  "Analista de vinculaciones": "gestor_vinculaciones",
  "Gestor de trámites": "juridico",
  "Auxiliar contable": "auxiliar_contable",
  "Gestor contable": "gestor_contable",
  Tesorero: "tesoreria",
  "Director financiero": "director_financiero",
  "Líder de calidad y SST": "lider_qhse",
  "Líder de compras": "lider_compras",
  "Director operativo": "director_operativo",
  "Gestor operativo": "gestor_operativo",
  "Coordinador de campo": "coordinador_campo",
  "Operador centro de control": "operador_centro_control",
  "Auditor control interno": "auditor_control_interno",
  Conductor: "conductor",
  "Monitora escolar": "monitora",
  "Director comercial": "director_comercial",
  "Gestor comercial": "gestor_comercial",
  "Ejecutivo de ventas": "gestor_comercial",
  "Coordinador comercial": "coordinador_comercial",
  Jurídico: "juridico",
  "Director jurídico": "director_juridico",
  "Revisor fiscal": "revisor_fiscal",
  "Coordinador de taller": "coordinador_taller",
  Mecánico: "mecanico",
  "Auxiliar de almacén": "auxiliar_almacen_taller",
  "Coordinador de patio": "coordinador_patio",
  "Auxiliar de patio": "auxiliar_patio",
  "Aprendiz SENA": "auxiliar_contable",
  "Auxiliar administrativo": "recepcionista",
  Otro: "gestor_operativo",
};

export function roleForEmployeeCargo(cargo: string): string {
  return EMPLOYEE_CARGO_ROLE[cargo] ?? "gestor_operativo";
}

export function departmentForModule(module: ModuleId): Department | undefined {
  return DEPARTMENTS.find((d) => d.modules.includes(module));
}
