import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PilotController } from "./pilot.controller";
import { PilotService } from "./pilot.service";

@Module({
  imports: [AuthModule],
  controllers: [PilotController],
  providers: [PilotService],
  exports: [PilotService],
})
export class PilotModule {}
