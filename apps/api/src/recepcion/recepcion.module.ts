import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LogisticsModule } from "../logistics/logistics.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { RecepcionController } from "./recepcion.controller";
import { RecepcionService } from "./recepcion.service";

@Module({
  imports: [AuthModule, LogisticsModule, NotificationsModule],
  controllers: [RecepcionController],
  providers: [RecepcionService],
  exports: [RecepcionService],
})
export class RecepcionModule {}
