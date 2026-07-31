import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LogisticsModule } from "../logistics/logistics.module";
import { ComercialController } from "./comercial.controller";
import { CommercialContractService } from "./commercial-contract.service";
import { SecopClient, SecopSyncService } from "./secop-sync.service";
import { CommercialRevenueService } from "./commercial-revenue.service";

@Module({
  imports: [AuthModule, forwardRef(() => LogisticsModule)],
  controllers: [ComercialController],
  providers: [
    CommercialContractService,
    SecopClient,
    SecopSyncService,
    CommercialRevenueService,
  ],
  exports: [
    CommercialContractService,
    SecopSyncService,
    CommercialRevenueService,
  ],
})
export class ComercialModule {}
