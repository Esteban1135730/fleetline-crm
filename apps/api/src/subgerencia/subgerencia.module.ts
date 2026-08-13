import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { SubgerenciaController } from "./subgerencia.controller";
import { SubgerenciaService } from "./subgerencia.service";

@Module({
  imports: [AuthModule],
  controllers: [SubgerenciaController],
  providers: [SubgerenciaService],
  exports: [SubgerenciaService],
})
export class SubgerenciaModule {}
