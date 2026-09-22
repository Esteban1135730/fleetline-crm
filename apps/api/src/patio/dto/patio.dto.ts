import { z } from "zod";

export const YardAccessLogSchema = z.object({
  kind: z.enum(["CHECK_IN", "CHECK_OUT"]),
  plate: z.string().min(3).optional(),
  vehicleId: z.string().min(1).optional(),
  driverId: z.string().min(1).optional(),
  odometerKm: z.coerce.number().int().nonnegative().optional(),
  gateId: z.string().optional(),
  cameraRef: z.string().optional(),
  lprConfidence: z.coerce.number().min(0).max(1).optional(),
  guardName: z.string().optional(),
  driverName: z.string().optional(),
  /** Salida programada para parqueo LIFO al hacer CHECK_IN */
  scheduledDepartAt: z.coerce.date().optional(),
});
export type YardAccessLogDto = z.infer<typeof YardAccessLogSchema>;

/** Validación LPR / QR de talanquera — salida automática */
export const LprCheckSchema = z.object({
  plate: z.string().min(3).optional(),
  vehicleId: z.string().min(1).optional(),
  driverId: z.string().min(1).optional(),
  qrPayload: z.string().optional(),
  gateId: z.string().optional(),
  cameraRef: z.string().optional(),
  lprConfidence: z.coerce.number().min(0).max(1).optional(),
  at: z.coerce.date().optional(),
});
export type LprCheckDto = z.infer<typeof LprCheckSchema>;

/**
 * SCRUM-45 — Decisión canónica ENTRA / NO_ENTRA (placa o cédula).
 * Samuel (SCRUM-47) consume este payload para la pantalla de portería.
 */
export const GateDecisionSchema = z
  .object({
    plate: z.string().min(3).optional(),
    /** Cédula / documento conductor o visitante */
    document: z.string().min(5).optional(),
    direction: z.enum(["IN", "OUT"]).optional().default("OUT"),
    gateId: z.string().optional(),
    at: z.coerce.date().optional(),
  })
  .refine((v) => Boolean(v.plate?.trim()) || Boolean(v.document?.trim()), {
    message: "Indique plate o document (cédula)",
  });
export type GateDecisionDto = z.infer<typeof GateDecisionSchema>;

export const YardMoveSchema = z.object({
  plate: z.string().min(3),
  fromLane: z.string().optional(),
  toLane: z.string().min(1),
  toBay: z.string().min(1),
  scheduledDepartAt: z.coerce.date().optional(),
});
export type YardMoveDto = z.infer<typeof YardMoveSchema>;

export const WashCompleteSchema = z.object({
  washJobId: z.string().min(1),
  notes: z.string().max(500).optional(),
});
export type WashCompleteDto = z.infer<typeof WashCompleteSchema>;

export const YardInspectionSchema = z.object({
  vehicleId: z.string().min(1),
  parkingLogId: z.string().min(1).optional(),
  phase: z.enum(["CHECK_IN", "CHECK_OUT", "SPOT_CHECK"]).default("CHECK_IN"),
  fuelLevelPct: z.coerce.number().int().min(0).max(100).optional(),
  tireCondition: z.string().max(200).optional(),
  visualDamageNotes: z.string().max(2000).optional(),
  criticalSafetyFault: z.boolean().optional().default(false),
  criticalFaultDetail: z.string().max(2000).optional(),
  photoRefs: z.array(z.string()).optional(),
  inspectorName: z.string().optional(),
});
export type YardInspectionDto = z.infer<typeof YardInspectionSchema>;
