import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LogisticsModule } from "../logistics/logistics.module";
import { EscolarController } from "./escolar.controller";
import { SchoolRouteService } from "./school-route.service";
import { ParentsTrackingService } from "./parents-tracking.service";
import { EscolarGateway } from "./escolar.gateway";

@Module({
  imports: [AuthModule, LogisticsModule],
  controllers: [EscolarController],
  providers: [
    SchoolRouteService,
    ParentsTrackingService,
    EscolarGateway,
  ],
  exports: [SchoolRouteService, ParentsTrackingService],
})
export class EscolarModule {}
