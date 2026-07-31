import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RestrictiveListsClient } from "./restrictive-lists.client";
import { SarlaftScreeningService } from "./sarlaft-screening.service";
import { SarlaftComplianceGuard } from "./sarlaft-compliance.guard";
import { SarlaftController } from "./sarlaft.controller";

@Module({
  imports: [AuthModule],
  controllers: [SarlaftController],
  providers: [
    RestrictiveListsClient,
    SarlaftScreeningService,
    SarlaftComplianceGuard,
  ],
  exports: [
    RestrictiveListsClient,
    SarlaftScreeningService,
    SarlaftComplianceGuard,
  ],
})
export class SarlaftModule {}
