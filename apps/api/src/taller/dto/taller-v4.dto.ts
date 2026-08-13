import { z } from "zod";

export const CrearOrdenSchema = z.object({
  vehicleId: z.string().min(1),
  description: z.string().min(3).max(2000),
  severity: z.enum(["ROUTINE", "PREVENTIVE", "CRITICAL"]).default("ROUTINE"),
  critical: z.boolean().optional(),
  assignedToId: z.string().cuid().optional(),
  odometerAtOpen: z.number().int().min(0).optional(),
  bayCode: z.string().min(1).max(20).optional(),
  prekitSku: z.string().min(1).max(64).optional(),
  prekitQty: z.number().int().min(1).max(100).optional(),
});
export type CrearOrdenDto = z.infer<typeof CrearOrdenSchema>;

export const DespacharQrSchema = z.object({
  workOrderId: z.string().cuid(),
  partQr: z.string().min(2).max(120).optional(),
  serial: z.string().min(2).max(120).optional(),
  inventoryItemId: z.string().cuid().optional(),
  mechanicQr: z.string().min(2).max(120).optional(),
  mechanicUserId: z.string().cuid().optional(),
  quantity: z.number().int().min(1).max(100).default(1),
  photoOldRef: z.string().optional(),
  photoNewRef: z.string().optional(),
});
export type DespacharQrDto = z.infer<typeof DespacharQrSchema>;

export const TimeTrackingSchema = z.object({
  workOrderId: z.string().cuid(),
  action: z.enum(["START", "STOP"]),
  taskLabel: z.string().min(1).max(120).default("TAREA"),
  entryId: z.string().cuid().optional(),
});
export type TimeTrackingDto = z.infer<typeof TimeTrackingSchema>;

export const LiberarQcSchema = z.object({
  workOrderId: z.string().cuid(),
  notes: z.string().max(2000).optional(),
  pass: z.boolean().default(true),
});
export type LiberarQcDto = z.infer<typeof LiberarQcSchema>;

export const FindingSchema = z.object({
  workOrderId: z.string().cuid(),
  photoRef: z.string().optional(),
  voiceRef: z.string().optional(),
  transcript: z.string().max(8000).optional(),
  notes: z.string().max(2000).optional(),
});
export type FindingDto = z.infer<typeof FindingSchema>;
