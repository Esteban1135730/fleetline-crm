import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ComercialModule } from "../comercial/comercial.module";
import { ClientesB2bController } from "./clientes-b2b.controller";
import { B2bPortalService } from "./b2b-portal.service";

@Module({
  imports: [AuthModule, ComercialModule],
  controllers: [ClientesB2bController],
  providers: [B2bPortalService],
  exports: [B2bPortalService],
})
export class ClientesB2bModule {}
