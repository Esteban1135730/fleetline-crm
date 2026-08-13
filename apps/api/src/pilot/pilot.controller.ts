import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ModulesGuard, RequireModule } from "../auth/modules.guard";
import { Roles, RolesGuard } from "../auth/roles.guard";
import { Permissions, PermissionsGuard } from "../auth/permissions.guard";
import { PilotService } from "./pilot.service";
import {
  FuelTokenSchema,
  PreoperacionalSchema,
  SosSchema,
  SpeedLockSchema,
} from "./dto/pilot.dto";

type AuthReq = {
  user: { organizationId: string; userId: string; role: string };
};

const PILOT_ROLES = [
  "conductor",
  "CONDUCTOR",
  "operador_centro_control",
  "director_operativo",
  "gerente_general",
  "org_admin",
  "platform_master",
  "superadmin",
] as const;

/**
 * Módulo 22 — FSG Pilot App (Conductor)
 * Prefijos: /pilot · /api/v1/pilot
 */
@Controller(["pilot", "api/v1/pilot"])
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, ModulesGuard)
@RequireModule("logistica", "apps")
@Roles(...PILOT_ROLES)
export class PilotController {
  constructor(private pilot: PilotService) {}

  @Get("dashboard")
  @Permissions("pilot_preop", "READ")
  dashboard(@Req() req: AuthReq) {
    return this.pilot.dashboard(req.user.organizationId, req.user.userId);
  }

  @Post("preoperacional")
  @Permissions("pilot_preop", "CREATE")
  preoperacional(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = PreoperacionalSchema.parse(body ?? {});
    return this.pilot.submitPreoperacional(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  @Post("sos")
  @Permissions("pilot_sos", "CREATE")
  sos(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = SosSchema.parse(body ?? {});
    return this.pilot.raiseSos(req.user.organizationId, req.user.userId, dto);
  }

  @Post("viatico/token")
  @Permissions("pilot_viatico", "CREATE")
  fuelToken(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = FuelTokenSchema.parse(body ?? {});
    return this.pilot.issueFuelToken(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  @Post("speed-lock")
  @Permissions("pilot_preop", "READ")
  speedLock(@Body() body: unknown) {
    const dto = SpeedLockSchema.parse(body ?? {});
    return this.pilot.speedLock(dto.speedKph);
  }
}
