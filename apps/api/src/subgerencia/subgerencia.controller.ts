import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ModulesGuard, RequireModule } from "../auth/modules.guard";
import { Roles, RolesGuard } from "../auth/roles.guard";
import { Permissions, PermissionsGuard } from "../auth/permissions.guard";
import { SubgerenciaService } from "./subgerencia.service";
import {
  CrearConflictoSchema,
  ResolverConflictoSchema,
} from "./dto/subgerencia.dto";

type AuthReq = {
  user: { organizationId: string; userId: string; role: string };
};

const SUBGERENCIA_ROLES = [
  "sub_gerente",
  "SUB_GERENTE",
  "gerente_general",
  "GERENTE_GENERAL",
  "org_admin",
  "platform_master",
  "superadmin",
] as const;

/**
 * Módulo 23 — Subgerencia y Ejecución Táctica
 * Prefijos: /subgerencia · /api/v1/subgerencia
 */
@Controller(["subgerencia", "api/v1/subgerencia"])
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, ModulesGuard)
@RequireModule("gerencia")
@Roles(...SUBGERENCIA_ROLES)
export class SubgerenciaController {
  constructor(private sub: SubgerenciaService) {}

  @Get("dashboard")
  @Permissions("subgerencia_proyectos", "READ")
  dashboard(@Req() req: AuthReq) {
    return this.sub.dashboard(req.user.organizationId);
  }

  @Post("conflictos")
  @Permissions("subgerencia_conflicto", "CREATE")
  crear(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = CrearConflictoSchema.parse(body ?? {});
    return this.sub.crearConflicto(req.user.organizationId, dto);
  }

  @Post("resolver-conflicto")
  @Permissions("subgerencia_conflicto", "UPDATE")
  resolver(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = ResolverConflictoSchema.parse(body ?? {});
    return this.sub.resolverConflicto(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }
}
