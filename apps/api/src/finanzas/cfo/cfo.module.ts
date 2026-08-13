import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { TesoreriaModule } from "../../tesoreria/tesoreria.module";
import { CfoController } from "./cfo.controller";
import { CfoService } from "./cfo.service";

@Module({
  imports: [AuthModule, TesoreriaModule],
  controllers: [CfoController],
  providers: [CfoService],
  exports: [CfoService],
})
export class CfoModule {}
