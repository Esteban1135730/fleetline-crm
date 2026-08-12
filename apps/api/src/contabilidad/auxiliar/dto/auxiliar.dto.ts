import { z } from "zod";

export const ThreeWayMatchSchema = z.object({
  purchaseOrderId: z.string().min(1),
  goodsReceiptId: z.string().min(1),
  invoiceId: z.string().min(1).optional(),
  invoiceNumber: z.string().min(1).optional(),
  amount: z.coerce.number().nonnegative().optional(),
  counterparty: z.string().optional(),
  xmlHash: z.string().optional(),
  dianPayload: z.record(z.unknown()).optional(),
  supportFileRef: z.string().optional(),
  /** CAUSAR solo si match APPROVED; DEVOLVER fuerza retorno a proveedor */
  action: z.enum(["MATCH", "CAUSAR", "DEVOLVER"]).default("MATCH"),
});
export type ThreeWayMatchDto = z.infer<typeof ThreeWayMatchSchema>;

export const LegalizacionCerrarSchema = z.object({
  legalizationId: z.string().min(1),
  additionalExpenses: z
    .array(
      z.object({
        description: z.string().min(1),
        amount: z.coerce.number().positive(),
        receiptRef: z.string().optional(),
      }),
    )
    .optional(),
  notes: z.string().max(1000).optional(),
  /** Si hay saldo a favor empresa → descuento nómina */
  applyPayrollDeduction: z.boolean().optional(),
});
export type LegalizacionCerrarDto = z.infer<typeof LegalizacionCerrarSchema>;

export const ConciliacionAutoMatchSchema = z.object({
  statementId: z.string().min(1).optional(),
  bankName: z.string().optional(),
  periodDate: z.string().optional(),
  rows: z
    .array(
      z.object({
        externalRef: z.string().optional(),
        description: z.string().min(1),
        amount: z.coerce.number(),
        bookedAt: z.string().optional(),
      }),
    )
    .optional(),
  /** Cerrar caja diaria tras auto-match */
  closeDaily: z.boolean().optional(),
});
export type ConciliacionAutoMatchDto = z.infer<typeof ConciliacionAutoMatchSchema>;
