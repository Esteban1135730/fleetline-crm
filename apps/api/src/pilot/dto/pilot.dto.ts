import { z } from "zod";

export const PreoperacionalSchema = z.object({
  tripId: z.string().min(1),
  brakesOk: z.boolean(),
  lightsOk: z.boolean(),
  tiresOk: z.boolean(),
  kitOk: z.boolean(),
  oilOk: z.boolean(),
  observations: z.string().max(2000).optional(),
  photoRefs: z.array(z.string()).min(1, "Preoperacional fotográfico obligatorio"),
});
export type PreoperacionalDto = z.infer<typeof PreoperacionalSchema>;

export const SosSchema = z.object({
  category: z.enum(["CHOQUE", "FALLA_MECANICA", "ORDEN_PUBLICO"]),
  tripId: z.string().optional(),
  vehicleId: z.string().optional(),
  plate: z.string().optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  speedKph: z.coerce.number().optional(),
});
export type SosDto = z.infer<typeof SosSchema>;

export const FuelTokenSchema = z.object({
  amountCop: z.coerce.number().positive(),
  plate: z.string().optional(),
  tripId: z.string().optional(),
});
export type FuelTokenDto = z.infer<typeof FuelTokenSchema>;

export const SpeedLockSchema = z.object({
  speedKph: z.coerce.number().nonnegative(),
});
export type SpeedLockDto = z.infer<typeof SpeedLockSchema>;

/** SCRUM-51 — Estado operativo del conductor */
export const DutyStatusSchema = z.object({
  status: z.enum(["ON_DUTY", "OFF_DUTY", "BREAK"]),
  notes: z.string().max(500).optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
});
export type DutyStatusDto = z.infer<typeof DutyStatusSchema>;

/** SCRUM-51 — Uplink de ubicación */
export const PilotLocationSchema = z.object({
  lat: z.coerce.number(),
  lng: z.coerce.number(),
  vehicleId: z.string().min(1).optional(),
  tripId: z.string().min(1).optional(),
  speedKph: z.coerce.number().optional(),
});
export type PilotLocationDto = z.infer<typeof PilotLocationSchema>;
