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
import { DirectorOperativoService } from "./director.service";
import {
  AprobarParadaFlotaSchema,
  CapacityPlanningQuerySchema,
  OverrideReasignarSchema,
} from "./dto/director.dto";

type AuthReq = {
  user: { organizationId: string; userId: string; role: string };
};

const DIRECTOR_ROLES = [
  "director_operativo",
  "DIRECTOR_OPERATIVO",
  "org_admin",
  "platform_master",
  "superadmin",
  "gerente_general",
] as const;

/**
 * Módulo 9 — Dirección Operativa / Control Tower (Héctor).
 * Prefijos: /operaciones/director · /api/v1/operaciones/director
 */
@Controller(["operaciones/director", "api/v1/operaciones/director"])
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, ModulesGuard)
@RequireModule("logistica")
@Roles(...DIRECTOR_ROLES)
export class DirectorOperativoController {
  constructor(private director: DirectorOperativoService) {}

  @Get("dashboard")
  @Permissions("torre_rutas", "READ")
  dashboard(@Req() req: AuthReq) {
    return this.director.tacticalDashboard(req.user.organizationId);
  }

  /** POST /api/v1/operaciones/director/override-reasignar */
  @Post("override-reasignar")
  @Permissions("override_operativo", "CREATE")
  override(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = OverrideReasignarSchema.parse(body ?? {});
    return this.director.overrideReasignar(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  /** GET /api/v1/operaciones/director/capacity-planning */
  @Get("capacity-planning")
  @Permissions("torre_rutas", "READ")
  capacity(@Req() req: AuthReq, @Query() query: Record<string, string>) {
    const dto = CapacityPlanningQuerySchema.parse(query ?? {});
    return this.director.capacityPlanning(req.user.organizationId, dto);
  }

  /** POST /api/v1/operaciones/director/aprobar-parada-flota */
  @Post("aprobar-parada-flota")
  @Permissions("parada_flota", "UPDATE")
  aprobarParada(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = AprobarParadaFlotaSchema.parse(body ?? {});
    return this.director.aprobarParadaFlota(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }
}
