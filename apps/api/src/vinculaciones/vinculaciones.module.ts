import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LogisticsModule } from "../logistics/logistics.module";
import { TramitesModule } from "../tramites/tramites.module";
import { VinculacionesController } from "./vinculaciones.controller";
import { VinculacionesService } from "./vinculaciones.service";

@Module({
  imports: [AuthModule, LogisticsModule, TramitesModule],
  controllers: [VinculacionesController],
  providers: [VinculacionesService],
  exports: [VinculacionesService],
})
export class VinculacionesModule {}
