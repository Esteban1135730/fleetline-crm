import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { LogisticsModule } from "../../logistics/logistics.module";
import { DespachoController } from "./despacho.controller";
import { DespachoService } from "./despacho.service";

@Module({
  imports: [AuthModule, LogisticsModule],
  controllers: [DespachoController],
  providers: [DespachoService],
  exports: [DespachoService],
})
export class DespachoModule {}
