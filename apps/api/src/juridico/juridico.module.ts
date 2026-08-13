import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { SarlaftModule } from "../sarlaft/sarlaft.module";
import { JuridicoController } from "./juridico.controller";
import { JuridicoService } from "./juridico.service";

@Module({
  imports: [AuthModule, SarlaftModule],
  controllers: [JuridicoController],
  providers: [JuridicoService],
  exports: [JuridicoService],
})
export class JuridicoModule {}
