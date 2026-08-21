import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { ModulesGuard, RequireModule } from "../../auth/modules.guard";
import { LogisticaOpsService } from "../logistica-ops.service";
import { LinkDriverVehicleSchema } from "../dto/logistica.dto";

type AuthReq = {
  user: { organizationId: string; userId: string };
};

/**
 * Matriz N:N — Conductores autorizados por vehículo / vehículos por conductor.
 * Prefijo: /logistica/asignaciones-unidad
 */
@Controller("logistica/asignaciones-unidad")
@UseGuards(JwtAuthGuard, ModulesGuard)
@RequireModule("logistica")
export class AsignacionesUnidadController {
  constructor(private ops: LogisticaOpsService) {}

  @Get()
  list(
    @Req() req: AuthReq,
    @Query("driverId") driverId?: string,
    @Query("vehicleId") vehicleId?: string,
  ) {
    return this.ops.listDriverVehicleAuths(req.user.organizationId, {
      driverId,
      vehicleId,
    });
  }

  @Get("matriz")
  matrix(@Req() req: AuthReq) {
    return this.ops.driverVehicleAuthMatrix(req.user.organizationId);
  }

  @Post()
  link(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = LinkDriverVehicleSchema.parse(body ?? {});
    return this.ops.linkDriverVehicle(
      req.user.organizationId,
      dto,
      req.user.userId,
    );
  }

  @Patch(":id/primary")
  setPrimary(@Req() req: AuthReq, @Param("id") id: string) {
    return this.ops.setPrimaryDriverVehicle(req.user.organizationId, id);
  }

  @Delete(":id")
  unlink(@Req() req: AuthReq, @Param("id") id: string) {
    return this.ops.unlinkDriverVehicle(req.user.organizationId, id);
  }
}
