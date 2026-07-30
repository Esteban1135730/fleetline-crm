import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LogisticsController } from "./logistics.controller";
import { LogisticsService } from "./logistics.service";
import { LogisticsGateway } from "./logistics.gateway";

@Module({
  imports: [AuthModule],
  controllers: [LogisticsController],
  providers: [LogisticsService, LogisticsGateway],
  exports: [LogisticsService],
})
export class LogisticsModule {}
