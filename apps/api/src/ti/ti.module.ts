import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LogisticsModule } from "../logistics/logistics.module";
import { TiController } from "./ti.controller";
import { NocMonitoringService } from "./noc-monitoring.service";
import { KafkaDlqMonitor } from "./kafka-dlq.monitor";
import { SttsEngineService } from "./stts-engine.service";

@Module({
  imports: [AuthModule, LogisticsModule],
  controllers: [TiController],
  providers: [NocMonitoringService, KafkaDlqMonitor, SttsEngineService],
  exports: [NocMonitoringService, KafkaDlqMonitor, SttsEngineService],
})
export class TiModule {}
