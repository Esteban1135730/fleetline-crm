import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LogisticsModule } from "../logistics/logistics.module";
import { SarlaftModule } from "../sarlaft/sarlaft.module";
import { ComprasController } from "./compras.controller";
import { ComprasService } from "./compras.service";
import { SmartProcurementService } from "./smart-procurement.service";
import { ThreeWayMatchingService } from "./three-way-matching.service";
import { InvoiceDocumentListener } from "./invoice-document.listener";

@Module({
  imports: [AuthModule, LogisticsModule, SarlaftModule],
  controllers: [ComprasController],
  providers: [
    ComprasService,
    SmartProcurementService,
    ThreeWayMatchingService,
    InvoiceDocumentListener,
  ],
  exports: [ComprasService, SmartProcurementService, ThreeWayMatchingService],
})
export class ComprasModule {}
