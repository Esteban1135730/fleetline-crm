import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { ComprasModule } from "../../compras/compras.module";
import { AuxiliarContableController } from "./auxiliar-contable.controller";
import { AuxiliarContableService } from "./auxiliar-contable.service";

@Module({
  imports: [AuthModule, ComprasModule],
  controllers: [AuxiliarContableController],
  providers: [AuxiliarContableService],
  exports: [AuxiliarContableService],
})
export class AuxiliarContableModule {}
