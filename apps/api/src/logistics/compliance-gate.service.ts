import { Injectable } from "@nestjs/common";
import {
  ComplianceDocType,
  DocStatus,
  VehicleStatus,
} from "@fsg/db";
import { HARD_RULES } from "@fsg/shared";
import { PrismaService } from "../prisma/prisma.service";
import {
  COMPLIANCE_BLOCK_CODES,
  type ComplianceGateResult,
  type ComplianceViolation,
} from "./compliance-codes";

export type ComplianceGateInput = {
  organizationId: string;
  vehicleId: string;
  driverId: string;
  /** Salida programada — define ventana nocturna */
  departAt: Date;
  /** Si true, exige FUEC vigente (despacho / liberación planilla) */
  requireFuec?: boolean;
};

/** Ventana nocturna Kill-Switch: 21:00–05:00 hora local del servidor */
export function isNightDepart(departAt: Date): boolean {
  const h = departAt.getHours();
  return h >= 21 || h < 5;
}

@Injectable()
export class ComplianceGateService {
  constructor(private prisma: PrismaService) {}

  async evaluate(input: ComplianceGateInput): Promise<ComplianceGateResult> {
    const violations: ComplianceViolation[] = [];
    const requireFuec = input.requireFuec !== false;
    const night = isNightDepart(input.departAt);

    const [vehicle, driver] = await Promise.all([
      this.prisma.vehicle.findFirst({
        where: { id: input.vehicleId, organizationId: input.organizationId },
        include: {
          complianceDocs: true,
          fuecDocuments: {
            where: {
              status: { in: [DocStatus.VALID, DocStatus.EXPIRING] },
              validTo: { gte: new Date() },
            },
            orderBy: { validTo: "desc" },
            take: 1,
          },
        },
      }),
      this.prisma.driver.findFirst({
        where: { id: input.driverId, organizationId: input.organizationId },
        include: { complianceDocs: true },
      }),
    ]);

    if (!vehicle) {
      violations.push({
        code: COMPLIANCE_BLOCK_CODES.VEHICLE_NOT_FOUND,
        message: "Vehículo no encontrado en la organización",
        entity: "vehicle",
        entityId: input.vehicleId,
      });
      return { ok: false, violations };
    }

    if (!driver) {
      violations.push({
        code: COMPLIANCE_BLOCK_CODES.DRIVER_NOT_FOUND,
        message: "Conductor no encontrado en la organización",
        entity: "driver",
        entityId: input.driverId,
      });
      return { ok: false, violations };
    }

    // —— Vehículo ——
    if (vehicle.complianceBlocked) {
      violations.push({
        code: COMPLIANCE_BLOCK_CODES.VEHICLE_COMPLIANCE_BLOCKED,
        message:
          vehicle.complianceReason ||
          "Unidad con complianceBlocked — Hard-Stop activo",
        entity: "vehicle",
        entityId: vehicle.id,
        detail: { plate: vehicle.plate },
      });
    }

    if (vehicle.status === VehicleStatus.OUT_OF_SERVICE) {
      violations.push({
        code: COMPLIANCE_BLOCK_CODES.VEHICLE_OUT_OF_SERVICE,
        message: `Vehículo ${vehicle.plate} fuera de servicio`,
        entity: "vehicle",
        entityId: vehicle.id,
      });
    }

    if (vehicle.status === VehicleStatus.MAINTENANCE) {
      violations.push({
        code: COMPLIANCE_BLOCK_CODES.VEHICLE_MAINTENANCE,
        message: `Vehículo ${vehicle.plate} en mantenimiento / taller`,
        entity: "vehicle",
        entityId: vehicle.id,
      });
    }

    if (night && vehicle.nightRestricted) {
      violations.push({
        code: COMPLIANCE_BLOCK_CODES.VEHICLE_NIGHT_RESTRICTED,
        message: `Kill-Switch nocturno: ${vehicle.plate} no opera en franja 21:00–05:00`,
        entity: "vehicle",
        entityId: vehicle.id,
        detail: { departAt: input.departAt.toISOString() },
      });
    }

    this.assertDoc(
      violations,
      vehicle.complianceDocs,
      ComplianceDocType.SOAT,
      COMPLIANCE_BLOCK_CODES.SOAT_MISSING,
      COMPLIANCE_BLOCK_CODES.SOAT_EXPIRED,
      vehicle.id,
    );
    this.assertDoc(
      violations,
      vehicle.complianceDocs,
      ComplianceDocType.TECNOMECANICA,
      COMPLIANCE_BLOCK_CODES.TECNOMECANICA_MISSING,
      COMPLIANCE_BLOCK_CODES.TECNOMECANICA_EXPIRED,
      vehicle.id,
    );

    if (requireFuec) {
      const fuecDoc = this.latestDoc(
        vehicle.complianceDocs,
        ComplianceDocType.FUEC,
      );
      const fuecRecord = vehicle.fuecDocuments[0];
      const fuecOk =
        (fuecDoc &&
          fuecDoc.status !== DocStatus.EXPIRED &&
          fuecDoc.status !== DocStatus.REJECTED &&
          (!fuecDoc.expiresAt || fuecDoc.expiresAt > new Date())) ||
        !!fuecRecord;

      if (!fuecOk) {
        const expired =
          fuecDoc &&
          (fuecDoc.status === DocStatus.EXPIRED ||
            (fuecDoc.expiresAt && fuecDoc.expiresAt <= new Date()));
        violations.push({
          code: expired
            ? COMPLIANCE_BLOCK_CODES.FUEC_EXPIRED
            : COMPLIANCE_BLOCK_CODES.FUEC_MISSING,
          message: expired
            ? `FUEC vencido para ${vehicle.plate}`
            : `FUEC vigente requerido para despachar ${vehicle.plate}`,
          entity: "document",
          entityId: vehicle.id,
          detail: { plate: vehicle.plate },
        });
      }
    }

    // —— Conductor ——
    if (driver.dispatchBlocked) {
      violations.push({
        code: COMPLIANCE_BLOCK_CODES.DRIVER_DISPATCH_BLOCKED,
        message:
          driver.blockReason ||
          "Conductor con dispatchBlocked — no disponible",
        entity: "driver",
        entityId: driver.id,
      });
    }

    if (!driver.active) {
      violations.push({
        code: COMPLIANCE_BLOCK_CODES.DRIVER_INACTIVE,
        message: `Conductor ${driver.name} inactivo`,
        entity: "driver",
        entityId: driver.id,
      });
    }

    if (driver.fatigueScore >= HARD_RULES.FATIGUE_BLOCK_SCORE) {
      violations.push({
        code: COMPLIANCE_BLOCK_CODES.DRIVER_FATIGUE,
        message: `Fatiga ${driver.fatigueScore}/${HARD_RULES.FATIGUE_BLOCK_SCORE} — exceso de horas de conducción`,
        entity: "driver",
        entityId: driver.id,
        detail: { fatigueScore: driver.fatigueScore },
      });
    }

    if (night && driver.dispatchBlocked === false && vehicle.nightRestricted === false) {
      // Restricción nocturna a nivel conductor vía licencia / flag implícito en blockReason
      // Si el driver tiene doc licencia vencida ya se captura abajo.
    }

    if (!driver.licenseNumber?.trim() && !driver.licenseExpiresAt) {
      const lic = this.latestDoc(
        driver.complianceDocs,
        ComplianceDocType.LICENCIA_CONDUCCION,
      );
      if (!lic) {
        violations.push({
          code: COMPLIANCE_BLOCK_CODES.DRIVER_LICENSE_MISSING,
          message: "Licencia de conducción no registrada",
          entity: "driver",
          entityId: driver.id,
        });
      } else if (
        lic.status === DocStatus.EXPIRED ||
        (lic.expiresAt && lic.expiresAt <= new Date())
      ) {
        violations.push({
          code: COMPLIANCE_BLOCK_CODES.DRIVER_LICENSE_EXPIRED,
          message: "Licencia de conducción vencida",
          entity: "driver",
          entityId: driver.id,
        });
      }
    } else if (
      driver.licenseExpiresAt &&
      driver.licenseExpiresAt <= new Date()
    ) {
      violations.push({
        code: COMPLIANCE_BLOCK_CODES.DRIVER_LICENSE_EXPIRED,
        message: "Licencia de conducción vencida",
        entity: "driver",
        entityId: driver.id,
        detail: { licenseExpiresAt: driver.licenseExpiresAt.toISOString() },
      });
    }

    if (violations.length) return { ok: false, violations };
    return { ok: true };
  }

