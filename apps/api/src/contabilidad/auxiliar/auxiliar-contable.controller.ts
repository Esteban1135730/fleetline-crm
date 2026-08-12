import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { ModulesGuard, RequireModule } from "../../auth/modules.guard";
import { Roles, RolesGuard } from "../../auth/roles.guard";
import { Permissions, PermissionsGuard } from "../../auth/permissions.guard";
import { AuxiliarContableService } from "./auxiliar-contable.service";
import {
  ConciliacionAutoMatchSchema,
  LegalizacionCerrarSchema,
  ThreeWayMatchSchema,
} from "./dto/auxiliar.dto";

type AuthReq = {
  user: { organizationId: string; userId: string; role: string };
};

const AUX_ROLES = [
  "auxiliar_contable",
  "AUXILIAR_CONTABLE",
  "gestor_contable",
  "director_financiero",
  "org_admin",
  "platform_master",
  "gerente_general",
] as const;

@Controller([
  "contabilidad",
  "api/v1/contabilidad",
  "contabilidad/auxiliar",
  "api/v1/contabilidad/auxiliar",
])
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, ModulesGuard)
@RequireModule("contabilidad")
@Roles(...AUX_ROLES)
export class AuxiliarContableController {
  constructor(private auxiliar: AuxiliarContableService) {}

  @Get("auxiliar/dashboard")
  @Permissions("cxp_proveedores", "READ")
  dashboard(@Req() req: AuthReq) {
    return this.auxiliar.dashboard(req.user.organizationId, req.user.userId);
  }

  /** Alias sin prefijo auxiliar — dashboard */
  @Get("dashboard")
  @Permissions("cxp_proveedores", "READ")
  dashboardAlias(@Req() req: AuthReq) {
    return this.dashboard(req);
  }

  /** POST /api/v1/contabilidad/facturas/3way-match */
  @Post("facturas/3way-match")
  @Permissions("cxp_proveedores", "UPDATE")
  threeWayMatch(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = ThreeWayMatchSchema.parse(body ?? {});
    return this.auxiliar.runThreeWayMatch(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  /** POST /api/v1/contabilidad/legalizaciones/cerrar */
  @Post("legalizaciones/cerrar")
  @Permissions("legalizacion_gastos", "UPDATE")
  cerrarLegalizacion(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = LegalizacionCerrarSchema.parse(body ?? {});
    return this.auxiliar.cerrarLegalizacion(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  /** POST /api/v1/contabilidad/conciliacion/auto-match */
  @Post("conciliacion/auto-match")
  @Permissions("conciliacion_bancaria", "CREATE")
  autoMatch(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = ConciliacionAutoMatchSchema.parse(body ?? {});
    return this.auxiliar.autoMatchConciliacion(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  /** PUC — denegado explícito para auxiliar (403 vía path + permission) */
  @Get("puc")
  @Permissions("puc", "READ")
  pucDenied() {
    return { accounts: [] };
  }

  @Post("puc")
  @Permissions("puc", "CREATE")
  pucCreateDenied() {
    return { ok: false };
  }
}
