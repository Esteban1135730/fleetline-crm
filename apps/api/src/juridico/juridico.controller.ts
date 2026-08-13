import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ModulesGuard, RequireModule } from "../auth/modules.guard";
import { Roles, RolesGuard } from "../auth/roles.guard";
import { Permissions, PermissionsGuard } from "../auth/permissions.guard";
import { JuridicoService } from "./juridico.service";
import {
  ContractCommentSchema,
  DisciplinaryMemoSchema,
  SarlaftConsultaListasSchema,
  SmartScanSchema,
} from "./dto/juridico.dto";

type AuthReq = {
  user: { organizationId: string; userId: string; role: string };
};

const LEGAL_ROLES = [
  "director_juridico",
  "DIRECTOR_JURIDICO",
  "juridico",
  "JURIDICO",
  "gerente_general",
  "GERENTE_GENERAL",
  "presidencia",
  "presidente",
  "org_admin",
  "platform_master",
  "superadmin",
] as const;

/**
 * Módulo 17 — Jurídico / Legal Hub 4.0 (Sofía).
 * Prefijos: /juridico · /api/v1/juridico
 */
@Controller(["juridico", "api/v1/juridico"])
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, ModulesGuard)
@RequireModule("juridico")
@Roles(...LEGAL_ROLES)
export class JuridicoController {
  constructor(private juridico: JuridicoService) {}

  @Get("dashboard")
  @Permissions("legal_contracts", "READ")
  dashboard(@Req() req: AuthReq) {
    return this.juridico.dashboard(req.user.organizationId);
  }

  /** POST /api/v1/juridico/contratos/smart-scan */
  @Post("contratos/smart-scan")
  @Permissions("legal_contracts", "CREATE")
  smartScan(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = SmartScanSchema.parse(body ?? {});
    return this.juridico.smartScan(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  @Post("contratos/comentario")
  @Permissions("legal_contracts", "UPDATE")
  comment(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = ContractCommentSchema.parse(body ?? {});
    return this.juridico.addContractComment(req.user.organizationId, dto);
  }

  /** GET /api/v1/juridico/expediente-probatorio/:placa */
  @Get("expediente-probatorio/:placa")
  @Permissions("legal_evidence", "READ")
  expediente(@Req() req: AuthReq, @Param("placa") placa: string) {
    return this.juridico.expedienteProbatorio(
      req.user.organizationId,
      placa,
      req.user.userId,
    );
  }

  /** POST /api/v1/juridico/sarlaft/consulta-listas */
  @Post("sarlaft/consulta-listas")
  @Permissions("legal_sarlaft", "CREATE")
  consultaListas(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = SarlaftConsultaListasSchema.parse(body ?? {});
    return this.juridico.consultaListas(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  @Post("disciplinario/memorando")
  @Permissions("legal_litigation", "CREATE")
  memorando(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = DisciplinaryMemoSchema.parse(body ?? {});
    return this.juridico.memorandoDescargos(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }
}