  private latestDoc<
    T extends {
      type: ComplianceDocType;
      expiresAt: Date | null;
      status: DocStatus;
    },
  >(docs: T[], type: ComplianceDocType): T | undefined {
    return docs
      .filter((d) => d.type === type)
      .sort((a, b) => {
        const ae = a.expiresAt?.getTime() ?? 0;
        const be = b.expiresAt?.getTime() ?? 0;
        return be - ae;
      })[0];
  }

  private assertDoc(
    violations: ComplianceViolation[],
    docs: {
      type: ComplianceDocType;
      expiresAt: Date | null;
      status: DocStatus;
      id: string;
    }[],
    type: ComplianceDocType,
    missingCode: ComplianceViolation["code"],
    expiredCode: ComplianceViolation["code"],
    vehicleId: string,
  ) {
    const doc = this.latestDoc(docs, type);
    if (!doc) {
      violations.push({
        code: missingCode,
        message: `Documento ${type} no registrado`,
        entity: "document",
        entityId: vehicleId,
      });
      return;
    }
    const expired =
      doc.status === DocStatus.EXPIRED ||
      doc.status === DocStatus.SUSPENDED ||
      (doc.expiresAt != null && doc.expiresAt <= new Date());
    if (expired) {
      violations.push({
        code: expiredCode,
        message: `Documento ${type} vencido o suspendido`,
        entity: "document",
        entityId: doc.id,
        detail: {
          expiresAt: doc.expiresAt?.toISOString(),
          status: doc.status,
        },
      });
    }
  }
}
