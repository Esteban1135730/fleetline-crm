import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LogisticsModule } from "../logistics/logistics.module";
import { HqseController } from "./hqse.controller";
import { HqseIncidentService } from "./hqse-incident.service";
import { PesvComplianceService } from "./pesv-compliance.service";

@Module({
  imports: [AuthModule, LogisticsModule],
  controllers: [HqseController],
  providers: [HqseIncidentService, PesvComplianceService],
  exports: [HqseIncidentService, PesvComplianceService],
})
export class HqseModule {}
