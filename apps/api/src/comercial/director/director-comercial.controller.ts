import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { ModulesGuard, RequireModule } from "../../auth/modules.guard";
import { Roles, RolesGuard } from "../../auth/roles.guard";
import { Permissions, PermissionsGuard } from "../../auth/permissions.guard";
import { DirectorComercialService } from "./director-comercial.service";
import { QuotePdfService } from "../quote-pdf.service";
import {
  CotizarSchema,
  CreateDealSchema,
  FirmarDocusignSchema,
  UpdateDealSchema,
} from "./dto/director-comercial.dto";

type AuthReq = {
  user: { organizationId: string; userId: string; role: string };
};

const DIR_COM_ROLES = [
  "director_comercial",
  "DIRECTOR_COMERCIAL",
  "coordinador_comercial",
  "gestor_comercial",
  "org_admin",
  "platform_master",
  "superadmin",
  "gerente_general",
] as const;

/**
 * Módulo 14 — Dirección Comercial (Felipe).
 * Prefijos: /comercial/director · /api/v1/comercial/director
 */
@Controller(["comercial/director", "api/v1/comercial/director"])
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, ModulesGuard)
@RequireModule("comercial")
@Roles(...DIR_COM_ROLES)
export class DirectorComercialController {
  constructor(
    private director: DirectorComercialService,
    private readonly quotesPdf: QuotePdfService,
  ) {}

  @Get("dashboard")
  @Permissions("crm_comercial", "READ")
  dashboard(@Req() req: AuthReq) {
    return this.director.dashboard(req.user.organizationId);
  }

  @Post("deals")
  @Permissions("crm_comercial", "CREATE")
  createDeal(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = CreateDealSchema.parse(body ?? {});
    return this.director.createDeal(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  /** PATCH /api/v1/comercial/director/deals/:id — etapa / ficha */
  @Patch("deals/:id")
  @Permissions("crm_comercial", "UPDATE")
  updateDeal(
    @Req() req: AuthReq,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const dto = UpdateDealSchema.parse(body ?? {});
    return this.director.updateDeal(req.user.organizationId, id, dto);
  }

  /** POST /api/v1/comercial/director/cotizar */
  @Post("cotizar")
  @Permissions("crm_comercial", "CREATE")
  cotizar(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = CotizarSchema.parse(body ?? {});
    return this.director.cotizar(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  /** POST /api/v1/comercial/director/contrato/firmar-docusign */
  @Post("contrato/firmar-docusign")
  @Permissions("contratos", "CREATE")
  firmarDocusign(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = FirmarDocusignSchema.parse(body ?? {});
    return this.director.firmarDocusign(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  /** GET /api/v1/comercial/director/quotes/:id/pdf */
  @Get("quotes/:id/pdf")
  @Permissions("crm_comercial", "READ")
  async downloadQuotePdf(
    @Req() req: AuthReq,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    const { buffer, pdfRef } = await this.quotesPdf.generateIntelligentQuotePdf(
      req.user.organizationId,
      id,
    );
    const filename = pdfRef.split("/").pop() ?? "oferta.pdf";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`,
    );
    res.send(buffer);
  }

  /** GET /api/v1/comercial/director/renovaciones-radar */
  @Get("renovaciones-radar")
  @Permissions("contratos", "READ")
  renovacionesRadar(@Req() req: AuthReq) {
    return this.director.renovacionesRadar(req.user.organizationId);
  }
}
