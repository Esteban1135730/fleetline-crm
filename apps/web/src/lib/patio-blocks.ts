/** Motivos de bloqueo de talanquera / portería (códigos → español). */
export const PATIO_BLOCK_ES: Record<string, string> = {
  NO_ACTIVE_TRIP: "Sin viaje activo en ventana de despacho (±4 h)",
  LPR_NO_ACTIVE_TRIP: "Sin viaje activo en ventana de despacho (±4 h)",
  VEHICLE_DOCS_EXPIRED_JURIDICO:
    "Documentos jurídicos vencidos (SOAT / TO / pólizas)",
  VEHICLE_COMPLIANCE_BLOCKED: "Unidad con hard-stop documental",
  ALCOHOL_CHECK_MISSING_OR_FAILED: "Alcoholimetría ausente, vencida o fallida",
  DRIVER_FATIGUE: "Conductor en fatiga (bloqueo operativo)",
  DRIVER_DISPATCH_BLOCKED: "Conductor bloqueado para despacho",
  DRIVER_INACTIVE: "Conductor inactivo",
  VEHICLE_STATUS_MAINTENANCE: "Unidad en mantenimiento / taller",
  VEHICLE_STATUS_COMPLIANCE_BLOCKED: "Estado flota: compliance bloqueado",
  VEHICLE_STATUS_OUT_OF_SERVICE: "Unidad fuera de servicio",
  GATE_CHECKOUT_DENIED_COMPLIANCE_BLOCK: "Salida denegada por compliance",
  LPR_HARD_STOP: "Hard-stop de talanquera",
  ALREADY_IN_YARD: "La unidad ya está en patio",
  NOT_IN_YARD: "No hay ingreso abierto para esta placa",
  PLATE_NOT_IN_FLEET: "Placa no registrada en la flota",
  DOCUMENT_NOT_FOUND: "Documento no registrado (conductor ni visitante)",
  VISITOR_ARL_INVALID: "Visitante contratista sin ARL vigente",
  VISITOR_BADGE_MISSING: "Visitante sin escarapela / RFID",
  GATE_DECISION_DENIED: "Acceso denegado por reglas de portería",
};

export function patioBlockLabel(code: string) {
  return PATIO_BLOCK_ES[code] || code.replace(/_/g, " ");
}

/** Heurística: cédula = solo dígitos (mín. 5); resto = placa. */
export function classifyGateQuery(raw: string): {
  plate?: string;
  document?: string;
} {
  const t = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (!t) return {};
  const digits = t.replace(/\D/g, "");
  if (digits.length >= 5 && digits.length === t.replace(/[.\-]/g, "").length) {
    return { document: digits };
  }
  if (/^\d{5,}$/.test(t)) return { document: t };
  return { plate: t };
}
