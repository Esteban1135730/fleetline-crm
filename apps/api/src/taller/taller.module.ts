import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LogisticsModule } from "../logistics/logistics.module";
import { PrismaModule } from "../prisma/prisma.module";
import { TallerController } from "./taller.controller";
import { TallerService, WorkOrderService } from "./work-order.service";
import { PartDispatchService } from "./part-dispatch.service";
import { TelemetryIngestService } from "./telemetry-ingest.service";
import { MechanicService } from "./mechanic.service";

@Module({
  imports: [AuthModule, LogisticsModule, PrismaModule],
  controllers: [TallerController],
  providers: [
    TallerService,
    WorkOrderService,
    PartDispatchService,
    TelemetryIngestService,
    MechanicService,
  ],
  exports: [
    TallerService,
    WorkOrderService,
    PartDispatchService,
    MechanicService,
  ],
})
export class TallerModule {}
