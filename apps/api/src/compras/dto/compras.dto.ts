import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { z } from "zod";

export const CreateSupplierSchema = z.object({
  name: z.string().trim().min(2).max(160),
  nit: z
    .string()
    .trim()
    .min(5)
    .max(20)
    .regex(/^[0-9.\-]+$/, "NIT inválido"),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  productTags: z
    .union([z.array(z.string()), z.string()])
    .optional()
    .transform((v) => {
      if (!v) return [] as string[];
      if (Array.isArray(v)) {
        return v.map((t) => String(t).trim()).filter(Boolean).slice(0, 12);
      }
      return String(v)
        .split(/[,;]/)
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 12);
    }),
  rating: z.coerce.number().min(1).max(5).optional(),
  bankName: z.string().trim().max(80).optional().or(z.literal("")),
  bankAccountNumber: z.string().trim().max(40).optional().or(z.literal("")),
});
export type CreateSupplierDto = z.infer<typeof CreateSupplierSchema>;

export class PurchaseOrderLineDto {
  @IsString()
  @MinLength(1)
  description!: string;

  @IsNumber()
  @Min(1)
  quantity!: number;

  @IsNumber()
  @Min(0)
  unitCost!: number;

  @IsOptional()
  @IsString()
  inventoryItemId?: string;
}

export class CreatePurchaseOrderDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderLineDto)
  lines!: PurchaseOrderLineDto[];
}

export class GoodsReceiptLineDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Min(0)
  quantity!: number;

  @IsOptional()
  @IsString()
  sku?: string;

  /** QR / código de barras escaneado en almacén */
  @IsOptional()
  @IsString()
  barcode?: string;

  @IsOptional()
  @IsString()
  inventoryItemId?: string;
}

export class CreateGoodsReceiptDto {
  @IsString()
  purchaseOrderId!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GoodsReceiptLineDto)
  lines!: GoodsReceiptLineDto[];
}

export class ProcessThreeWayDto {
  @IsString()
  purchaseOrderId!: string;

  @IsString()
  goodsReceiptId!: string;

  /** Factura ya persistida, o datos para crearla inline */
  @IsOptional()
  @IsString()
  invoiceId?: string;

  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsString()
  counterparty?: string;

  @IsOptional()
  @IsString()
  xmlHash?: string;

  @IsOptional()
  dianPayload?: Record<string, unknown>;
}
