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
});
export type YardAccessLogDto = z.infer<typeof YardAccessLogSchema>;

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
