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

export const CustodiaFisicaSchema = z.object({
  documentId: z.string().min(1),
  aisle: z.string().min(1).max(32),
  shelf: z.string().min(1).max(32),
  box: z.string().min(1).max(32),
  title: z.string().min(1).max(200).optional(),
  tags: z.array(z.string()).optional(),
  plate: z.string().max(20).optional(),
  documentNumber: z.string().max(40).optional(),
  vehicleId: z.string().min(1).optional(),
  driverId: z.string().min(1).optional(),
  entityType: ArchiveEntityTypeSchema.optional(),
  entityId: z.string().min(1).optional(),
  pendingDigitization: z.boolean().optional(),
});
export type CustodiaFisicaDto = z.infer<typeof CustodiaFisicaSchema>;

export const DespacharSuministroSchema = z
  .object({
    itemId: z.string().min(1).optional(),
    sku: z.string().min(1).optional(),
    quantity: z.coerce.number().int().positive(),
    ticketRef: z.string().max(80).optional(),
    notes: z.string().max(500).optional(),
    requestedById: z.string().min(1).optional(),
  })
  .refine((v) => Boolean(v.itemId || v.sku), {
    message: "itemId o sku requerido",
  });
export type DespacharSuministroDto = z.infer<typeof DespacharSuministroSchema>;

export const PrestamoCheckOutSchema = z.object({
  documentId: z.string().min(1),
  borrowerUserId: z.string().min(1),
  purpose: z.string().max(300).optional(),
  notes: z.string().max(500).optional(),
  dueDays: z.coerce.number().int().positive().max(90).optional(),
});
export type PrestamoCheckOutDto = z.infer<typeof PrestamoCheckOutSchema>;
