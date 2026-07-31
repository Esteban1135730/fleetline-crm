import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { AuthModule } from "../auth/auth.module";
import { DirectiveReadOnlyGuard } from "./directive-readonly.guard";
import { DirectiveReadOnlyInterceptor } from "./directive-readonly.interceptor";
import { ExecutiveKpiService } from "./executive-kpi.service";
import { PresidenciaController } from "./presidencia.controller";
import { PresidenciaService } from "./presidencia.service";
import { TextToSqlAssistantService } from "./text-to-sql-assistant.service";

@Module({
  imports: [AuthModule],
  controllers: [PresidenciaController],
  providers: [
    PresidenciaService,
    ExecutiveKpiService,
    TextToSqlAssistantService,
    DirectiveReadOnlyGuard,
    DirectiveReadOnlyInterceptor,
    { provide: APP_GUARD, useClass: DirectiveReadOnlyGuard },
    { provide: APP_INTERCEPTOR, useClass: DirectiveReadOnlyInterceptor },
  ],
  exports: [
    PresidenciaService,
    ExecutiveKpiService,
    TextToSqlAssistantService,
    DirectiveReadOnlyGuard,
  ],
})
export class PresidenciaModule {}
