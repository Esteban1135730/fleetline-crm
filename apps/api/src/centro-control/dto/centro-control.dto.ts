import { z } from "zod";
import { HARD_RULES } from "@fsg/shared";

export const TipificarDesvioSchema = z.object({
  tripId: z.string().optional(),
  vehicleId: z.string().optional(),
  plate: z.string().optional(),
  driverId: z.string().optional(),
  tipificacion: z.enum([
    "DESVIO_TUBO",
    "PARADA_NO_AUTORIZADA",
    "RUTA_ALTERADA",
    "PERDIDA_SENAL",
    "OTRO",
  ]),
  notes: z.string().min(3).optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  initiateVoip: z.boolean().optional().default(true),
  sendSmsToCustomer: z.boolean().optional().default(true),
});
export type TipificarDesvioDto = z.infer<typeof TipificarDesvioSchema>;

export const ActivarSosSchema = z.object({
  tripId: z.string().optional(),
  vehicleId: z.string().optional(),
  plate: z.string().optional(),
  driverId: z.string().optional(),
  notes: z.string().optional(),
  contactPolice: z.boolean().optional().default(true),
  notifyDirector: z.boolean().optional().default(true),
  authorizeEngineShutdown: z.boolean().optional().default(false),
  enableAmbientListen: z.boolean().optional().default(true),
  enableCabinStream: z.boolean().optional().default(true),
});
export type ActivarSosDto = z.infer<typeof ActivarSosSchema>;

export const ApagadoRemotoSchema = z.object({
  sosSessionId: z.string().min(1),
  vehicleId: z.string().optional(),
  plate: z.string().optional(),
  /** Confirmación explícita del protocolo de emergencia */
  confirmProtocol: z.literal(true),
  reason: z.string().min(3).optional(),
});
export type ApagadoRemotoDto = z.infer<typeof ApagadoRemotoSchema>;

export const FatigaIntervencionSchema = z.object({
  driverId: z.string().min(1),
  vehicleId: z.string().optional(),
  plate: z.string().optional(),
  tripId: z.string().optional(),
  fatigueScore: z.coerce.number().int().min(0).max(100),
  /** Si el conductor ignoró la instrucción de parada */
  ignoredStop: z.boolean().optional().default(false),
  distanceKmToStop: z.coerce.number().optional(),
});
export type FatigaIntervencionDto = z.infer<typeof FatigaIntervencionSchema>;

export function isFatigueYellowZone(score: number): boolean {
  return (
    score >= HARD_RULES.FATIGUE_YELLOW_MIN &&
    score <= HARD_RULES.FATIGUE_YELLOW_MAX
  );
}

/**
 * Pure gate: IoT ENGINE_SHUTDOWN only when SOS is ACTIVE and protocol confirmed.
 */
export function canTransmitEngineShutdown(input: {
  sosStatus: string;
  engineShutdownAuthorized: boolean;
  confirmProtocol: boolean;
}): { ok: true } | { ok: false; reason: string } {
  if (input.sosStatus !== "ACTIVE") {
    return { ok: false, reason: "Sesión SOS no activa — DEFCON requerido" };
  }
  if (!input.engineShutdownAuthorized) {
    return {
      ok: false,
      reason: "Apagado remoto no autorizado en checklist SOS",
    };
  }
  if (!input.confirmProtocol) {
    return {
      ok: false,
      reason: "Confirmación explícita del protocolo de emergencia requerida",
    };
  }
  return { ok: true };
}
