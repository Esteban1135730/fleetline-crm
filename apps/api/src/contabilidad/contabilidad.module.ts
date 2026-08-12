import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AccountingLedgerService } from "./accounting-ledger.service";
import { ContabilidadEventListener } from "./contabilidad-event.listener";
import { ContabilidadController } from "./contabilidad.controller";
import { AuxiliarContableModule } from "./auxiliar/auxiliar-contable.module";
import { GestorContableModule } from "./gestor/gestor-contable.module";

@Module({
  imports: [AuthModule, AuxiliarContableModule, GestorContableModule],
  controllers: [ContabilidadController],
  providers: [AccountingLedgerService, ContabilidadEventListener],
  exports: [AccountingLedgerService, AuxiliarContableModule, GestorContableModule],
})
export class ContabilidadModule {}
