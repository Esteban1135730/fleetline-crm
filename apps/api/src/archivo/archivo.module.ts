import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LogisticsModule } from "../logistics/logistics.module";
import { ArchivoController } from "./archivo.controller";
import { DataRoomService } from "./data-room.service";
import { OcrIngestionService } from "./ocr-ingestion.service";

@Module({
  imports: [AuthModule, LogisticsModule],
  controllers: [ArchivoController],
  providers: [DataRoomService, OcrIngestionService],
  exports: [DataRoomService, OcrIngestionService],
})
export class ArchivoModule {}
