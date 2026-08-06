/**
 * Catálogo de eventos Kafka / EventEmitter — orquestación INRETRANS OS.
 * Hard-Stops detienen el flujo; los eventos notifican a módulos downstream.
 */
export const INRETRANS_EVENT_CATALOG = {
  /** Despacho / asignación de servicio */
  TRIP_DISPATCHED: "trip.dispatched",
  TRIP_COMPLETED: "trip.completed",
  TRIP_REASSIGNED: "trip.reassigned",
  /** Compliance / unidad bloqueada (docs, SARLAFT operativo) */
  COMPLIANCE_VEHICLE_BLOCKED: "compliance.vehicle.blocked",
  /** Comercial → ingresos */
  COMMERCIAL_REVENUE: "commercial.revenue.generated",
  /** Compras / match */
  PURCHASE_MATCH_APPROVED: "purchase.match.approved",
  PURCHASE_MATCH_REJECTED: "purchase.match.rejected",
  /** Tesorería */
  PAYMENT_DISBURSED: "payment.disbursed",
  /** Inventario / taller */
  PART_DISPATCHED: "part.dispatched",
  /** RRHH pre-nómina / extras */
  PAYROLL_CALCULATED: "payroll.calculated",
  /** Archivo / RUNT */
  DOCUMENT_PROCESSED: "document.processed",
} as const;

export type InretransEventTopic =
  (typeof INRETRANS_EVENT_CATALOG)[keyof typeof INRETRANS_EVENT_CATALOG];

/** Mapa Hard-Stop por módulo de arquitectura */
export const HARD_STOP_MODULES = {
  M03_COMERCIAL: "CONTRACT_QUOTA_OR_VALIDITY_BLOCKED",
  M04_LOGISTICA: "COMPLIANCE_GATE_BLOCKED",
  M05_PATIO_LPR: "LPR_GATE_BLOCKED",
  M07_TALLER: "VEHICLE_MAINTENANCE",
  M12_RRHH_FATIGA: "DRIVER_FATIGUE",
  M15_SARLAFT: "SARLAFT_RESTRICTIVE_LIST",
} as const;
