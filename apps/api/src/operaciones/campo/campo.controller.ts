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
import { CampoService } from "./campo.service";
import {
  AbordajeManualSchema,
  FallaSitioSchema,
  RadarGeocercaQuerySchema,
  SyncOfflineBoardingsSchema,
} from "./dto/campo.dto";

type AuthReq = {
  user: { organizationId: string; userId: string; role: string };
};

const CAMPO_ROLES = [
  "coordinador_campo",
  "COORDINADOR_CAMPO",
  "director_operativo",
  "gestor_operativo",
  "org_admin",
  "platform_master",
  "superadmin",
] as const;

/**
 * Módulo 9.2 — Field Commander Hub (Carlos).
 * Prefijos: /operaciones/campo · /api/v1/operaciones/campo
 */
@Controller(["operaciones/campo", "api/v1/operaciones/campo"])
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, ModulesGuard)
@RequireModule("logistica")
@Roles(...CAMPO_ROLES)
export class CampoController {
  constructor(private campo: CampoService) {}

  @Get("dashboard")
  @Permissions("campo_radar", "READ")
  dashboard(@Req() req: AuthReq) {
    return this.campo.dashboard(
      req.user.organizationId,
      req.user.userId,
    );
  }

  /** GET /api/v1/operaciones/campo/radar-geocerca */
  @Get("radar-geocerca")
  @Permissions("campo_radar", "READ")
  radar(@Req() req: AuthReq, @Query() query: Record<string, string>) {
    const dto = RadarGeocercaQuerySchema.parse(query ?? {});
    return this.campo.radarGeocerca(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  /** POST /api/v1/operaciones/campo/falla-sitio */
  @Post("falla-sitio")
  @Permissions("campo_auditoria", "CREATE")
  fallaSitio(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = FallaSitioSchema.parse(body ?? {});
    return this.campo.fallaSitio(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  /** POST /api/v1/operaciones/campo/abordaje-manual */
  @Post("abordaje-manual")
  @Permissions("campo_abordaje", "UPDATE")
  abordaje(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = AbordajeManualSchema.parse(body ?? {});
    return this.campo.abordajeManual(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  /** POST sync diferida offline → nube */
  @Post("abordaje-manual/sync")
  @Permissions("campo_abordaje", "UPDATE")
  syncOffline(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = SyncOfflineBoardingsSchema.parse(body ?? {});
    return this.campo.syncOfflineBoardings(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }
}
