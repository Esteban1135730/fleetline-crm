import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { LogisticsModule } from "../../logistics/logistics.module";
import { DirectorOperativoController } from "./director.controller";
import { DirectorOperativoService } from "./director.service";

@Module({
  imports: [AuthModule, LogisticsModule],
  controllers: [DirectorOperativoController],
  providers: [DirectorOperativoService],
  exports: [DirectorOperativoService],
})
export class DirectorOperativoModule {}
