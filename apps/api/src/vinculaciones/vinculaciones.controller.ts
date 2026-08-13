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
import { VinculacionesService } from "./vinculaciones.service";
import {
  BackgroundCheckSchema,
  PortalLinkSchema,
  ValidarOcrSchema,
} from "./dto/vinculaciones.dto";

type AuthReq = {
  user: { organizationId: string; userId: string; role: string };
};

const VIN_ROLES = [
  "gestor_vinculaciones",
  "GESTOR_VINCULACIONES",
  "vinculaciones",
  "VINCULACIONES",
  "org_admin",
  "platform_master",
  "superadmin",
] as const;

/**
 * Módulo 13 — Smart Onboarding (Laura).
 * Prefijos: /vinculaciones · /api/v1/vinculaciones
 */
@Controller(["vinculaciones", "api/v1/vinculaciones"])
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, ModulesGuard)
@RequireModule("rrhh")
@Roles(...VIN_ROLES)
export class VinculacionesController {
  constructor(private vin: VinculacionesService) {}

  @Get("dashboard")
  @Permissions("vinculaciones_afiliados", "READ")
  dashboard(@Req() req: AuthReq) {
    return this.vin.dashboard(req.user.organizationId);
  }

  /** POST /api/v1/vinculaciones/afiliados/portal-link */
  @Post("afiliados/portal-link")
  @Permissions("vinculaciones_afiliados", "CREATE")
  portalLink(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = PortalLinkSchema.parse(body ?? {});
    return this.vin.createPortalLink(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  /** POST /api/v1/vinculaciones/conductores/background-check */
  @Post("conductores/background-check")
  @Permissions("vinculaciones_conductores", "CREATE")
  backgroundCheck(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = BackgroundCheckSchema.parse(body ?? {});
    return this.vin.backgroundCheck(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  /** POST /api/v1/vinculaciones/vehiculos/validar-ocr */
  @Post("vehiculos/validar-ocr")
  @Permissions("vinculaciones_ocr", "CREATE")
  validarOcr(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = ValidarOcrSchema.parse(body ?? {});
    return this.vin.validarOcr(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  @Post("compliance/expiry-sweep")
  @Permissions("vinculaciones_afiliados", "UPDATE")
  expirySweep(@Req() req: AuthReq) {
    return this.vin.runExpirySweep(req.user.organizationId);
  }
}
