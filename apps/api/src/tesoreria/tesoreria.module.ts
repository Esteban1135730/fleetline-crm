import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LogisticsModule } from "../logistics/logistics.module";
import { SarlaftModule } from "../sarlaft/sarlaft.module";
import { TesoreriaController } from "./tesoreria.controller";
import { TesoreriaService } from "./tesoreria.service";
import { RodamientosService } from "./rodamientos.service";
import { MfaService } from "./mfa.service";
import { MfaTreasuryGuard } from "./mfa.treasury.guard";
import {
  PaymentQueueService,
  PurchaseMatchConsumer,
} from "./payment-queue.service";

@Module({
  imports: [AuthModule, LogisticsModule, SarlaftModule],
  controllers: [TesoreriaController],
  providers: [
    TesoreriaService,
    RodamientosService,
    MfaService,
    MfaTreasuryGuard,
    PaymentQueueService,
    PurchaseMatchConsumer,
  ],
  exports: [
    TesoreriaService,
    PaymentQueueService,
    PurchaseMatchConsumer,
    MfaService,
  ],
})
export class TesoreriaModule {}
