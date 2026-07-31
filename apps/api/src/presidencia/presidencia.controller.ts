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
import {
  AllowDirectiveQuery,
  DirectiveReadOnlyGuard,
} from "./directive-readonly.guard";
import { DirectiveReadOnlyInterceptor } from "./directive-readonly.interceptor";
import { PresidenciaService } from "./presidencia.service";
import { TextToSqlAssistantService } from "./text-to-sql-assistant.service";
import { AskAiSchema } from "./dto/ask-ai.dto";

type AuthReq = {
  user: {
    userId: string;
    organizationId: string;
    role?: string;
    directiveReadOnly?: boolean;
  };
};

@Controller("presidencia")
@UseGuards(JwtAuthGuard, ModulesGuard, DirectiveReadOnlyGuard)
@UseInterceptors(DirectiveReadOnlyInterceptor)
@RequireModule("presidencia")
export class PresidenciaController {
  constructor(
    private presidencia: PresidenciaService,
    private textToSql: TextToSqlAssistantService,
  ) {}

  @Get("canvas-kpis")
  canvasKpis(@Req() req: AuthReq) {
    return this.presidencia.canvasKpis(
      req.user.organizationId,
      req.user.userId,
    );
  }

  @Post("ask-ai")
  @AllowDirectiveQuery()
  askAi(@Req() req: AuthReq, @Body() body: unknown) {
    const { question } = AskAiSchema.parse(body ?? {});
    return this.textToSql.ask({
      organizationId: req.user.organizationId,
      userId: req.user.userId,
      question,
    });
  }
}
