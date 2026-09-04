/** Traducción operativa de códigos Hard-Stop / Kill-Switch. */

const LABEL_MAP: Record<string, string> = {
  VEHICLE_NOT_FOUND: "Vehículo no encontrado",
  DRIVER_NOT_FOUND: "Conductor no encontrado",
  VEHICLE_COMPLIANCE_BLOCKED: "Vehículo con compliance bloqueado",
  VEHICLE_OUT_OF_SERVICE: "Vehículo fuera de servicio",
  VEHICLE_MAINTENANCE: "Vehículo en taller / mantenimiento",
  VEHICLE_NIGHT_RESTRICTED: "Restricción nocturna de unidad",
  SOAT_EXPIRED: "SOAT vencido",
  SOAT_MISSING: "SOAT ausente",
  TECNOMECANICA_EXPIRED: "Tecnomecánica vencida",
  TECNOMECANICA_MISSING: "Tecnomecánica ausente",
  FUEC_EXPIRED: "FUEC vencido",
  FUEC_MISSING: "FUEC ausente",
  DRIVER_DISPATCH_BLOCKED: "Conductor bloqueado para despacho",
  DRIVER_INACTIVE: "Conductor inactivo",
  DRIVER_FATIGUE: "Fatiga PESV por encima del umbral",
  DRIVER_LICENSE_EXPIRED: "Licencia de conducción vencida",
  DRIVER_LICENSE_MISSING: "Licencia de conducción ausente",
  DRIVER_NIGHT_RESTRICTED: "Restricción nocturna de conductor",
  LICENCIA_CONDUCCION_EXPIRED: "Licencia de conducción vencida",
  HQSE_REEVALUATION_REQUIRED: "Reevaluación HQSE pendiente",
};

const DOC_HINT =
  /(SOAT|TECNOMECANICA|FUEC|LICENCIA|LICENSE|DOCUMENT|DOC_|EXPIRED|MISSING|VENCID)/i;

export function humanizeBlockReason(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "Motivo no especificado";

  const upper = trimmed.toUpperCase();
  if (LABEL_MAP[upper]) return LABEL_MAP[upper];

  // Kill-Switch: SOAT_EXPIRED, TECNOMECANICA_MISSING
  if (/^kill-switch:/i.test(trimmed)) {
    const codes = trimmed
      .replace(/^kill-switch:\s*/i, "")
      .split(/[,;]/)
      .map((c) => c.trim())
      .filter(Boolean);
    if (codes.length) {
      return `Kill-Switch · ${codes.map(humanizeBlockReason).join(" · ")}`;
    }
  }

  // Códigos compuestos con sufijo (RUNT) / nightly
  const bare = upper
    .replace(/\s*\(.*\)\s*$/, "")
    .replace(/\s+/g, "_")
    .replace(/[^A-Z0-9_]/g, "");
  if (LABEL_MAP[bare]) {
    const suffix = trimmed.match(/\(([^)]+)\)/)?.[1];
    return suffix
      ? `${LABEL_MAP[bare]} (${suffix})`
      : LABEL_MAP[bare];
  }

  return trimmed
    .replace(/_/g, " ")
    .replace(/\bsoat\b/gi, "SOAT")
    .replace(/\btecnomecanica\b/gi, "Tecnomecánica")
    .replace(/\bfuec\b/gi, "FUEC");
}

export function isDocumentBlockReason(raw: string): boolean {
  return DOC_HINT.test(raw);
}

export function collectDriverBlockReasons(input: {
  dispatchBlocked?: boolean;
  blockReason?: string | null;
  fatigueScore?: number;
  fatigueBlockScore?: number;
}): string[] {
  const reasons: string[] = [];
  const fatigueMax = input.fatigueBlockScore ?? 80;
  if (
    typeof input.fatigueScore === "number" &&
    input.fatigueScore >= fatigueMax
  ) {
    reasons.push("DRIVER_FATIGUE");
  }
  if (input.dispatchBlocked && input.blockReason) {
    // Puede venir como lista CSV
    for (const part of input.blockReason.split(/[,;]/)) {
      const t = part.trim();
      if (t && !reasons.includes(t)) reasons.push(t);
    }
  } else if (input.dispatchBlocked) {
    reasons.push("DRIVER_DISPATCH_BLOCKED");
  }
  return reasons;
}

export function summarizeBlockReasons(reasons: string[], max = 2): string {
  if (!reasons.length) return "Sin detalle de bloqueo";
  const labels = reasons.map(humanizeBlockReason);
  if (labels.length <= max) return labels.join(" · ");
  return `${labels.slice(0, max).join(" · ")} · +${labels.length - max} más`;
}
