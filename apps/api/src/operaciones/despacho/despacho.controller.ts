import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { ModulesGuard, RequireModule } from "../../auth/modules.guard";
import { Roles, RolesGuard } from "../../auth/roles.guard";
import { Permissions, PermissionsGuard } from "../../auth/permissions.guard";
import { DespachoService } from "./despacho.service";
import {
  AsignarViajeSchema,
  BuscarRelevoFlashSchema,
} from "./dto/despacho.dto";

type AuthReq = {
  user: { organizationId: string; userId: string; role: string };
};

const DESPACHO_ROLES = [
  "gestor_operativo",
  "GESTOR_OPERATIVO",
  "supervisor_logistica",
  "SUPERVISOR_LOGISTICA",
  "centro_control",
  "director_operativo",
  "org_admin",
  "platform_master",
  "superadmin",
] as const;

/**
 * Módulo 9.1 — Micro-Dispatch 4.0 (Gestor Operativo · Luis).
 * Prefijos: /operaciones/despacho · /api/v1/operaciones/despacho
 */
@Controller(["operaciones/despacho", "api/v1/operaciones/despacho"])
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, ModulesGuard)
@RequireModule("logistica")
@Roles(...DESPACHO_ROLES)
export class DespachoController {
  constructor(private despacho: DespachoService) {}

  @Get("dashboard")
  @Permissions("logistica_despacho", "READ")
  dashboard(
    @Req() req: AuthReq,
    @Query("customerId") customerId?: string,
    @Query("vehicleType") vehicleType?: string,
  ) {
    return this.despacho.dashboard(req.user.organizationId, {
      customerId,
      vehicleType,
    });
  }

  /** POST /api/v1/operaciones/despacho/asignar-viaje */
  @Post("asignar-viaje")
  @Permissions("logistica_despacho", "CREATE")
  asignar(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = AsignarViajeSchema.parse(body ?? {});
    return this.despacho.asignarViaje(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  /** POST /api/v1/operaciones/despacho/buscar-relevo-flash */
  @Post("buscar-relevo-flash")
  @Permissions("logistica_despacho", "UPDATE")
  relevoFlash(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = BuscarRelevoFlashSchema.parse(body ?? {});
    return this.despacho.buscarRelevoFlash(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }
}
