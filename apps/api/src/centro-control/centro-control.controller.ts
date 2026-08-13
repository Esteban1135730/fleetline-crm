import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ModulesGuard, RequireModule } from "../auth/modules.guard";
import { Roles, RolesGuard } from "../auth/roles.guard";
import { Permissions, PermissionsGuard } from "../auth/permissions.guard";
import { CentroControlService } from "./centro-control.service";
import {
  ActivarSosSchema,
  ApagadoRemotoSchema,
  FatigaIntervencionSchema,
  TipificarDesvioSchema,
} from "./dto/centro-control.dto";

type AuthReq = {
  user: { organizationId: string; userId: string; role: string };
};

const WATCHTOWER_ROLES = [
  "operador_centro_control",
  "OPERADOR_CENTRO_CONTROL",
  "centro_control",
  "CENTRO_CONTROL",
  "director_operativo",
  "org_admin",
  "platform_master",
  "superadmin",
] as const;

/**
 * Módulo 10 — Watchtower 24/7 (Valeria).
 * Prefijos: /centro-control · /api/v1/centro-control
 */
@Controller(["centro-control", "api/v1/centro-control"])
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, ModulesGuard)
@RequireModule("logistica")
@Roles(...WATCHTOWER_ROLES)
export class CentroControlController {
  constructor(private cc: CentroControlService) {}

  @Get("dashboard")
  @Permissions("watchtower_radar", "MONITOR")
  dashboard(@Req() req: AuthReq) {
    return this.cc.dashboard(req.user.organizationId);
  }

  /** POST /api/v1/centro-control/desvio-geocerca/tipificar */
  @Post("desvio-geocerca/tipificar")
  @Permissions("watchtower_radar", "UPDATE")
  tipificar(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = TipificarDesvioSchema.parse(body ?? {});
    return this.cc.tipificarDesvio(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  /** POST /api/v1/centro-control/sos/activar-protocolo */
  @Post("sos/activar-protocolo")
  @Permissions("watchtower_sos", "CREATE")
  activarSos(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = ActivarSosSchema.parse(body ?? {});
    return this.cc.activarSos(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  /** POST /api/v1/centro-control/iot/apagado-remoto */
  @Post("iot/apagado-remoto")
  @Permissions("watchtower_iot", "CREATE")
  apagadoRemoto(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = ApagadoRemotoSchema.parse(body ?? {});
    return this.cc.apagadoRemoto(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  @Post("fatiga/intervencion")
  @Permissions("watchtower_radar", "UPDATE")
  fatiga(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = FatigaIntervencionSchema.parse(body ?? {});
    return this.cc.intervencionFatiga(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }
}
