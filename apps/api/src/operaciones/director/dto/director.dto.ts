import { z } from "zod";

export const OverrideReasignarSchema = z.object({
  tripId: z.string().min(1),
  newVehicleId: z.string().min(1).optional(),
  newDriverId: z.string().min(1).optional(),
  /** Radio GPS (km) para pool de contingencia */
  radiusKm: z.coerce.number().positive().max(100).optional().default(15),
  reason: z.string().min(3),
  notifyDrivers: z.boolean().optional().default(true),
  notifyCustomers: z.boolean().optional().default(true),
  /** Bypass hard-stops menores (director override) */
  forceOverride: z.boolean().optional().default(true),
});
export type OverrideReasignarDto = z.input<typeof OverrideReasignarSchema>;

export const CapacityPlanningQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  demandPeakFactor: z.coerce.number().positive().max(3).optional().default(1.2),
});
export type CapacityPlanningQuery = z.input<typeof CapacityPlanningQuerySchema>;

export const AprobarParadaFlotaSchema = z.object({
  /** Si no hay fleetStopId, se crea desde solicitud taller */
  fleetStopId: z.string().optional(),
  vehicleId: z.string().min(1).optional(),
  workOrderId: z.string().optional(),
  kind: z
    .enum([
      "PREVENTIVE_MAINTENANCE",
      "CORRECTIVE",
      "YARD_IMMOBILIZATION",
      "COMPLIANCE",
    ])
    .optional()
    .default("PREVENTIVE_MAINTENANCE"),
  reason: z.string().min(3).optional(),
  windowStart: z.coerce.date().optional(),
  windowEnd: z.coerce.date().optional(),
  approve: z.boolean().optional().default(true),
  preferLowDemandWindow: z.boolean().optional().default(true),
});
export type AprobarParadaFlotaDto = z.input<typeof AprobarParadaFlotaSchema>;

/** Haversine distance km between two GPS points */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Number((2 * R * Math.asin(Math.sqrt(a))).toFixed(3));
}

export type FleetStopBlock = {
  vehicleId: string;
  status: string;
  blocksGantt: boolean;
  windowStart: Date;
  windowEnd: Date;
};

/**
 * Bloqueo Gantt: vehículo con parada APPROVED/ACTIVE no puede programarse
 * en el intervalo [departAt, arriveAt].
 */
export function isGanttBlockedByFleetStop(
  vehicleId: string,
  departAt: Date,
  arriveAt: Date | null | undefined,
  stops: FleetStopBlock[],
): { blocked: boolean; stop?: FleetStopBlock; reason?: string } {
  const end = arriveAt || new Date(departAt.getTime() + 2 * 60 * 60 * 1000);
  const active = stops.filter(
    (s) =>
      s.vehicleId === vehicleId &&
      s.blocksGantt &&
      (s.status === "APPROVED" || s.status === "ACTIVE") &&
      s.windowStart < end &&
      s.windowEnd > departAt,
  );
  if (!active.length) return { blocked: false };
  return {
    blocked: true,
    stop: active[0],
    reason: `Parada de flota aprobada bloquea Gantt (${active[0].windowStart.toISOString()} → ${active[0].windowEnd.toISOString()})`,
  };
}
