import { Module } from "@nestjs/common";
import { FinanceController } from "./finance.controller";
import { FinanceService } from "./finance.service";
import { SarlaftModule } from "../sarlaft/sarlaft.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [SarlaftModule, NotificationsModule],
  controllers: [FinanceController],
  providers: [FinanceService],
})
export class FinanceModule {}
