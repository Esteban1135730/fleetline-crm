import { HARD_RULES } from "@fsg/shared";
import { z } from "zod";

export const AsignarViajeSchema = z.object({
  tripId: z.string().min(1),
  driverId: z.string().min(1),
  vehicleId: z.string().min(1),
  /** Publicar itinerario + pasajeros + mapa a App conductor */
  publishToApp: z.boolean().optional().default(true),
  passengerList: z.array(z.string()).optional(),
  mapPolyline: z.string().optional(),
});
export type AsignarViajeDto = z.input<typeof AsignarViajeSchema>;

export const BuscarRelevoFlashSchema = z.object({
  tripId: z.string().min(1),
  /** Radio GPS km para retén */
  radiusKm: z.coerce.number().positive().max(50).optional().default(12),
  /** Si true, reasigna al mejor candidato en 1 clic */
  assignBest: z.boolean().optional().default(false),
  substituteDriverId: z.string().optional(),
});
export type BuscarRelevoFlashDto = z.input<typeof BuscarRelevoFlashSchema>;

export type RestHoursInput = {
  lastDutyEndedAt: Date | null;
  departAt: Date;
  minRestHours?: number;
};

/**
 * Hard-Stop PESV: rebote si no hay 8h de descanso legal entre fin de turno y salida.
 */
export function evaluateLegalRestHours(input: RestHoursInput): {
  ok: boolean;
  restHours: number | null;
  required: number;
  code?: string;
  message?: string;
} {
  const required =
    input.minRestHours ?? HARD_RULES.MIN_LEGAL_REST_HOURS;
  if (!input.lastDutyEndedAt) {
    return { ok: true, restHours: null, required };
  }
  const ms = input.departAt.getTime() - input.lastDutyEndedAt.getTime();
  const restHours = Number((ms / (1000 * 60 * 60)).toFixed(2));
  if (restHours < required) {
    return {
      ok: false,
      restHours,
      required,
      code: "DRIVER_LEGAL_REST_VIOLATION",
      message: `Hard-Stop PESV: descanso ${restHours}h < ${required}h reglamentarias`,
    };
  }
  return { ok: true, restHours, required };
}

export function evaluateDispatchFatigue(
  fatigueScore: number,
  maxScore = HARD_RULES.DISPATCH_FATIGUE_MAX,
): { ok: boolean; code?: string; message?: string } {
  if (fatigueScore >= maxScore) {
    return {
      ok: false,
      code: "DRIVER_FATIGUE_DISPATCH",
      message: `Hard-Stop fatiga: score ${fatigueScore} ≥ ${maxScore} (Micro-Dispatch)`,
    };
  }
  return { ok: true };
}

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
