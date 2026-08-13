import { z } from "zod";

export const ImpuestosValidarQuerySchema = z.object({
  yearMonth: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
});
export type ImpuestosValidarQuery = z.infer<typeof ImpuestosValidarQuerySchema>;

export const HardLockSchema = z.object({
  yearMonth: z.string().regex(/^\d{4}-\d{2}$/),
  pdfRef: z.string().min(3).max(500),
  signatureHash: z.string().min(16).max(128).optional(),
  opinion: z
    .enum(["SIN_SALVEDADES", "CON_SALVEDADES", "ADVERSO", "ABSTENCION"])
    .default("SIN_SALVEDADES"),
  notes: z.string().max(4000).optional(),
  dictamenBody: z.string().max(20_000).optional(),
});
export type HardLockDto = z.infer<typeof HardLockSchema>;

export const FiscalAuditNoteSchema = z.object({
  invoiceId: z.string().cuid().optional(),
  yearMonth: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  title: z.string().min(3).max(200),
  body: z.string().min(5).max(4000),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
});
export type FiscalAuditNoteDto = z.infer<typeof FiscalAuditNoteSchema>;
