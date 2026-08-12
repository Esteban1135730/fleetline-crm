import { z } from "zod";

export const AprobarGastoRutaSchema = z.object({
  expenseId: z.string().min(1),
  approve: z.boolean().default(true),
  rejectReason: z.string().max(500).optional(),
});
export type AprobarGastoRutaDto = z.infer<typeof AprobarGastoRutaSchema>;

export const EmitirDianSchema = z.object({
  customerId: z.string().min(1),
  periodFrom: z.string().min(8),
  periodTo: z.string().min(8),
  tripIds: z.array(z.string().min(1)).optional(),
  notes: z.string().max(500).optional(),
  /** Si true, solo genera borrador de prefactura sin timbrar */
  draftOnly: z.boolean().optional(),
});
export type EmitirDianDto = z.infer<typeof EmitirDianSchema>;

export const SincronizarTallerSchema = z.object({
  periodFrom: z.string().min(8).optional(),
  periodTo: z.string().min(8).optional(),
  /** COP por km para depreciación automática */
  depreciationPerKm: z.coerce.number().positive().optional(),
});
export type SincronizarTallerDto = z.infer<typeof SincronizarTallerSchema>;
