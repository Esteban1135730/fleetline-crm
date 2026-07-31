import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LogisticsModule } from "../logistics/logistics.module";
import { PqrsController } from "./pqrs.controller";
import { PqrsTicketService } from "./pqrs-ticket.service";
import { VisitorControlService } from "./visitor-control.service";

@Module({
  imports: [AuthModule, LogisticsModule],
  controllers: [PqrsController],
  providers: [PqrsTicketService, VisitorControlService],
  exports: [PqrsTicketService, VisitorControlService],
})
export class PqrsModule {}
