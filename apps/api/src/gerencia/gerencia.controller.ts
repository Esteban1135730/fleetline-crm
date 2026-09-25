import {
  Body,
  Controller,
  Get,
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
  dashboard(
    @Req() req: AuthReq,
    @Query("period") period?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    const p =
      period === "day" ||
      period === "week" ||
      period === "month" ||
      period === "year"
        ? period
        : "month";
    return this.gerencia.dashboard(req.user.organizationId, p, from, to);
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

  /** CxP abiertas — detalle SlideOver */
  @Get("cxp-open")
  @Permissions("balance_scorecard", "READ")
  cxpOpen(
    @Req() req: AuthReq,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.gerencia.listOpenPayables(
      req.user.organizationId,
      from,
      to,
    );
  }

  /** Vehículos bloqueados (compliance) — placa + motivo */
  @Get("dispatch-blocks")
  @Permissions("balance_scorecard", "READ")
  dispatchBlocks(@Req() req: AuthReq) {
    return this.gerencia.listDispatchBlockVehicles(req.user.organizationId);
  }

  /** OT abiertas — detalle SlideOver */
  @Get("work-orders-open")
  @Permissions("balance_scorecard", "READ")
  workOrdersOpen(
    @Req() req: AuthReq,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.gerencia.listOpenWorkOrdersDetail(
      req.user.organizationId,
      from,
      to,
    );
  }

  /** Aging CxC — facturas por bucket (0-15 | 16-30 | 31-60 | gt60) */
  @Get("cxc-aging")
  @Permissions("balance_scorecard", "READ")
  cxcAging(
    @Req() req: AuthReq,
    @Query("bucket") bucket?: string,
  ) {
    const raw = (bucket ?? "").trim();
    // Compat: antiguos clientes enviaban "60+" (el + llega como espacio)
    const normalized =
      raw === "60+" || raw === "60" || raw === ">60" ? "gt60" : raw;
    const b =
      normalized === "0-15" ||
      normalized === "16-30" ||
      normalized === "31-60" ||
      normalized === "gt60"
        ? (normalized as "0-15" | "16-30" | "31-60" | "gt60")
        : undefined;
    return this.gerencia.listCxcAgingInvoices(req.user.organizationId, b);
  }

  /** Reporte de turno diario (JSON) — día America/Bogota */
  @Get("shift-report")
  @Permissions("balance_scorecard", "READ")
  shiftReport(@Req() req: AuthReq, @Query("date") date?: string) {
    return this.gerencia.buildShiftReport(
      req.user.organizationId,
      req.user.userId,
      date,
    );
  }

  /** Reporte de turno — PDF (pdfkit) */
  @Get("shift-report.pdf")
  @Permissions("balance_scorecard", "READ")
  async shiftReportPdf(
    @Req() req: AuthReq,
    @Res() res: Response,
    @Query("date") date?: string,
  ) {
    const out = await this.gerencia.buildShiftReportPdf(
      req.user.organizationId,
      req.user.userId,
      date,
    );
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${out.filename}"`,
    );
    res.send(out.buffer);
  }
}
