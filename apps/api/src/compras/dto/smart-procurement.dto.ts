import { randomBytes } from "crypto";
import { z } from "zod";

export const SmartBiddingSchema = z.object({
  title: z.string().min(3),
  urgency: z.enum(["CRITICAL", "LOW_STOCK", "ADMIN"]).default("LOW_STOCK"),
  quantity: z.coerce.number().int().positive().default(1),
  inventoryItemId: z.string().optional(),
  sku: z.string().optional(),
  notes: z.string().optional(),
  /** Tags de producto para filtrar proveedores homologados */
  productTags: z.array(z.string()).optional(),
  /** Si true, selecciona automáticamente el mejor bid (precio × lead) */
  autoSelect: z.boolean().optional().default(true),
});
export type SmartBiddingDto = z.input<typeof SmartBiddingSchema>;

export const EmitirOrdenSchema = z.object({
  requisitionId: z.string().optional(),
  bidId: z.string().optional(),
  description: z.string().optional(),
  supplierId: z.string().optional(),
  currency: z.string().default("COP"),
  lines: z
    .array(
      z.object({
        description: z.string().min(1),
        quantity: z.coerce.number().int().positive(),
        unitCost: z.coerce.number().nonnegative(),
        inventoryItemId: z.string().optional(),
      }),
    )
    .min(1)
    .optional(),
  /** OC de seguros / SOAT */
  insuranceRenewal: z
    .object({
      vehicleId: z.string().optional(),
      plate: z.string().optional(),
      docType: z.enum(["SOAT", "POLIZA"]).default("SOAT"),
      pdfRef: z.string().optional(),
    })
    .optional(),
});
export type EmitirOrdenDto = z.input<typeof EmitirOrdenSchema>;

export const EntradaAlmacenSchema = z.object({
  purchaseOrderId: z.string().min(1),
  notes: z.string().optional(),
  lines: z
    .array(
      z.object({
        description: z.string().optional(),
        quantity: z.coerce.number().int().nonnegative(),
        sku: z.string().optional(),
        barcode: z.string().optional(),
        inventoryItemId: z.string().optional(),
      }),
    )
    .min(1),
  /** Notificar auxiliar contable para 3-Way Match */
  notifyAuxiliarContable: z.boolean().default(true),
});
export type EntradaAlmacenDto = z.input<typeof EntradaAlmacenSchema>;

export function newSecureToken(): string {
  return randomBytes(24).toString("hex");
}

/** Score menor = mejor (precio unitario * (1 + leadDays/30)). */
export function bidOptimalityScore(unitPrice: number, leadDays: number): number {
  return Number((unitPrice * (1 + Math.max(0, leadDays) / 30)).toFixed(4));
}

export function comprasCfoThresholdCop(): number {
  const raw = process.env.COMPRAS_CFO_THRESHOLD_COP;
  const n = raw ? Number(raw) : 10_000_000;
  return Number.isFinite(n) && n > 0 ? n : 10_000_000;
}

export function buildOcPdfMarkup(input: {
  code: string;
  supplierName: string;
  total: number;
  currency: string;
  lines: Array<{ description: string; quantity: number; unitCost: number }>;
  requiresCfoApproval: boolean;
}): string {
  const lines = [
    "FLEETLINE · ORDEN DE COMPRA",
    `Código: ${input.code}`,
    `Proveedor: ${input.supplierName}`,
    `Total: ${input.currency} ${input.total.toLocaleString("es-CO")}`,
    input.requiresCfoApproval
      ? "Estado: PENDIENTE APROBACIÓN DIRECTOR FINANCIERO"
      : "Estado: OC EMITIDA",
    "— Líneas —",
    ...input.lines.map(
      (l) =>
        `· ${l.description} × ${l.quantity} @ ${l.unitCost} = ${l.quantity * l.unitCost}`,
    ),
    `Generado: ${new Date().toISOString()}`,
  ];
  return lines.join("\n");
}
