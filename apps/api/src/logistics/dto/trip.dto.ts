import {
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from "class-validator";

export class CreateTripDto {
  @IsString()
  @MinLength(2)
  origin!: string;

  @IsString()
  @MinLength(2)
  destination!: string;

  /** ISO-8601 — salida programada (opcional: el service usa ahora si falta) */
  @IsOptional()
  @IsDateString()
  departAt?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  contractId?: string;

  @IsOptional()
  @IsString()
  vehicleId?: string;

  @IsOptional()
  @IsString()
  driverId?: string;

  @IsOptional()
  @IsString()
  routeId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fareAmount?: number;

  /** Alias legado (se mapea a departAt en el service si hace falta) */
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  /** Forzar exigencia de FUEC en el ComplianceGuard */
  @IsOptional()
  @IsBoolean()
  requireFuec?: boolean;

  @IsOptional()
  @IsBoolean()
  dispatch?: boolean;
}

export class DispatchTripDto {
  @IsString()
  vehicleId!: string;

  @IsString()
  driverId!: string;

  @IsOptional()
  @IsDateString()
  departAt?: string;

  @IsOptional()
  @IsString()
  routeId?: string;

  /** Despacho siempre exige FUEC vigente */
  @IsOptional()
  @IsBoolean()
  requireFuec?: boolean = true;

  @IsOptional()
  @IsBoolean()
  dispatch?: boolean = true;
}
