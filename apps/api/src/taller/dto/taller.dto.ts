import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from "class-validator";
export class CreateWorkOrderDto {
  @IsString()
  vehicleId!: string;

  @IsString()
  @MinLength(3)
  description!: string;

  /** CRITICAL bloquea despacho (MAINTENANCE + complianceBlocked) */
  @IsOptional()
  @IsIn(["ROUTINE", "PREVENTIVE", "CRITICAL"])
  severity?: "ROUTINE" | "PREVENTIVE" | "CRITICAL";

  @IsOptional()
  @IsBoolean()
  critical?: boolean;

  @IsOptional()
  @IsString()
  assignedToId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  odometerAtOpen?: number;
}

export class CloseWorkOrderDto {
  @IsOptional()
  @IsString()
  notes?: string;
}

export class DispatchPartDto {
  @IsOptional()
  @IsString()
  inventoryItemId?: string;

  /** QR del repuesto (InventoryItem.qrCode) */
  @IsOptional()
  @IsString()
  partQr?: string;

  /** Serial del repuesto */
  @IsOptional()
  @IsString()
  serial?: string;

  @IsOptional()
  @IsString()
  mechanicQr?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsString()
  photoOldRef?: string;

  @IsOptional()
  @IsString()
  photoNewRef?: string;

  @IsOptional()
  @IsString()
  mechanicUserId?: string;
}

export class TelemetryIngestDto {
  @IsString()
  vehicleId!: string;

  @IsOptional()
  @IsNumber()
  odometerKm?: number;

  @IsOptional()
  @IsNumber()
  speedKph?: number;

  @IsOptional()
  @IsString()
  obdCode?: string;

  @IsOptional()
  @IsString()
  faultMessage?: string;

  @IsOptional()
  raw?: Record<string, unknown>;
}
