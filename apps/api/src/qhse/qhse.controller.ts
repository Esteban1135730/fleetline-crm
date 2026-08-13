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
import { QhseService } from "./qhse.service";
import { QhseTelemetryService } from "./qhse-telemetry.service";
import {
  CreateSiniestroSchema,
  HuellaCarbonoSchema,
  TelemetryRiskEventSchema,
} from "./dto/qhse.dto";

type AuthReq = {
  user: {
    organizationId: string;
    userId: string;
    role: string;
  };
};

const QHSE_ROLES = [
  "lider_qhse",
  "LIDER_QHSE",
  "qhse",
  "QHSE",
  "org_admin",
  "platform_master",
  "superadmin",
  "gerente_general",
] as const;

/**
 * Módulo 7 — QHSE / Prevención 4.0 (Líder QHSE · Carolina).
 * Prefijos: /api/v1/qhse · /qhse
 */
@Controller(["qhse", "api/v1/qhse"])
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, ModulesGuard)
@RequireModule("qhse", "hqse")
@Roles(...QHSE_ROLES)
export class QhseController {
  constructor(
    private qhse: QhseService,
    private telemetry: QhseTelemetryService,
  ) {}

  @Get("dashboard")
  @Permissions("qhse_pqrs", "READ")
  dashboard(@Req() req: AuthReq) {
    return this.qhse.preventionDashboard(req.user.organizationId);
  }

  /** POST /api/v1/qhse/incidentes/siniestro */
  @Post("incidentes/siniestro")
  @Permissions("qhse_pqrs", "CREATE")
  siniestro(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = CreateSiniestroSchema.parse(body ?? {});
    return this.qhse.createSiniestro(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  /** GET /api/v1/qhse/calidad/nps-summary */
  @Get("calidad/nps-summary")
  @Permissions("qhse_pqrs", "READ")
  npsSummary(@Req() req: AuthReq) {
    return this.qhse.npsSummary(req.user.organizationId);
  }

  /** POST /api/v1/qhse/ambiental/huella-carbono */
  @Post("ambiental/huella-carbono")
  @Permissions("qhse_pqrs", "CREATE")
  huella(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = HuellaCarbonoSchema.parse(body ?? {});
    return this.qhse.huellaCarbono(req.user.organizationId, dto);
  }

  /**
   * Ingesta manual / simulación de evento telemetría (Kafka in-process).
   * POST /api/v1/qhse/telemetria/riesgo
   */
  @Post("telemetria/riesgo")
  @Permissions("qhse_pqrs", "CREATE")
  telemetriaRiesgo(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = TelemetryRiskEventSchema.parse({
      ...(typeof body === "object" && body ? body : {}),
      organizationId: req.user.organizationId,
    });
    return this.telemetry.processRiskEvent(dto);
  }
}
