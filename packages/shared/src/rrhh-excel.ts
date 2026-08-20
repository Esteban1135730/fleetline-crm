/** Columnas Excel RRHH — checklist export / plantilla import */

export type RrhhExcelColumnKey =
  | "document"
  | "name"
  | "area"
  | "title"
  | "status"
  | "email"
  | "phone"
  | "city"
  | "address"
  | "contractType"
  | "hireDate"
  | "baseSalary"
  | "hourlyRate"
  | "eps"
  | "arl"
  | "pensionFund"
  | "compensationFund"
  | "bankName"
  | "bankAccountType"
  | "bankAccountNumber"
  | "emergencyContactName"
  | "emergencyContactPhone"
  | "emergencyContactRelation"
  | "userEmail"
  | "userRole"
  | "userActive"
  | "fatigueScore"
  | "fatigueSemaphore"
  | "licenseSemaphore"
  | "licenseNumber"
  | "licenseCategory"
  | "licenseExpiresAt"
  | "dispatchBlocked"
  | "blockReason"
  | "terminatedAt"
  | "terminationReason";

export type RrhhExcelColumnGroup =
  | "identidad"
  | "contrato"
  | "seguridad_social"
  | "bancario"
  | "emergencia"
  | "acceso"
  | "operacion"
  | "retiro";

export type RrhhExcelColumnDef = {
  key: RrhhExcelColumnKey;
  label: string;
  group: RrhhExcelColumnGroup;
  width: number;
  /** Incluible en plantilla / importación masiva */
  importable: boolean;
  /** Obligatorio al crear filas nuevas por import */
  requiredOnImport?: boolean;
  /** Solo lectura (no se escribe en import) */
  exportOnly?: boolean;
};

export const RRHH_EXCEL_GROUP_LABELS: Record<RrhhExcelColumnGroup, string> = {
  identidad: "Identidad y contacto",
  contrato: "Contrato y compensación",
  seguridad_social: "Seguridad social",
  bancario: "Datos bancarios",
  emergencia: "Contacto de emergencia",
  acceso: "Acceso al sistema",
  operacion: "Operación / fatiga / licencia",
  retiro: "Retiro",
};

