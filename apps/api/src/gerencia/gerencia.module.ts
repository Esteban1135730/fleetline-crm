import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PresidenciaModule } from "../presidencia/presidencia.module";
import { LogisticsModule } from "../logistics/logistics.module";
import { GerenciaController } from "./gerencia.controller";
import { GerenciaService } from "./gerencia.service";

@Module({
  imports: [
    AuthModule,
    PresidenciaModule,
    forwardRef(() => LogisticsModule),
  ],
  controllers: [GerenciaController],
  providers: [GerenciaService],
  exports: [GerenciaService],
})
export class GerenciaModule {}
