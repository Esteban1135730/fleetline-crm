import { IsOptional, IsString } from "class-validator";

export class SyncVehicleParamsDto {
  @IsString()
  vehicleId!: string;
}

export class ComplianceStatusQueryDto {
  @IsOptional()
  @IsString()
  organizationId?: string;

  /** Filtrar: blocked | expiring | all */
  @IsOptional()
  @IsString()
  filter?: "blocked" | "expiring" | "all";
}
