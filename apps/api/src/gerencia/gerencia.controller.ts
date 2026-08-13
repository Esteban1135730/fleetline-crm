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
import { GerenciaService } from "./gerencia.service";
import {
  CreateApprovalSchema,
  FirmarPinSchema,
  ResolverOverrideSchema,
} from "./dto/gerencia.dto";

type AuthReq = {
  user: { organizationId: string; userId: string; role: string };
};

const GG_ROLES = [
  "gerente_general",
  "GERENTE_GENERAL",
  "presidencia",
  "presidente",
  "org_admin",
  "platform_master",
  "superadmin",
] as const;

/**
 * Módulo 16 — Gerencia General (Mauricio).
 * Prefijos: /gerencia · /api/v1/gerencia
 */
@Controller(["gerencia", "api/v1/gerencia"])
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, ModulesGuard)
@RequireModule("gerencia")
@Roles(...GG_ROLES)
export class GerenciaController {
  constructor(private gerencia: GerenciaService) {}

  @Get("dashboard")
  @Permissions("balance_scorecard", "READ")
  dashboard(@Req() req: AuthReq) {
    return this.gerencia.dashboard(req.user.organizationId);
  }

  @Get("strategy-hub")
  @Permissions("balance_scorecard", "READ")
  strategyHub(@Req() req: AuthReq) {
    return this.gerencia.strategyHub(
      req.user.organizationId,
      req.user.userId,
    );
  }

  /** GET /api/v1/gerencia/balance-scorecard */
  @Get("balance-scorecard")
  @Permissions("balance_scorecard", "READ")
  scorecard(@Req() req: AuthReq) {
    return this.gerencia.balanceScorecard(req.user.organizationId);
  }

  /** POST /api/v1/gerencia/override-gerencial/resolver */
  @Post("override-gerencial/resolver")
  @Permissions("gerencia_override", "UPDATE")
  resolverOverride(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = ResolverOverrideSchema.parse(body ?? {});
    return this.gerencia.resolverOverrideGerencial(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  /** POST /api/v1/gerencia/aprobaciones/firmar-pin */
  @Post("aprobaciones/firmar-pin")
  @Permissions("gerencia_approvals", "UPDATE")
  firmarPin(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = FirmarPinSchema.parse(body ?? {});
    return this.gerencia.firmarAprobacionPin(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  @Post("aprobaciones")
  @Permissions("gerencia_approvals", "CREATE")
  createApproval(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = CreateApprovalSchema.parse(body ?? {});
    return this.gerencia.createApproval(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }
}
