import { z } from "zod";

export const ImpuestosValidarQuerySchema = z.object({
  yearMonth: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
});
export type ImpuestosValidarQuery = z.infer<typeof ImpuestosValidarQuerySchema>;

/** Frase que el revisor debe escribir para sellar el periodo (anti clic accidental). */
export function hardLockConfirmPhrase(yearMonth: string): string {
  return `CERRAR ${yearMonth}`;
}

export const HardLockSchema = z
  .object({
    yearMonth: z.string().regex(/^\d{4}-\d{2}$/),
    pdfRef: z.string().min(3).max(500),
    signatureHash: z.string().min(16).max(128).optional(),
    opinion: z
      .enum(["SIN_SALVEDADES", "CON_SALVEDADES", "ADVERSO", "ABSTENCION"])
      .default("SIN_SALVEDADES"),
    notes: z.string().max(4000).optional(),
    dictamenBody: z.string().max(20_000).optional(),
    /** Casilla de riesgo: debe ser true o el API rechaza el cierre. */
    riskAcknowledged: z.literal(true),
    /** Frase exacta CERRAR YYYY-MM */
    confirmPhrase: z.string().min(8).max(32),
  })
  .superRefine((val, ctx) => {
    if (val.riskAcknowledged !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["riskAcknowledged"],
        message:
          "Debe confirmar el riesgo: el cierre afecta a toda la organización",
      });
    }
    const expected = hardLockConfirmPhrase(val.yearMonth);
    if (val.confirmPhrase.trim().toUpperCase() !== expected) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPhrase"],
        message: `Escriba exactamente: ${expected}`,
      });
    }
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
