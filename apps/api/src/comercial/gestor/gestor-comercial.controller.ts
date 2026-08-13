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
import { GestorComercialService } from "./gestor-comercial.service";
import {
  ConfirmarPagoTesoreriaSchema,
  CotizacionExpressSchema,
  LinkCobroAnticipadoSchema,
  RegistrarLlamadaSchema,
} from "./dto/gestor-comercial.dto";

type AuthReq = {
  user: { organizationId: string; userId: string; role: string };
};

const GESTOR_ROLES = [
  "gestor_comercial",
  "GESTOR_COMERCIAL",
  "director_comercial",
  "coordinador_comercial",
  "org_admin",
  "platform_master",
  "superadmin",
] as const;

/**
 * Módulo 14.1 — Sales Execution Hub (Valentina).
 * Prefijos: /comercial/gestor · /api/v1/comercial/gestor
 */
@Controller(["comercial/gestor", "api/v1/comercial/gestor"])
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, ModulesGuard)
@RequireModule("comercial")
@Roles(...GESTOR_ROLES)
export class GestorComercialController {
  constructor(private gestor: GestorComercialService) {}

  @Get("dashboard")
  @Permissions("crm_comercial", "READ")
  dashboard(@Req() req: AuthReq) {
    return this.gestor.dashboard(req.user.organizationId, req.user.userId);
  }

  /** POST /api/v1/comercial/gestor/cotizacion-express */
  @Post("cotizacion-express")
  @Permissions("crm_comercial", "CREATE")
  cotizacionExpress(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = CotizacionExpressSchema.parse(body ?? {});
    return this.gestor.cotizacionExpress(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  /** POST /api/v1/comercial/gestor/link-cobro-anticipado */
  @Post("link-cobro-anticipado")
  @Permissions("crm_comercial", "CREATE")
  linkCobro(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = LinkCobroAnticipadoSchema.parse(body ?? {});
    return this.gestor.linkCobroAnticipado(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  /** POST /api/v1/comercial/gestor/registrar-llamada */
  @Post("registrar-llamada")
  @Permissions("crm_comercial", "CREATE")
  registrarLlamada(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = RegistrarLlamadaSchema.parse(body ?? {});
    return this.gestor.registrarLlamada(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  /** Confirmación Tesorería (desbloquea Despacho) — roles tesorería vía director/org */
  @Post("confirmar-pago-tesoreria")
  @Permissions("crm_comercial", "UPDATE")
  confirmarPago(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = ConfirmarPagoTesoreriaSchema.parse(body ?? {});
    return this.gestor.confirmarPagoTesoreria(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }
}
