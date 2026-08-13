import { z } from "zod";

export const CreateSiniestroSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  severity: z
    .enum(["MINOR", "MODERATE", "SEVERE", "CRITICAL"])
    .default("SEVERE"),
  occurredAt: z.coerce.date().optional(),
  location: z.string().optional(),
  vehicleId: z.string().min(1).optional(),
  driverId: z.string().min(1).optional(),
  /** Evidencias SOS desde App móvil */
  photoRefs: z.array(z.string().min(1)).max(20).default([]),
  /** Activar integración Aseguradora / ARL */
  activateInsurance: z.boolean().optional().default(true),
  insuranceProvider: z.string().optional(),
  /** Emitir orden de reparación a Taller */
  emitWorkOrder: z.boolean().optional().default(true),
});
export type CreateSiniestroDto = z.infer<typeof CreateSiniestroSchema>;

export const HuellaCarbonoSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  /** Factor kg CO₂ por galón diésel (default Colombia ~10.16) */
  kgCo2PerGallon: z.coerce.number().positive().optional(),
  exportPdf: z.boolean().optional().default(false),
});
export type HuellaCarbonoDto = z.infer<typeof HuellaCarbonoSchema>;

export const TelemetryRiskEventSchema = z.object({
  organizationId: z.string().min(1),
  driverId: z.string().min(1),
  vehicleId: z.string().optional(),
  plate: z.string().optional(),
  kind: z.enum(["SPEED_EXCESS", "HARD_BRAKE"]),
  speedKmh: z.coerce.number().optional(),
  limitKmh: z.coerce.number().optional(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  occurredAt: z.coerce.date().optional(),
});
export type TelemetryRiskEventDto = z.infer<typeof TelemetryRiskEventSchema>;
