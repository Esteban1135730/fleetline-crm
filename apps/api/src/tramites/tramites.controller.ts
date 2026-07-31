import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ModulesGuard, RequireModule } from "../auth/modules.guard";
import { RuntSyncService } from "./runt-sync.service";
import { TramitesService } from "./tramites.service";
import { NightlyComplianceWorker } from "./nightly-compliance.worker";

@Controller("tramites")
@UseGuards(JwtAuthGuard, ModulesGuard)
@RequireModule("tramites")
export class TramitesController {
  constructor(
    private runtSync: RuntSyncService,
    private tramites: TramitesService,
    private nightly: NightlyComplianceWorker,
  ) {}

  /**
   * Forzar sincronización RUNT / Ministerios para una unidad.
   */
  @Post("sync/:vehicleId")
  syncVehicle(@Param("vehicleId") vehicleId: string) {
    return this.runtSync.syncVehicleCompliance(vehicleId);
  }

  /**
   * Panel: vehículos bloqueados o próximos a vencer.
   * Query: ?filter=blocked|expiring|all
   */
  @Get("compliance-status")
  complianceStatus(
    @Req() req: { user: { organizationId: string } },
    @Query("filter") filter?: "blocked" | "expiring" | "all",
  ) {
    return this.tramites.complianceStatus(
      req.user.organizationId,
      filter || "all",
    );
  }

  /**
   * Disparo manual del barrido nocturno (ops / sistemas) — útil en staging.
   */
  @Post("compliance/nightly-sweep")
  @RequireModule("tramites", "sistemas")
  runNightlySweep() {
    return this.nightly.runSweep();
  }
}
