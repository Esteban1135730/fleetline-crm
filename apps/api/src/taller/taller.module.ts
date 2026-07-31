import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LogisticsModule } from "../logistics/logistics.module";
import { TallerController } from "./taller.controller";
import { TallerService, WorkOrderService } from "./work-order.service";
import { PartDispatchService } from "./part-dispatch.service";
import { TelemetryIngestService } from "./telemetry-ingest.service";

@Module({
  imports: [AuthModule, LogisticsModule],
  controllers: [TallerController],
  providers: [
    TallerService,
    WorkOrderService,
    PartDispatchService,
    TelemetryIngestService,
  ],
  exports: [TallerService, WorkOrderService, PartDispatchService],
})
export class TallerModule {}
