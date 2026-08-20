/** Checklist documental RRHH por tipo de cargo */

export type HrDocArchiveType = "LICENCIA" | "CONTRACT" | "OTHER";

export type HrDocSlot = {
  /** Tag estable para emparejar uploads */
  key: string;
  label: string;
  description: string;
  required: boolean;
  docType: HrDocArchiveType;
};

const OFFICE_DOCS: readonly HrDocSlot[] = [
  {
    key: "CEDULA",
    label: "Cédula de ciudadanía",
    description: "Documento de identidad (ambas caras o PDF)",
    required: true,
    docType: "OTHER",
  },
  {
    key: "CONTRATO",
    label: "Contrato laboral",
    description: "Contrato firmado vigente",
    required: true,
    docType: "CONTRACT",
  },
  {
    key: "HOJA_VIDA",
    label: "Hoja de vida",
    description: "HV actualizada",
    required: false,
    docType: "OTHER",
  },
  {
    key: "AFILIACIONES",
    label: "Afiliaciones (EPS / ARL / pensión)",
    description: "Soportes de afiliación a seguridad social",
    required: false,
    docType: "OTHER",
  },
  {
    key: "OTRO_HR",
    label: "Otro documento",
    description: "Cualquier soporte adicional del expediente",
    required: false,
    docType: "OTHER",
  },
];

const DRIVER_DOCS: readonly HrDocSlot[] = [
  {
    key: "CEDULA",
    label: "Cédula de ciudadanía",
    description: "Documento de identidad",
    required: true,
    docType: "OTHER",
  },
  {
    key: "LICENCIA",
    label: "Licencia de conducción",
    description: "Licencia vigente (categoría y vencimiento)",
    required: true,
    docType: "LICENCIA",
  },
  {
    key: "CONTRATO",
    label: "Contrato / vinculación",
    description: "Contrato laboral o documento de vinculación",
    required: true,
    docType: "CONTRACT",
  },
  {
    key: "EXAMEN_MEDICO",
    label: "Examen médico / aptitud",
    description: "Certificado de aptitud médica laboral",
    required: true,
    docType: "OTHER",
  },
  {
    key: "CURSO_PESV",
    label: "Curso / capacitación PESV",
    description: "Evidencia de capacitación en seguridad vial",
    required: false,
    docType: "OTHER",
  },
  {
    key: "AFILIACIONES",
    label: "Afiliaciones (EPS / ARL / pensión)",
    description: "Soportes de seguridad social",
    required: false,
    docType: "OTHER",
  },
  {
    key: "HOJA_VIDA",
    label: "Hoja de vida",
    description: "HV del conductor",
    required: false,
    docType: "OTHER",
  },
  {
    key: "OTRO_HR",
    label: "Otro documento",
    description: "Soporte adicional del expediente",
    required: false,
    docType: "OTHER",
  },
];

function fold(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** True si el cargo requiere carpeta de conductor / flota */
export function isDriverHrCargo(title: string, area?: string | null): boolean {
  const t = fold(title || "");
  const a = fold(area || "");
  return (
    t.includes("conductor") ||
    t.includes("monitora") ||
    a.includes("conductor") ||
    a.includes("flota")
  );
}

export function hrDocumentChecklistForCargo(
  title: string,
  area?: string | null,
): readonly HrDocSlot[] {
  return isDriverHrCargo(title, area) ? DRIVER_DOCS : OFFICE_DOCS;
}

export function hrDocProfileLabel(title: string, area?: string | null): string {
  return isDriverHrCargo(title, area)
    ? "Expediente conductor / flota"
    : "Expediente administrativo";
}
