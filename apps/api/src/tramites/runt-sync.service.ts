import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  ComplianceDocType,
  DocStatus,
  VehicleStatus,
} from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";
import { KafkaEventsService } from "../logistics/kafka-events.service";
import { RuntClient } from "./runt.client";

const VEHICLE_CRITICAL: ComplianceDocType[] = [
  ComplianceDocType.SOAT,
  ComplianceDocType.TECNOMECANICA,
  ComplianceDocType.TARJETA_OPERACION,
];

export type SyncVehicleResult = {
  vehicleId: string;
  plate: string;
  source: string;
  documentsUpserted: number;
  complianceBlocked: boolean;
  soatActivo: boolean;
  tecnoActiva: boolean;
  blocks: string[];
  reason: string | null;
  newlyBlocked: boolean;
};

@Injectable()
export class RuntSyncService {
  private readonly logger = new Logger(RuntSyncService.name);

  constructor(
    private prisma: PrismaService,
    private runt: RuntClient,
    private kafka: KafkaEventsService,
  ) {}

  /**
   * Consulta RUNT por placa, actualiza ComplianceDocument y aplica Kill-Switch.
   */
  async syncVehicleCompliance(vehicleId: string): Promise<SyncVehicleResult> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      include: { complianceDocs: true },
    });
    if (!vehicle) {
      throw new NotFoundException(`Vehículo ${vehicleId} no encontrado`);
    }

    const report = await this.runt.lookupVehicleByPlate(vehicle.plate);
    this.logger.log(
      `[RUNT] sync ${vehicle.plate} via ${report.source} (${report.documents.length} docs)`,
    );

    let upserted = 0;
    const now = new Date();

    for (const doc of report.documents) {
      const expired =
        !doc.validInGovDb ||
        (doc.expiresAt != null && doc.expiresAt.getTime() <= now.getTime());
      const status = expired
        ? DocStatus.EXPIRED
        : doc.expiresAt &&
            (doc.expiresAt.getTime() - now.getTime()) / 86400000 <= 15
          ? DocStatus.EXPIRING
          : DocStatus.VALID;

      const existing = vehicle.complianceDocs.find((d) => d.type === doc.type);
      if (existing) {
        await this.prisma.complianceDocument.update({
          where: { id: existing.id },
          data: {
            status,
            reference: doc.reference,
            issuedAt: doc.issuedAt,
            expiresAt: doc.expiresAt,
            runtVerified: doc.validInGovDb && !expired,
            runtPayload: doc.raw as object,
            notes: `Sync ${report.source} @ ${report.queriedAt}`,
          },
        });
      } else {
        await this.prisma.complianceDocument.create({
          data: {
            organizationId: vehicle.organizationId,
            vehicleId: vehicle.id,
            type: doc.type,
            status,
            reference: doc.reference,
            issuedAt: doc.issuedAt,
            expiresAt: doc.expiresAt,
            runtVerified: doc.validInGovDb && !expired,
            runtPayload: doc.raw as object,
            notes: `Sync ${report.source} @ ${report.queriedAt}`,
          },
        });
      }
      upserted += 1;
    }

    const kill = await this.applyVehicleKillSwitch(vehicle.id, "runt_sync");
    return { ...kill, documentsUpserted: upserted, source: report.source };
  }

  /**
   * Recalcula flags del vehículo a partir de ComplianceDocument en BD.
   * Emite Kafka si pasa de desbloqueado → bloqueado.
   */
  async applyVehicleKillSwitch(
    vehicleId: string,
    source: "runt_sync" | "nightly_cron" | "manual",
  ): Promise<SyncVehicleResult> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      include: { complianceDocs: true },
    });
    if (!vehicle) {
      throw new NotFoundException(`Vehículo ${vehicleId} no encontrado`);
    }

    const now = Date.now();
    const blocks: string[] = [];
    const byType = new Map<string, (typeof vehicle.complianceDocs)[0]>();

    for (const d of vehicle.complianceDocs) {
      const prev = byType.get(d.type);
      const exp = d.expiresAt?.getTime() ?? 0;
      const prevExp = prev?.expiresAt?.getTime() ?? 0;
      if (!prev || exp > prevExp) byType.set(d.type, d);
    }

    for (const type of VEHICLE_CRITICAL) {
      const d = byType.get(type);
      if (!d) {
        blocks.push(`${type}_MISSING`);
        continue;
      }
      const expired =
        d.status === DocStatus.EXPIRED ||
        d.status === DocStatus.SUSPENDED ||
        (d.expiresAt != null && d.expiresAt.getTime() <= now);
      if (expired) blocks.push(`${type}_EXPIRED`);
    }

    const soat = byType.get(ComplianceDocType.SOAT);
    const tecno = byType.get(ComplianceDocType.TECNOMECANICA);
    const soatActivo = Boolean(
      soat &&
        soat.status !== DocStatus.EXPIRED &&
        soat.status !== DocStatus.SUSPENDED &&
        (!soat.expiresAt || soat.expiresAt.getTime() > now),
    );
    const tecnoActiva = Boolean(
      tecno &&
        tecno.status !== DocStatus.EXPIRED &&
        tecno.status !== DocStatus.SUSPENDED &&
        (!tecno.expiresAt || tecno.expiresAt.getTime() > now),
    );

    const complianceBlocked = blocks.length > 0;
    const reason = complianceBlocked
      ? `Kill-Switch: ${blocks.join(", ")}`
      : null;
    const newlyBlocked = complianceBlocked && !vehicle.complianceBlocked;

    const nextStatus = complianceBlocked
      ? VehicleStatus.COMPLIANCE_BLOCKED
      : vehicle.status === VehicleStatus.COMPLIANCE_BLOCKED
        ? VehicleStatus.AVAILABLE
        : vehicle.status;

    await this.prisma.vehicle.update({
      where: { id: vehicle.id },
      data: {
        complianceBlocked,
        complianceReason: reason,
        soatActivo,
        tecnoActiva,
        status: nextStatus,
      },
    });

    if (newlyBlocked) {
      await this.kafka.emitComplianceVehicleBlocked({
        vehicleId: vehicle.id,
        organizationId: vehicle.organizationId,
        plate: vehicle.plate,
        reason: reason || "compliance_blocked",
        blocks,
        source,
      });
    }

    return {
      vehicleId: vehicle.id,
      plate: vehicle.plate,
      source,
      documentsUpserted: 0,
      complianceBlocked,
      soatActivo,
      tecnoActiva,
      blocks,
      reason,
      newlyBlocked,
    };
  }

  async syncDriverLicense(driverId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      include: { complianceDocs: true },
    });
    if (!driver) throw new NotFoundException(`Conductor ${driverId} no encontrado`);

    const report = await this.runt.lookupLicenseByDocument(driver.document);
    const now = new Date();
    const expired =
      !report.validInGovDb ||
      (report.expiresAt != null && report.expiresAt.getTime() <= now.getTime());

    const existing = driver.complianceDocs.find(
      (d) => d.type === ComplianceDocType.LICENCIA_CONDUCCION,
    );
    const status = expired ? DocStatus.EXPIRED : DocStatus.VALID;

    if (existing) {
      await this.prisma.complianceDocument.update({
        where: { id: existing.id },
        data: {
          status,
          reference: report.licenseNumber,
          expiresAt: report.expiresAt,
          runtVerified: !expired,
          runtPayload: report.raw as object,
        },
      });
    } else {
      await this.prisma.complianceDocument.create({
        data: {
          organizationId: driver.organizationId,
          driverId: driver.id,
          type: ComplianceDocType.LICENCIA_CONDUCCION,
          status,
          reference: report.licenseNumber,
          expiresAt: report.expiresAt,
          runtVerified: !expired,
          runtPayload: report.raw as object,
        },
      });
    }

    await this.prisma.driver.update({
      where: { id: driver.id },
      data: {
        licenseNumber: report.licenseNumber,
        licenseExpiresAt: report.expiresAt,
        licenseCategory: report.category,
        dispatchBlocked: expired,
        blockReason: expired ? "LICENCIA_CONDUCCION_EXPIRED (RUNT)" : null,
      },
    });

    return {
      driverId: driver.id,
      document: driver.document,
      expired,
      licenseExpiresAt: report.expiresAt,
    };
  }
}
