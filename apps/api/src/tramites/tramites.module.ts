import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LogisticsModule } from "../logistics/logistics.module";
import { TramitesController } from "./tramites.controller";
import { TramitesService } from "./tramites.service";
import { RuntClient } from "./runt.client";
import { RuntSyncService } from "./runt-sync.service";
import { NightlyComplianceWorker } from "./nightly-compliance.worker";
import { DocumentProcessedListener } from "./document-processed.listener";

@Module({
  imports: [AuthModule, LogisticsModule],
  controllers: [TramitesController],
  providers: [
    TramitesService,
    RuntClient,
    RuntSyncService,
    NightlyComplianceWorker,
    DocumentProcessedListener,
  ],
  exports: [RuntSyncService, RuntClient, NightlyComplianceWorker],
})
export class TramitesModule {}
