import { z } from "zod";

export const SmartScanSchema = z.object({
  contractTitle: z.string().min(3).max(200),
  contractKind: z
    .enum(["B2B", "AFILIADO", "PROVEEDOR", "OTRO"])
    .default("B2B"),
  fileRef: z.string().min(1).max(500).optional(),
  /** Texto extraído del PDF/Word (OCR o paste) */
  contractText: z.string().min(20).max(200_000),
  comments: z
    .array(
      z.object({
        author: z.string().min(1).max(120),
        body: z.string().min(1).max(2000),
        at: z.string().datetime().optional(),
      }),
    )
    .max(50)
    .optional(),
});
export type SmartScanDto = z.infer<typeof SmartScanSchema>;

export const SarlaftConsultaListasSchema = z.object({
  document: z.string().min(5).max(40),
  subjectName: z.string().min(2).max(200).optional(),
  entityType: z
    .enum(["PROPIETARIO", "CLIENTE", "CONDUCTOR", "PROVEEDOR", "OTRO"])
    .optional(),
  plate: z.string().min(3).max(20).optional(),
});
export type SarlaftConsultaListasDto = z.infer<
  typeof SarlaftConsultaListasSchema
>;

export const DisciplinaryMemoSchema = z.object({
  subjectName: z.string().min(2).max(200),
  document: z.string().min(5).max(40).optional(),
  plate: z.string().min(3).max(20).optional(),
  charge: z.string().min(5).max(2000),
  tripId: z.string().cuid().optional(),
});
export type DisciplinaryMemoDto = z.infer<typeof DisciplinaryMemoSchema>;

export const ContractCommentSchema = z.object({
  scanId: z.string().cuid(),
  author: z.string().min(1).max(120),
  body: z.string().min(1).max(2000),
});
export type ContractCommentDto = z.infer<typeof ContractCommentSchema>;
