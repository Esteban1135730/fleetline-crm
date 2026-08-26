import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { FuecController } from "./fuec.controller";
import { FuecPdfService } from "./fuec-pdf.service";
import { FuecService } from "./fuec.service";

@Module({
  imports: [AuthModule],
  controllers: [FuecController],
  providers: [FuecService, FuecPdfService],
  exports: [FuecService],
})
export class FuecModule {}
