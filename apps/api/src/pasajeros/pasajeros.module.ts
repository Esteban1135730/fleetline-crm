import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PasajerosController } from "./pasajeros.controller";
import { PassengerAppService } from "./passenger-app.service";

@Module({
  imports: [AuthModule],
  controllers: [PasajerosController],
  providers: [PassengerAppService],
  exports: [PassengerAppService],
})
export class PasajerosModule {}
