import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LogisticsModule } from "../logistics/logistics.module";
import { RrhhController } from "./rrhh.controller";
import { RrhhService } from "./rrhh.service";
import { FatigueManagementService } from "./fatigue-management.service";
import { PayrollService } from "./payroll.service";

@Module({
  imports: [AuthModule, LogisticsModule],
  controllers: [RrhhController],
  providers: [RrhhService, FatigueManagementService, PayrollService],
  exports: [RrhhService, FatigueManagementService, PayrollService],
})
export class RrhhModule {}
