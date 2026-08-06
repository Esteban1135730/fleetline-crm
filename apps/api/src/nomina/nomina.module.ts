import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NominaController } from "./nomina.controller";
import { NominaExportService } from "./nomina-export.service";
import { NominaReportService } from "./nomina-report.service";

@Module({
  imports: [AuthModule],
  controllers: [NominaController],
  providers: [NominaReportService, NominaExportService],
  exports: [NominaReportService],
})
export class NominaModule {}
