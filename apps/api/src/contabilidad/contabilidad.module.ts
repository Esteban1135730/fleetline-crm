import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AccountingLedgerService } from "./accounting-ledger.service";
import { ContabilidadEventListener } from "./contabilidad-event.listener";
import { ContabilidadController } from "./contabilidad.controller";

@Module({
  imports: [AuthModule],
  controllers: [ContabilidadController],
  providers: [AccountingLedgerService, ContabilidadEventListener],
  exports: [AccountingLedgerService],
})
export class ContabilidadModule {}
