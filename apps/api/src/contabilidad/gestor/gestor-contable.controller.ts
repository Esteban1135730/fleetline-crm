import { Body, Controller, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { ModulesGuard, RequireModule } from "../../auth/modules.guard";
import { Roles, RolesGuard } from "../../auth/roles.guard";
import { Permissions, PermissionsGuard } from "../../auth/permissions.guard";
import { GestorContableService } from "./gestor-contable.service";
import {
  AprobarGastoRutaSchema,
  EmitirDianSchema,
  SincronizarTallerSchema,
} from "./dto/gestor.dto";

type AuthReq = {
  user: { organizationId: string; userId: string; role: string };
};

const GESTOR_ROLES = [
  "gestor_contable",
  "GESTOR_CONTABLE",
  "director_financiero",
  "org_admin",
  "platform_master",
  "gerente_general",
] as const;

@Controller([
  "contabilidad",
  "api/v1/contabilidad",
  "contabilidad/gestor",
  "api/v1/contabilidad/gestor",
])
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, ModulesGuard)
@RequireModule("contabilidad")
@Roles(...GESTOR_ROLES)
export class GestorContableController {
  constructor(private gestor: GestorContableService) {}

  @Get("gestor/dashboard")
  @Permissions("contabilidad", "READ")
  dashboard(@Req() req: AuthReq) {
    return this.gestor.dashboard(req.user.organizationId);
  }

  /** POST /api/v1/contabilidad/gastos-ruta/aprobar */
  @Post("gastos-ruta/aprobar")
  @Permissions("gastos_ruta", "UPDATE")
  aprobarGasto(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = AprobarGastoRutaSchema.parse(body ?? {});
    return this.gestor.aprobarGastoRuta(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  /** POST /api/v1/contabilidad/facturacion/emitir-dian */
  @Post("facturacion/emitir-dian")
  @Permissions("facturacion_electronica", "CREATE")
  emitirDian(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = EmitirDianSchema.parse(body ?? {});
    return this.gestor.emitirDian(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  /** POST /api/v1/contabilidad/cierre/sincronizar-taller */
  @Post("cierre/sincronizar-taller")
  @Permissions("contabilidad", "CREATE")
  syncTaller(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = SincronizarTallerSchema.parse(body ?? {});
    return this.gestor.sincronizarTaller(req.user.organizationId, dto);
  }

  @Get("libro-diario")
  @Permissions("contabilidad", "READ")
  libro(
    @Req() req: AuthReq,
    @Query("plate") _plate?: string,
    @Query("account") _account?: string,
  ) {
    return this.gestor.dashboard(req.user.organizationId).then((d) => d.libroDiario);
  }
}
