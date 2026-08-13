import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { LogisticsModule } from "../../logistics/logistics.module";
import { CampoController } from "./campo.controller";
import { CampoService } from "./campo.service";

@Module({
  imports: [AuthModule, LogisticsModule],
  controllers: [CampoController],
  providers: [CampoService],
  exports: [CampoService],
})
export class CampoModule {}