export const RRHH_EXCEL_COLUMNS: readonly RrhhExcelColumnDef[] = [
  { key: "document", label: "Documento", group: "identidad", width: 16, importable: true, requiredOnImport: true },
  { key: "name", label: "Nombre", group: "identidad", width: 28, importable: true, requiredOnImport: true },
  { key: "area", label: "Área", group: "identidad", width: 18, importable: true, requiredOnImport: true },
  { key: "title", label: "Cargo", group: "identidad", width: 22, importable: true, requiredOnImport: true },
  { key: "status", label: "Estado", group: "identidad", width: 12, importable: true },
  { key: "email", label: "Correo laboral", group: "identidad", width: 28, importable: true, requiredOnImport: true },
  { key: "phone", label: "Teléfono", group: "identidad", width: 16, importable: true },
  { key: "city", label: "Ciudad", group: "identidad", width: 14, importable: true },
  { key: "address", label: "Dirección", group: "identidad", width: 28, importable: true },
  { key: "contractType", label: "Tipo contrato", group: "contrato", width: 16, importable: true },
  { key: "hireDate", label: "Fecha ingreso", group: "contrato", width: 14, importable: true },
  { key: "baseSalary", label: "Salario base", group: "contrato", width: 14, importable: true },
  { key: "hourlyRate", label: "Tarifa hora", group: "contrato", width: 12, importable: true },
  { key: "eps", label: "EPS", group: "seguridad_social", width: 16, importable: true },
  { key: "arl", label: "ARL", group: "seguridad_social", width: 16, importable: true },
  { key: "pensionFund", label: "Pensión", group: "seguridad_social", width: 16, importable: true },
  { key: "compensationFund", label: "Caja compensación", group: "seguridad_social", width: 18, importable: true },
  { key: "bankName", label: "Banco", group: "bancario", width: 16, importable: true },
  { key: "bankAccountType", label: "Tipo cuenta", group: "bancario", width: 12, importable: true },
  { key: "bankAccountNumber", label: "N° cuenta", group: "bancario", width: 18, importable: true },
  { key: "emergencyContactName", label: "Contacto emergencia", group: "emergencia", width: 22, importable: true },
  { key: "emergencyContactPhone", label: "Tel. emergencia", group: "emergencia", width: 16, importable: true },
  { key: "emergencyContactRelation", label: "Parentesco", group: "emergencia", width: 14, importable: true },
  { key: "userEmail", label: "Usuario sistema", group: "acceso", width: 28, importable: false, exportOnly: true },
  { key: "userRole", label: "Rol acceso", group: "acceso", width: 16, importable: false, exportOnly: true },
  { key: "userActive", label: "Acceso activo", group: "acceso", width: 12, importable: false, exportOnly: true },
  { key: "fatigueScore", label: "Fatiga", group: "operacion", width: 10, importable: false, exportOnly: true },
  { key: "fatigueSemaphore", label: "Semáforo fatiga", group: "operacion", width: 14, importable: false, exportOnly: true },
  { key: "licenseSemaphore", label: "Semáforo licencia", group: "operacion", width: 14, importable: false, exportOnly: true },
  { key: "licenseNumber", label: "Licencia N°", group: "operacion", width: 14, importable: false, exportOnly: true },
  { key: "licenseCategory", label: "Categoría licencia", group: "operacion", width: 14, importable: false, exportOnly: true },
  { key: "licenseExpiresAt", label: "Vence licencia", group: "operacion", width: 14, importable: false, exportOnly: true },
  { key: "dispatchBlocked", label: "Bloqueo despacho", group: "operacion", width: 14, importable: false, exportOnly: true },
  { key: "blockReason", label: "Motivo bloqueo", group: "operacion", width: 28, importable: false, exportOnly: true },
  { key: "terminatedAt", label: "Fecha retiro", group: "retiro", width: 14, importable: false, exportOnly: true },
  { key: "terminationReason", label: "Motivo retiro", group: "retiro", width: 24, importable: false, exportOnly: true },
] as const;

export const RRHH_EXCEL_COLUMN_BY_KEY = Object.fromEntries(
  RRHH_EXCEL_COLUMNS.map((c) => [c.key, c]),
) as Record<RrhhExcelColumnKey, RrhhExcelColumnDef>;

export const RRHH_EXCEL_LABEL_TO_KEY = Object.fromEntries(
  RRHH_EXCEL_COLUMNS.map((c) => [c.label.toLowerCase().trim(), c.key]),
) as Record<string, RrhhExcelColumnKey>;

/** Columnas por defecto al abrir el checklist de exportación */
export const RRHH_EXCEL_DEFAULT_EXPORT_KEYS: RrhhExcelColumnKey[] =
  RRHH_EXCEL_COLUMNS.filter((c) => c.importable || c.key === "status").map(
    (c) => c.key,
  );

/** Columnas de plantilla de importación */
export const RRHH_EXCEL_IMPORT_KEYS: RrhhExcelColumnKey[] =
  RRHH_EXCEL_COLUMNS.filter((c) => c.importable).map((c) => c.key);

export function resolveRrhhExcelColumns(
  keys?: string[] | null,
): RrhhExcelColumnDef[] {
  if (!keys?.length) return [...RRHH_EXCEL_COLUMNS];
  const seen = new Set<string>();
  const out: RrhhExcelColumnDef[] = [];
  for (const raw of keys) {
    const key = String(raw || "").trim() as RrhhExcelColumnKey;
    if (!key || seen.has(key)) continue;
    const def = RRHH_EXCEL_COLUMN_BY_KEY[key];
    if (!def) continue;
    seen.add(key);
    out.push(def);
  }
  return out.length ? out : [...RRHH_EXCEL_COLUMNS];
}
