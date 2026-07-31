import { z } from "zod";

export const ArchiveEntityTypeSchema = z.enum([
  "VEHICLE",
  "DRIVER",
  "SUPPLIER",
  "PURCHASE_ORDER",
  "CUSTOMER",
  "EMPLOYEE",
  "GENERAL",
]);

export const ArchiveDocTypeSchema = z.enum([
  "SOAT",
  "TECNOMECANICA",
  "LICENCIA",
  "FACTURA",
  "FUEC",
  "CONTRACT",
  "OTHER",
]);

export const UploadArchiveSchema = z.object({
  title: z.string().min(1).optional(),
  category: z.string().optional(),
  docType: ArchiveDocTypeSchema.optional(),
  tags: z.union([z.string(), z.array(z.string())]).optional(),
  entityType: ArchiveEntityTypeSchema.optional(),
  entityId: z.string().min(1).optional(),
  vehicleId: z.string().min(1).optional(),
  driverId: z.string().min(1).optional(),
  supplierId: z.string().min(1).optional(),
  purchaseOrderId: z.string().min(1).optional(),
  /** Texto simulado / hint OCR (dev) */
  ocrHintText: z.string().optional(),
  autoOcr: z
    .union([z.boolean(), z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => v === true || v === "true"),
});
export type UploadArchiveDto = z.infer<typeof UploadArchiveSchema>;

export const ListDocumentsSchema = z.object({
  entityType: ArchiveEntityTypeSchema.optional(),
  entityId: z.string().optional(),
  vehicleId: z.string().optional(),
  driverId: z.string().optional(),
  supplierId: z.string().optional(),
  purchaseOrderId: z.string().optional(),
  docType: ArchiveDocTypeSchema.optional(),
  category: z.string().optional(),
  validationStatus: z.string().optional(),
  tag: z.string().optional(),
  q: z.string().optional(),
});
export type ListDocumentsDto = z.infer<typeof ListDocumentsSchema>;

export const OcrProcessSchema = z.object({
  documentId: z.string().min(1),
  /** Override / texto mock Document AI */
  rawText: z.string().optional(),
  docType: ArchiveDocTypeSchema.optional(),
});
export type OcrProcessDto = z.infer<typeof OcrProcessSchema>;
