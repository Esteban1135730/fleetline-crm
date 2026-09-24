import {
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
import { SarlaftAlertStatus } from "@fsg/db";
import type { Response } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ModulesGuard, RequireModule } from "../auth/modules.guard";
import { Roles, RolesGuard } from "../auth/roles.guard";
import { SarlaftScreeningService } from "./sarlaft-screening.service";
import {
  LiberarBloqueoSchema,
  ResolveAlertSchema,
  ScreenEntitySchema,
} from "./dto/sarlaft.dto";

type AuthReq = {
  user: { organizationId: string; userId: string; role: string };
};

function parseAlertStatus(raw?: string): SarlaftAlertStatus | undefined {
  if (!raw) return undefined;
  const u = String(raw).toUpperCase();
  /** Alias UI: OPEN = alertas pendientes de Oficial */
  if (u === "OPEN") return undefined;
  if (
    u === "PENDING" ||
    u === "UNDER_REVIEW" ||
    u === "RESOLVED" ||
    u === "DISMISSED"
  ) {
    return u as SarlaftAlertStatus;
  }
  return undefined;
}

@Controller("sarlaft")
@UseGuards(JwtAuthGuard, ModulesGuard)
@RequireModule("sarlaft")
export class SarlaftController {
  constructor(private screening: SarlaftScreeningService) {}

  @Post("screen")
  screen(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = ScreenEntitySchema.parse(body ?? {});
    return this.screening.screenManual(
      req.user.organizationId,
      dto,
      req.user.userId,
    );
  }

  @Get("alerts")
  alerts(
    @Req() req: AuthReq,
    @Query("status") status?: string,
  ) {
    return this.screening.listAlerts(
      req.user.organizationId,
      parseAlertStatus(status),
    );
  }

  /** GET /sarlaft/bloqueados — maestros con sarlaftBlocked */
  @Get("bloqueados")
  bloqueados(@Req() req: AuthReq) {
    return this.screening.listBlocked(req.user.organizationId);
  }

  /** POST /sarlaft/bloqueados/liberar — justificación + clearBlock */
  @Post("bloqueados/liberar")
  liberar(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = LiberarBloqueoSchema.parse(body ?? {});
    return this.screening.liberarBloqueo(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  @Post("alerts/:id/resolve")
  @UseGuards(RolesGuard)
  @Roles(
    "control_interno",
    "auditor_control_interno",
    "director_juridico",
    "juridico",
    "org_admin",
  )
  resolve(
    @Req() req: AuthReq,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const dto = ResolveAlertSchema.parse(body ?? {});
    return this.screening.resolveAlert(
      req.user.organizationId,
      id,
      req.user.userId,
      dto,
      req.user.role,
    );
  }

  /** SCRUM-83 — certificado PDF de consulta SARLAFT */
  @Get("checks/:id/certificate")
  async certificate(
    @Req() req: AuthReq,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    const cert = await this.screening.buildCertificatePdf(
      req.user.organizationId,
      id,
    );
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${cert.filename}"`,
    );
    res.setHeader("X-Sarlaft-Sha256", cert.sha256);
    res.send(cert.buffer);
  }
}
