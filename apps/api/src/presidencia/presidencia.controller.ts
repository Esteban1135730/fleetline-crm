import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ModulesGuard, RequireModule } from "../auth/modules.guard";
import { Roles, RolesGuard } from "../auth/roles.guard";
import { Permissions, PermissionsGuard } from "../auth/permissions.guard";
import {
  AllowDirectiveQuery,
  DirectiveReadOnlyGuard,
} from "./directive-readonly.guard";
import { DirectiveReadOnlyInterceptor } from "./directive-readonly.interceptor";
import { PresidenciaService } from "./presidencia.service";
import { TextToSqlAssistantService } from "./text-to-sql-assistant.service";
import { AskAiSchema } from "./dto/ask-ai.dto";
import {
  CapexSimularSchema,
  DefconActivarSchema,
  JarvisVoiceQuerySchema,
} from "./dto/founder.dto";

type AuthReq = {
  user: {
    userId: string;
    organizationId: string;
    role?: string;
    directiveReadOnly?: boolean;
  };
};

const PRES_ROLES = [
  "presidente",
  "PRESIDENTE",
  "presidencia",
  "PRESIDENCIA",
  "gerente_general",
  "GERENTE_GENERAL",
  "gerencia",
  "org_admin",
  "platform_master",
  "superadmin",
] as const;

/**
 * Módulo 12 — Founder's Canvas (Alejandro).
 * Prefijos: /presidencia · /api/v1/presidencia
 */
@Controller(["presidencia", "api/v1/presidencia"])
@UseGuards(
  JwtAuthGuard,
  RolesGuard,
  PermissionsGuard,
  ModulesGuard,
  DirectiveReadOnlyGuard,
)
@UseInterceptors(DirectiveReadOnlyInterceptor)
@RequireModule("presidencia")
@Roles(...PRES_ROLES)
export class PresidenciaController {
  constructor(
    private presidencia: PresidenciaService,
    private textToSql: TextToSqlAssistantService,
  ) {}

  @Get("dashboard")
  @Permissions("founders_canvas", "READ")
  dashboard(@Req() req: AuthReq) {
    return this.presidencia.canvasKpis(
      req.user.organizationId,
      req.user.userId,
    );
  }

  @Get("canvas-kpis")
  @Permissions("founders_canvas", "ANALYZE")
  canvasKpis(@Req() req: AuthReq) {
    return this.presidencia.canvasKpis(
      req.user.organizationId,
      req.user.userId,
    );
  }

  @Get("forensic-export")
  @Permissions("founders_canvas", "READ")
  forensicExport(@Req() req: AuthReq, @Query("hours") hours?: string) {
    const parsed = Number(hours);
    return this.presidencia.forensicExport(
      req.user.organizationId,
      Number.isFinite(parsed) && parsed > 0 ? parsed : 24,
    );
  }

  /** GET /presidencia/margin-exceptions?threshold=0.20 */
  @Get("margin-exceptions")
  @Permissions("founders_canvas", "READ")
  marginExceptions(
    @Req() req: AuthReq,
    @Query("threshold") threshold?: string,
  ) {
    const parsed = Number(threshold);
    return this.presidencia.marginExceptions(
      req.user.organizationId,
      Number.isFinite(parsed) && parsed > 0 && parsed < 1 ? parsed : 0.2,
    );
  }

  @Post("ask-ai")
  @AllowDirectiveQuery()
  @Permissions("jarvis_ai", "CREATE")
  askAi(@Req() req: AuthReq, @Body() body: unknown) {
    const { question } = AskAiSchema.parse(body ?? {});
    return this.textToSql.ask({
      organizationId: req.user.organizationId,
      userId: req.user.userId,
      question,
    });
  }

  /** POST /api/v1/presidencia/jarvis/voice-query */
  @Post("jarvis/voice-query")
  @AllowDirectiveQuery()
  @Permissions("jarvis_ai", "ANALYZE")
  jarvisVoice(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = JarvisVoiceQuerySchema.parse(body ?? {});
    return this.presidencia.jarvisVoiceQuery(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  /** POST /api/v1/presidencia/capex/simular */
  @Post("capex/simular")
  @AllowDirectiveQuery()
  @Permissions("capex_approve", "ANALYZE")
  capexSimular(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = CapexSimularSchema.parse(body ?? {});
    return this.presidencia.simularCapex(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  /** POST /api/v1/presidencia/defcon/activar */
  @Post("defcon/activar")
  @AllowDirectiveQuery()
  @Permissions("defcon_crisis", "CREATE")
  defconActivar(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = DefconActivarSchema.parse(body ?? {});
    return this.presidencia.activarDefcon(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  /** GET /api/v1/presidencia/defcon/active — sesión crisis vigente */
  @Get("defcon/active")
  @AllowDirectiveQuery()
  @Permissions("defcon_crisis", "READ")
  defconActive(@Req() req: AuthReq) {
    return this.presidencia.getActiveDefcon(req.user.organizationId);
  }

  /** POST /api/v1/presidencia/defcon/desactivar — apagar protocolo */
  @Post("defcon/desactivar")
  @AllowDirectiveQuery()
  @Permissions("defcon_crisis", "UPDATE")
  defconDesactivar(@Req() req: AuthReq) {
    return this.presidencia.desactivarDefcon(
      req.user.organizationId,
      req.user.userId,
    );
  }
}
