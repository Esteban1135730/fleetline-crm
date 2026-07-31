import { Module, forwardRef } from "@nestjs/common";
import { CustomersController } from "./customers.controller";
import { CustomersService } from "./customers.service";
import { LogisticsModule } from "../logistics/logistics.module";
import { SarlaftModule } from "../sarlaft/sarlaft.module";

@Module({
  imports: [forwardRef(() => LogisticsModule), SarlaftModule],
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
