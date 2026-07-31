import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LogisticsModule } from "../logistics/logistics.module";
import { TallerModule } from "../taller/taller.module";
import { PatioController } from "./patio.controller";
import { YardAccessService } from "./yard-access.service";
import { PhysicalInspectionService } from "./physical-inspection.service";

@Module({
  imports: [AuthModule, LogisticsModule, TallerModule],
  controllers: [PatioController],
  providers: [YardAccessService, PhysicalInspectionService],
  exports: [YardAccessService, PhysicalInspectionService],
})
export class PatioModule {}
