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

@Module({
  imports: [AuthModule, forwardRef(() => LogisticsModule)],
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
    DirectorComercialService,
    GestorComercialService,
    CoordinadorComercialService,
  ],
  exports: [
    CommercialContractService,
    SecopSyncService,
    CommercialRevenueService,
    DirectorComercialService,
    GestorComercialService,
    CoordinadorComercialService,
  ],
})
export class ComercialModule {}
