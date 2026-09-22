import { Module, forwardRef } from "@nestjs/common";
import { CustomersController } from "./customers.controller";
import { CustomersService } from "./customers.service";
import { LogisticsModule } from "../logistics/logistics.module";
import { SarlaftModule } from "../sarlaft/sarlaft.module";
import { QuotePdfService } from "../comercial/quote-pdf.service";

@Module({
  imports: [forwardRef(() => LogisticsModule), SarlaftModule],
  controllers: [CustomersController],
  providers: [CustomersService, QuotePdfService],
  exports: [CustomersService],
})
export class CustomersModule {}
