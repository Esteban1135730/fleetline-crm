import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LogisticsController } from "./logistics.controller";
import { LogisticsService } from "./logistics.service";
import { LogisticsGateway } from "./logistics.gateway";
import { ComplianceService } from "./compliance.service";

@Module({
  imports: [AuthModule],
  controllers: [LogisticsController],
  providers: [LogisticsService, LogisticsGateway, ComplianceService],
  exports: [LogisticsService, ComplianceService],
})
export class LogisticsModule {}
