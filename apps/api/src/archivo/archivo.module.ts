import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LogisticsModule } from "../logistics/logistics.module";
import { ArchivoController } from "./archivo.controller";
import { DataRoomService } from "./data-room.service";
import { OcrIngestionService } from "./ocr-ingestion.service";
import { ArchivoOpsService } from "./archivo-ops.service";
import { DocumentLoanReminderWorker } from "./document-loan-reminder.worker";

@Module({
  imports: [AuthModule, LogisticsModule],
  controllers: [ArchivoController],
  providers: [
    DataRoomService,
    OcrIngestionService,
    ArchivoOpsService,
    DocumentLoanReminderWorker,
  ],
  exports: [DataRoomService, OcrIngestionService, ArchivoOpsService],
})
export class ArchivoModule {}
