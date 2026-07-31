import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from "class-validator";

export class DisbursePaymentsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  paymentScheduleIds!: string[];

  /** OTP MFA de 6 dígitos — obligatorio si el monto supera el umbral */
  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: "mfaToken debe ser OTP de 6 dígitos" })
  mfaToken?: string;

  @IsOptional()
  @IsString()
  bankRef?: string;
}

export class LiquidateRodamientosDto {
  @IsString()
  @MinLength(8)
  periodFrom!: string;

  @IsString()
  @MinLength(8)
  periodTo!: string;

  @IsOptional()
  @IsString()
  driverId?: string;

  @IsOptional()
  @IsString()
  vehicleId?: string;
}
