import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuthModule } from "../auth/auth.module";
import { RevisoriaFiscalController } from "./revisoria-fiscal.controller";
import { RevisoriaFiscalService } from "./revisoria-fiscal.service";
import { PeriodHardLockGuard } from "./period-hard-lock.guard";

@Module({
  imports: [AuthModule],
  controllers: [RevisoriaFiscalController],
  providers: [
    RevisoriaFiscalService,
    PeriodHardLockGuard,
    { provide: APP_GUARD, useClass: PeriodHardLockGuard },
  ],
  exports: [RevisoriaFiscalService, PeriodHardLockGuard],
})
export class RevisoriaFiscalModule {}
