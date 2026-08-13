import { z } from "zod";

export const FIELD_GEOFENCE_RADIUS_KM = 5;

export const RadarGeocercaQuerySchema = z.object({
  lat: z.coerce.number(),
  lng: z.coerce.number(),
  radiusKm: z.coerce.number().positive().max(25).optional().default(FIELD_GEOFENCE_RADIUS_KM),
  customerId: z.string().optional(),
  /** Persist session for coordinator */
  persist: z.coerce.boolean().optional().default(true),
});
export type RadarGeocercaQuery = z.infer<typeof RadarGeocercaQuerySchema>;

export const FallaSitioSchema = z.object({
  tripId: z.string().optional(),
  vehicleId: z.string().optional(),
  plate: z.string().optional(),
  notes: z.string().min(3),
  photoRef: z.string().optional(),
  requestReplacement: z.boolean().optional().default(true),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
});
export type FallaSitioDto = z.infer<typeof FallaSitioSchema>;

export const AbordajeManualSchema = z.object({
  tripId: z.string().min(1),
  passengerDocument: z.string().optional(),
  passengerName: z.string().optional(),
  passengerId: z.string().optional(),
  /** UUID generado en cliente (offline dedupe) */
  clientEventId: z.string().min(8),
  capturedAt: z.coerce.date().optional(),
  offline: z.boolean().optional().default(false),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
});
export type AbordajeManualDto = z.infer<typeof AbordajeManualSchema>;

export const SyncOfflineBoardingsSchema = z.object({
  events: z
    .array(
      z.object({
        tripId: z.string().min(1),
        clientEventId: z.string().min(8),
        passengerDocument: z.string().optional(),
        passengerName: z.string().optional(),
        passengerId: z.string().optional(),
        capturedAt: z.coerce.date(),
        lat: z.coerce.number().optional(),
        lng: z.coerce.number().optional(),
      }),
    )
    .min(1)
    .max(200),
});
export type SyncOfflineBoardingsDto = z.infer<typeof SyncOfflineBoardingsSchema>;

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

/** ETA minutos asumiendo velocidad promedio urbana km/h */
export function estimateEtaMinutes(
  distanceKm: number,
  speedKph?: number | null,
): number {
  const speed =
    speedKph != null && speedKph > 3 ? speedKph : 28;
  return Math.max(1, Math.round((distanceKm / speed) * 60));
}

export type ApproachPin =
  | "ON_TIME"
  | "DELAYED"
  | "STOPPED";

export function approachPinStatus(input: {
  speedKph?: number | null;
  etaMinutes: number;
  scheduledDepartAt?: Date | null;
  now?: Date;
}): ApproachPin {
  if (input.speedKph != null && input.speedKph < 2) return "STOPPED";
  const now = input.now || new Date();
  if (input.scheduledDepartAt) {
    const lateMs = now.getTime() - input.scheduledDepartAt.getTime();
    if (lateMs > 5 * 60 * 1000 && input.etaMinutes > 3) return "DELAYED";
  }
  if (input.etaMinutes > 12) return "DELAYED";
  return "ON_TIME";
}

/**
 * Merge offline queue → cloud results (pure, testable).
 * Already-synced clientEventIds are skipped; new ones marked SYNCED.
 */
export function mergeOfflineBoardingQueue(input: {
  pending: Array<{ clientEventId: string; tripId: string; capturedAt: Date }>;
  alreadySyncedIds: Set<string>;
}): {
  toInsert: Array<{ clientEventId: string; tripId: string; capturedAt: Date }>;
  skippedDuplicates: string[];
  syncedCount: number;
} {
  const toInsert: Array<{
    clientEventId: string;
    tripId: string;
    capturedAt: Date;
  }> = [];
  const skippedDuplicates: string[] = [];
  for (const ev of input.pending) {
    if (input.alreadySyncedIds.has(ev.clientEventId)) {
      skippedDuplicates.push(ev.clientEventId);
      continue;
    }
    toInsert.push(ev);
  }
  return {
    toInsert,
    skippedDuplicates,
    syncedCount: toInsert.length,
  };
}
