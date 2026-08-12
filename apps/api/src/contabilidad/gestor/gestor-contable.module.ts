import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { GestorContableController } from "./gestor-contable.controller";
import { GestorContableService } from "./gestor-contable.service";
import { AccountingLedgerService } from "../accounting-ledger.service";

@Module({
  imports: [AuthModule],
  controllers: [GestorContableController],
  providers: [GestorContableService, AccountingLedgerService],
  exports: [GestorContableService],
})
export class GestorContableModule {}
