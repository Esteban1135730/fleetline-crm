import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LogisticsModule } from "../logistics/logistics.module";
import { ComercialController } from "./comercial.controller";
import { CommercialContractService } from "./commercial-contract.service";
import { SecopClient, SecopSyncService } from "./secop-sync.service";
import { CommercialRevenueService } from "./commercial-revenue.service";
import { DirectorComercialController } from "./director/director-comercial.controller";
import { DirectorComercialService } from "./director/director-comercial.service";
import { GestorComercialController } from "./gestor/gestor-comercial.controller";
import { GestorComercialService } from "./gestor/gestor-comercial.service";
import { CoordinadorComercialController } from "./coordinador/coordinador-comercial.controller";
import { CoordinadorComercialService } from "./coordinador/coordinador-comercial.service";
import { QuotePdfService } from "./quote-pdf.service";
import { SarlaftModule } from "../sarlaft/sarlaft.module";

@Module({
  imports: [AuthModule, forwardRef(() => LogisticsModule), SarlaftModule],
  controllers: [
    ComercialController,
    DirectorComercialController,
    GestorComercialController,
    CoordinadorComercialController,
  ],
  providers: [
    CommercialContractService,
    SecopClient,
    SecopSyncService,
    CommercialRevenueService,
    QuotePdfService,
    DirectorComercialService,
    GestorComercialService,
    CoordinadorComercialService,
  ],
  exports: [
    CommercialContractService,
    SecopSyncService,
    CommercialRevenueService,
    QuotePdfService,
    DirectorComercialService,
    GestorComercialService,
    CoordinadorComercialService,
  ],
})
export class ComercialModule {}
