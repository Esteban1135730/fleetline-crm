import {
  Body,
  Controller,
  Get,
  Post,
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
}
