import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { AuthModule } from "../auth/auth.module";
import { QaTraceController } from "./qa-trace.controller";
import { QaTraceService } from "./qa-trace.service";
import { QaAllowlistGuard } from "./qa-allowlist.guard";
import { QaTraceInterceptor } from "./qa-trace.interceptor";

@Module({
  imports: [AuthModule],
  controllers: [QaTraceController],
  providers: [
    QaTraceService,
    QaAllowlistGuard,
    { provide: APP_INTERCEPTOR, useClass: QaTraceInterceptor },
  ],
  exports: [QaTraceService],
})
export class QaTraceModule {}
