import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { ModulesGuard, RequireModule } from "../../auth/modules.guard";
import { Roles, RolesGuard } from "../../auth/roles.guard";
import { Permissions, PermissionsGuard } from "../../auth/permissions.guard";
import { CfoService } from "./cfo.service";
import {
  CfoDispersarMfaSchema,
  SimularRentabilidadSchema,
} from "./dto/cfo.dto";

type AuthReq = {
  user: {
    organizationId: string;
    userId: string;
    role: string;
    email?: string;
  };
};

const CFO_ROLES = [
  "director_financiero",
  "DIRECTOR_FINANCIERO",
  "org_admin",
  "platform_master",
  "superadmin",
  "gerente_general",
] as const;

/**
 * Módulo 6 — CFO Hub (Dirección Financiera).
 * Prefijos: /api/v1/finanzas/cfo · /finanzas/cfo
 */
@Controller(["finanzas/cfo", "api/v1/finanzas/cfo"])
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, ModulesGuard)
@RequireModule("tesoreria", "finanzas", "contabilidad")
@Roles(...CFO_ROLES)
export class CfoController {
  constructor(private cfo: CfoService) {}

  @Get("dashboard")
  @Permissions("finanzas", "READ")
  dashboard(@Req() req: AuthReq) {
    return this.cfo.dashboard(req.user.organizationId);
  }

  /** POST /api/v1/finanzas/cfo/dispersar/mfa-verify */
  @Post("dispersar/mfa-verify")
  @Permissions("tesoreria_dispersion", "CREATE")
  mfaVerify(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = CfoDispersarMfaSchema.parse(body ?? {});
    return this.cfo.dispersarConMfa(
      req.user.organizationId,
      req.user.userId,
      req.user.email,
      dto,
    );
  }

  /** POST /api/v1/finanzas/cfo/contratos/simular-rentabilidad */
  @Post("contratos/simular-rentabilidad")
  @Permissions("contratos", "READ")
  simular(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = SimularRentabilidadSchema.parse(body ?? {});
    return this.cfo.simularRentabilidad(req.user.organizationId, dto);
  }

  /** GET /api/v1/finanzas/cfo/flota/costeo-placa/:placa */
  @Get("flota/costeo-placa/:placa")
  @Permissions("finanzas", "READ")
  costeoPlaca(@Req() req: AuthReq, @Param("placa") placa: string) {
    return this.cfo.costeoPlaca(req.user.organizationId, placa);
  }
}
