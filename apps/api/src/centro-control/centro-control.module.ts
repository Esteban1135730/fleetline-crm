import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LogisticsModule } from "../logistics/logistics.module";
import { CentroControlController } from "./centro-control.controller";
import { CentroControlService } from "./centro-control.service";

@Module({
  imports: [AuthModule, LogisticsModule],
  controllers: [CentroControlController],
  providers: [CentroControlService],
  exports: [CentroControlService],
})
export class CentroControlModule {}
