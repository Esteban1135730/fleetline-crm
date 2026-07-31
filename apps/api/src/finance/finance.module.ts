import { Module } from "@nestjs/common";
import { FinanceController } from "./finance.controller";
import { FinanceService } from "./finance.service";
import { SarlaftModule } from "../sarlaft/sarlaft.module";

@Module({
  imports: [SarlaftModule],
  controllers: [FinanceController],
  providers: [FinanceService],
})
export class FinanceModule {}
