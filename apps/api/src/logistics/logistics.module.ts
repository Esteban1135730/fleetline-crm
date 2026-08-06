import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ComercialModule } from "../comercial/comercial.module";
import { LogisticsController } from "./logistics.controller";
import { LogisticsService } from "./logistics.service";
import { LogisticsGateway } from "./logistics.gateway";
import { ComplianceService } from "./compliance.service";
import { ComplianceGateService } from "./compliance-gate.service";
import { ComplianceGuard } from "./compliance.guard";
import { KafkaEventsService } from "./kafka-events.service";

@Module({
  imports: [AuthModule, forwardRef(() => ComercialModule)],
  controllers: [LogisticsController],
  providers: [
    LogisticsService,
    LogisticsGateway,
    ComplianceService,
    ComplianceGateService,
    ComplianceGuard,
    KafkaEventsService,
  ],
  exports: [
    LogisticsService,
    LogisticsGateway,
    ComplianceService,
    ComplianceGateService,
    KafkaEventsService,
  ],
})
export class LogisticsModule {}
