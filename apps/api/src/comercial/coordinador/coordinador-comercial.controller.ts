import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { ModulesGuard, RequireModule } from "../../auth/modules.guard";
import { Roles, RolesGuard } from "../../auth/roles.guard";
import { Permissions, PermissionsGuard } from "../../auth/permissions.guard";
import { CoordinadorComercialService } from "./coordinador-comercial.service";
import {
  AprobarDescuentoSchema,
  CrearLicitacionSchema,
  DistribuirRoundRobinSchema,
} from "./dto/coordinador-comercial.dto";

type AuthReq = {
  user: { organizationId: string; userId: string; role: string };
};

const COORD_ROLES = [
  "coordinador_comercial",
  "COORDINADOR_COMERCIAL",
  "director_comercial",
  "org_admin",
  "platform_master",
  "superadmin",
  "gerente_general",
] as const;

/**
 * Módulo 15 — Coordinación Comercial / Licitaciones (Sergio).
 * Prefijos: /comercial/coordinador · /api/v1/comercial/coordinador
 */
@Controller(["comercial/coordinador", "api/v1/comercial/coordinador"])
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, ModulesGuard)
@RequireModule("comercial")
@Roles(...COORD_ROLES)
export class CoordinadorComercialController {
  constructor(private coord: CoordinadorComercialService) {}

  @Get("dashboard")
  @Permissions("crm_comercial", "READ")
  dashboard(@Req() req: AuthReq) {
    return this.coord.dashboard(req.user.organizationId);
  }

  /** POST /api/v1/comercial/coordinador/descuento/aprobar */
  @Post("descuento/aprobar")
  @Permissions("crm_comercial", "UPDATE")
  aprobarDescuento(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = AprobarDescuentoSchema.parse(body ?? {});
    return this.coord.aprobarDescuento(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  /** POST /api/v1/comercial/coordinador/licitaciones/crear-proyecto */
  @Post("licitaciones/crear-proyecto")
  @Permissions("crm_comercial", "CREATE")
  crearLicitacion(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = CrearLicitacionSchema.parse(body ?? {});
    return this.coord.crearProyectoLicitacion(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  /** POST /api/v1/comercial/coordinador/leads/distribuir-round-robin */
  @Post("leads/distribuir-round-robin")
  @Permissions("crm_comercial", "UPDATE")
  distribuir(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = DistribuirRoundRobinSchema.parse(body ?? {});
    return this.coord.distribuirRoundRobin(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }
}
