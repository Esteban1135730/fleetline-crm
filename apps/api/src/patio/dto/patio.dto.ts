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
