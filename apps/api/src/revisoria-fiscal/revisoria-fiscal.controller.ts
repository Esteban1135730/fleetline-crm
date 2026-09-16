import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ModulesGuard, RequireModule } from "../auth/modules.guard";
import { Roles, RolesGuard } from "../auth/roles.guard";
import { Permissions, PermissionsGuard } from "../auth/permissions.guard";
import { RevisoriaFiscalService } from "./revisoria-fiscal.service";
import {
  FiscalAuditNoteSchema,
  HardLockSchema,
  ImpuestosValidarQuerySchema,
} from "./dto/revisoria-fiscal.dto";
import { streamStoredUpload } from "../security/stream-stored-upload";

type AuthReq = {
  user: { organizationId: string; userId: string; role: string };
};

const RF_ROLES = [
  "revisor_fiscal",
  "REVISOR_FISCAL",
  "revisoria",
  "REVISORIA",
  "presidencia",
  "presidente",
  "org_admin",
  "platform_master",
  "superadmin",
] as const;

/**
 * Módulo 18 — Revisoría Fiscal / Truth Hub (Fernando).
 * Prefijos: /revisoria-fiscal · /api/v1/revisoria-fiscal
 */
@Controller(["revisoria-fiscal", "api/v1/revisoria-fiscal"])
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, ModulesGuard)
@RequireModule("revisoria_fiscal")
@Roles(...RF_ROLES)
export class RevisoriaFiscalController {
  constructor(private revisoria: RevisoriaFiscalService) {}

  @Get("dashboard")
  @Permissions("fiscal_impuestos", "READ")
  dashboard(@Req() req: AuthReq) {
    return this.revisoria.dashboard(req.user.organizationId);
  }

  /** GET /api/v1/revisoria-fiscal/impuestos/validar */
  @Get("impuestos/validar")
  @Permissions("fiscal_impuestos", "READ")
  impuestos(@Req() req: AuthReq, @Query() query: unknown) {
    const q = ImpuestosValidarQuerySchema.parse(query ?? {});
    return this.revisoria.validarImpuestos(
      req.user.organizationId,
      q.yearMonth,
    );
  }

  /** GET /api/v1/revisoria-fiscal/drill-down/:facturaId */
  @Get("drill-down/:facturaId")
  @Permissions("fiscal_drilldown", "READ")
  drillDown(@Req() req: AuthReq, @Param("facturaId") facturaId: string) {
    return this.revisoria.drillDown(req.user.organizationId, facturaId);
  }

  /** Comprobante de factura — solo si pertenece a la org (REV-01 lectura forense) */
  @Get("invoices/:facturaId/support")
  @Permissions("fiscal_drilldown", "READ")
  async streamInvoiceSupport(
    @Req() req: AuthReq,
    @Param("facturaId") facturaId: string,
    @Query("download") download: string | undefined,
    @Res() res: Response,
  ) {
    const meta = await this.revisoria.getInvoiceSupportMeta(
      req.user.organizationId,
      facturaId,
    );
    if (!meta.supportFileRef) {
      throw new BadRequestException("Esta factura no tiene comprobante adjunto");
    }
    streamStoredUpload(res, {
      fileRef: meta.supportFileRef,
      mimeType: meta.supportMimeType,
      originalName: meta.supportOriginalName,
      asAttachment: download === "1" || download === "true",
    });
  }

  /** POST /api/v1/revisoria-fiscal/cierre/hard-lock */
  @Post("cierre/hard-lock")
  @Permissions("fiscal_hard_lock", "CREATE")
  hardLock(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = HardLockSchema.parse(body ?? {});
    return this.revisoria.hardLock(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  @Post("notas")
  @Permissions("fiscal_dictamen", "CREATE")
  nota(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = FiscalAuditNoteSchema.parse(body ?? {});
    return this.revisoria.createAuditNote(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  @Get("export")
  @Permissions("fiscal_impuestos", "READ")
  export(
    @Req() req: AuthReq,
    @Query("format") format?: string,
    @Query("yearMonth") yearMonth?: string,
  ) {
    const fmt =
      format === "json" || format === "xlsx" || format === "csv"
        ? format
        : "csv";
    return this.revisoria.exportLedger(
      req.user.organizationId,
      fmt,
      yearMonth,
    );
  }

  @Get("muestreo")
  @Permissions("fiscal_impuestos", "READ")
  muestreo(@Req() req: AuthReq, @Query("yearMonth") yearMonth?: string) {
    return this.revisoria.sampleTransactions(
      req.user.organizationId,
      yearMonth ||
        `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`,
    );
  }
}
