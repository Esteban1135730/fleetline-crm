import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LogisticsModule } from "../logistics/logistics.module";
import { ControlInternoController } from "./control-interno.controller";
import { ControlInternoService } from "./control-interno.service";

@Module({
  imports: [AuthModule, LogisticsModule],
  controllers: [ControlInternoController],
  providers: [ControlInternoService],
  exports: [ControlInternoService],
})
export class ControlInternoModule {}
