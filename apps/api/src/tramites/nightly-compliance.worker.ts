import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { DocStatus, VehicleStatus, ComplianceDocType } from "@fsg/db";
import { HARD_RULES, docStatusFromExpiryDate } from "@fsg/shared";
import { PrismaService } from "../prisma/prisma.service";
import { RuntSyncService } from "./runt-sync.service";

/**
 * Kill-Switch nocturno: a medianoche recorre docs,
 * marca VENCIDO / POR VENCER (≤ DOC_EXPIRING_DAYS) y reaplica Hard-Stop.
 */
@Injectable()
export class NightlyComplianceWorker {
  private readonly logger = new Logger(NightlyComplianceWorker.name);

  constructor(
    private prisma: PrismaService,
    private runtSync: RuntSyncService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleMidnightSweep() {
    this.logger.log("[CRON] Nightly compliance sweep — inicio");
    const summary = await this.runSweep();
    this.logger.log(
      `[CRON] Nightly compliance sweep — fin: docs=${summary.documentsMarked} vehiclesBlocked=${summary.vehiclesBlocked} driversBlocked=${summary.driversBlocked}`,
    );
    return summary;
  }

  /** Expuesto para tests / disparo manual interno */
  async runSweep(now = new Date()) {
    const horizonMs = HARD_RULES.DOC_EXPIRING_DAYS * 86400000;
    const horizon = new Date(now.getTime() + horizonMs);
    const runtSyncEnabled =
      (process.env.RUNT_NIGHTLY_SYNC || "").toLowerCase() === "true";

    let runtSynced = 0;
    let runtSyncErrors = 0;
    if (runtSyncEnabled) {
      const fleetSync = await this.syncFleetFromRunt();
      runtSynced = fleetSync.synced;
      runtSyncErrors = fleetSync.errors;
      this.logger.log(
        `[CRON] RUNT nightly sync — synced=${runtSynced} errors=${runtSyncErrors}`,
      );
    }

    const dueDocs = await this.prisma.complianceDocument.findMany({
      where: {
        expiresAt: { lte: horizon },
        status: { notIn: [DocStatus.REJECTED] },
      },
      select: {
        id: true,
        vehicleId: true,
        driverId: true,
        type: true,
        expiresAt: true,
        status: true,
      },
    });

    let documentsMarked = 0;
    const vehicleIds = new Set<string>();
    const driverIds = new Set<string>();

    for (const doc of dueDocs) {
      if (!doc.expiresAt) continue;
      const next = docStatusFromExpiryDate(doc.expiresAt, {
        now,
        currentStatus: doc.status,
      }) as DocStatus;
      if (next === doc.status) continue;

      await this.prisma.complianceDocument.update({
        where: { id: doc.id },
        data: {
          status: next,
          notes: `Auto-vigencia @ ${now.toISOString()} — ${next}`,
        },
      });
      documentsMarked += 1;
      if (doc.vehicleId) vehicleIds.add(doc.vehicleId);
      if (doc.driverId) driverIds.add(doc.driverId);
    }

    let vehiclesBlocked = 0;
    for (const vehicleId of vehicleIds) {
      const result = await this.runtSync.applyVehicleKillSwitch(
        vehicleId,
        "nightly_cron",
      );
      if (result.complianceBlocked) vehiclesBlocked += 1;
    }

    const activeFleet = await this.prisma.vehicle.findMany({
      where: {
        status: { not: VehicleStatus.OUT_OF_SERVICE },
      },
      select: { id: true },
      take: 5000,
    });
    for (const v of activeFleet) {
      if (vehicleIds.has(v.id)) continue;
      const result = await this.runtSync.applyVehicleKillSwitch(
        v.id,
        "nightly_cron",
      );
      if (result.newlyBlocked) vehiclesBlocked += 1;
    }

    let driversBlocked = 0;
    for (const driverId of driverIds) {
      const driver = await this.prisma.driver.findUnique({
        where: { id: driverId },
        include: {
          complianceDocs: {
            where: { type: ComplianceDocType.LICENCIA_CONDUCCION },
            orderBy: { expiresAt: "desc" },
            take: 1,
          },
        },
      });
      if (!driver) continue;
      const lic = driver.complianceDocs[0];
      const expired =
        !lic ||
        lic.status === DocStatus.EXPIRED ||
        (lic.expiresAt != null && lic.expiresAt.getTime() <= now.getTime());
      if (expired) {
        await this.prisma.driver.update({
          where: { id: driverId },
          data: {
            dispatchBlocked: true,
            blockReason: "LICENCIA_CONDUCCION_EXPIRED (nightly)",
            licenseExpiresAt: lic?.expiresAt ?? driver.licenseExpiresAt,
          },
        });
        driversBlocked += 1;
      }
    }

    return {
      at: now.toISOString(),
      documentsMarked,
      vehiclesScanned: activeFleet.length,
      vehiclesBlocked,
      driversBlocked,
      runtSynced,
      runtSyncEnabled,
      runtSyncErrors,
    };
  }

  /** TRA-03: refresco RUNT opcional (gated por env). */
  async syncFleetFromRuntPublic(organizationId?: string) {
    return this.syncFleetFromRunt(organizationId);
  }

  private async syncFleetFromRunt(organizationId?: string) {
    const batch = Math.max(
      1,
      Number(process.env.RUNT_NIGHTLY_BATCH || 50) || 50,
    );
    const delayMs = Math.max(
      0,
      Number(process.env.RUNT_NIGHTLY_DELAY_MS || 200) || 200,
    );
    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        status: { not: VehicleStatus.OUT_OF_SERVICE },
        ...(organizationId ? { organizationId } : {}),
      },
      select: { id: true, plate: true },
      take: batch,
      orderBy: { updatedAt: "asc" },
    });

    let synced = 0;
    let errors = 0;
    for (const v of vehicles) {
      try {
        await this.runtSync.syncVehicleCompliance(v.id);
        synced += 1;
      } catch (err) {
        errors += 1;
        this.logger.warn(
          `[RUNT nightly] ${v.plate}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    return { synced, errors, batch };
  }
}
