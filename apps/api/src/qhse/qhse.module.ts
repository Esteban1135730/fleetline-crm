import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LogisticsModule } from "../logistics/logistics.module";
import { HqseModule } from "../hqse/hqse.module";
import { QhseController } from "./qhse.controller";
import { QhseService } from "./qhse.service";
import { QhseTelemetryService } from "./qhse-telemetry.service";

@Module({
  imports: [AuthModule, LogisticsModule, HqseModule],
  controllers: [QhseController],
  providers: [QhseService, QhseTelemetryService],
  exports: [QhseService, QhseTelemetryService],
})
export class QhseModule {}
