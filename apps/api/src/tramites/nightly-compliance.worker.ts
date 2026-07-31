import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { DocStatus, VehicleStatus, ComplianceDocType } from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";
import { RuntSyncService } from "./runt-sync.service";

/**
 * Kill-Switch nocturno: a medianoche recorre la flota,
 * marca docs vencidos / por vencer en ≤24h como EXPIRED y reaplica Hard-Stop.
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
    const horizon = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const dueDocs = await this.prisma.complianceDocument.findMany({
      where: {
        expiresAt: { lte: horizon },
        status: { notIn: [DocStatus.EXPIRED, DocStatus.REJECTED] },
      },
      select: {
        id: true,
        vehicleId: true,
        driverId: true,
        type: true,
        expiresAt: true,
      },
    });

    let documentsMarked = 0;
    const vehicleIds = new Set<string>();
    const driverIds = new Set<string>();

    for (const doc of dueDocs) {
      await this.prisma.complianceDocument.update({
        where: { id: doc.id },
        data: {
          status: DocStatus.EXPIRED,
          notes: `Nightly Kill-Switch @ ${now.toISOString()} — vencido o ≤24h`,
          runtVerified: false,
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
    };
  }
}
