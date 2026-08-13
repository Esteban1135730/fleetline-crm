import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ModulesGuard, RequireModule } from "../auth/modules.guard";
import { Roles, RolesGuard } from "../auth/roles.guard";
import { Permissions, PermissionsGuard } from "../auth/permissions.guard";
import { ControlInternoService } from "./control-interno.service";
import {
  AuditLogQuerySchema,
  BankAccountChangeSchema,
  CrearHallazgoSchema,
  SmartAuditQuerySchema,
} from "./dto/control-interno.dto";

type AuthReq = {
  user: { organizationId: string; userId: string; role: string };
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
};

const CI_ROLES = [
  "auditor_control_interno",
  "AUDITOR_CONTROL_INTERNO",
  "control_interno",
  "CONTROL_INTERNO",
  "revisor_fiscal",
  "org_admin",
  "platform_master",
  "superadmin",
] as const;

/**
 * Módulo 11 — Forensic Compliance Hub (Marta).
 * Prefijos: /control-interno · /api/v1/control-interno
 *
 * INMUTABILIDAD: no existen endpoints UPDATE/DELETE sobre AuditLog.
 */
@Controller(["control-interno", "api/v1/control-interno"])
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, ModulesGuard)
@RequireModule("revisoria_fiscal")
@Roles(...CI_ROLES)
export class ControlInternoController {
  constructor(private ci: ControlInternoService) {}

  @Get("dashboard")
  @Permissions("audit_forense", "AUDIT")
  dashboard(@Req() req: AuthReq) {
    return this.ci.dashboard(req.user.organizationId);
  }

  /** GET /api/v1/control-interno/audit-log — solo lectura */
  @Get("audit-log")
  @Permissions("audit_forense", "READ")
  auditLog(@Req() req: AuthReq, @Query() query: Record<string, string>) {
    const dto = AuditLogQuerySchema.parse(query ?? {});
    return this.ci.auditLog(req.user.organizationId, dto);
  }

  /** POST /api/v1/control-interno/hallazgos/crear */
  @Post("hallazgos/crear")
  @Permissions("hallazgos_ci", "CREATE")
  crearHallazgo(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = CrearHallazgoSchema.parse(body ?? {});
    return this.ci.crearHallazgo(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  /** GET /api/v1/control-interno/combustible/smart-audit */
  @Get("combustible/smart-audit")
  @Permissions("smart_audit_fuel", "READ")
  smartAudit(@Req() req: AuthReq, @Query() query: Record<string, string>) {
    const dto = SmartAuditQuerySchema.parse(query ?? {});
    return this.ci.smartAuditCombustible(req.user.organizationId, dto);
  }

  @Post("proveedor/cambio-cuenta")
  @Permissions("hallazgos_ci", "CREATE")
  cambioCuenta(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = BankAccountChangeSchema.parse(body ?? {});
    const ip =
      dto.ipAddress ||
      req.ip ||
      String(req.headers?.["x-forwarded-for"] || "") ||
      undefined;
    return this.ci.onSupplierBankAccountChange(
      req.user.organizationId,
      req.user.userId,
      { ...dto, ipAddress: ip },
    );
  }

  @Post("overrides/consolidar-diario")
  @Permissions("hallazgos_ci", "CREATE")
  consolidarOverrides(@Req() req: AuthReq) {
    return this.ci.consolidarOverridesDiarios(
      req.user.organizationId,
      req.user.userId,
    );
  }
}
