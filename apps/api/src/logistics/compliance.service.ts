import { BadRequestException, Injectable } from "@nestjs/common";
import {
  ComplianceDocType,
  DocStatus,
  EmployeeStatus,
  VehicleStatus,
} from "@fsg/db";
import { HARD_RULES, calendarDaysUntilExpiry, type DispatchSemaphore } from "@fsg/shared";
import { PrismaService } from "../prisma/prisma.service";

const CRITICAL_DOC_TYPES: ComplianceDocType[] = [
  ComplianceDocType.SOAT,
  ComplianceDocType.TECNOMECANICA,
  ComplianceDocType.TARJETA_OPERACION,
];

export type VehicleReadiness = {
  vehicleId: string;
  plate: string;
  semaphore: DispatchSemaphore;
  dispatchable: boolean;
  blockReasons: string[];
  warnings: string[];
  odometerKm: number;
  procedures: {
    type: string;
    status: string;
    validTo: string;
    daysLeft: number;
  }[];
};

export type DriverReadiness = {
  driverId: string;
  name: string;
  document: string;
  dispatchable: boolean;
  blockReasons: string[];
  warnings: string[];
  active: boolean;
  fatigueScore: number | null;
  employeeStatus: string | null;
};

@Injectable()
export class ComplianceService {
  constructor(private prisma: PrismaService) {}

  daysLeft(validTo: Date) {
    return calendarDaysUntilExpiry(validTo);
  }

  docStatusFromValidTo(validTo: Date): DocStatus {
    const days = this.daysLeft(validTo);
    if (days < 0) return DocStatus.EXPIRED;
    if (days <= HARD_RULES.DOC_EXPIRING_DAYS) return DocStatus.EXPIRING;
    return DocStatus.VALID;
  }

  semaphoreFromDays(daysLeft: number): DispatchSemaphore {
    if (daysLeft < 0) return "RED";
    if (daysLeft <= HARD_RULES.DOC_EXPIRING_DAYS) return "YELLOW";
    return "GREEN";
  }

  async getVehicleReadiness(
    organizationId: string,
    vehicleId: string,
  ): Promise<VehicleReadiness> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      include: { complianceDocs: true },
    });
    if (!vehicle) {
      throw new BadRequestException("Vehículo no encontrado");
    }

    const byType = new Map<string, (typeof vehicle.complianceDocs)[0]>();
    for (const p of vehicle.complianceDocs) {
      const prev = byType.get(p.type);
      const pExp = p.expiresAt?.getTime() ?? 0;
      const prevExp = prev?.expiresAt?.getTime() ?? 0;
      if (!prev || pExp > prevExp) byType.set(p.type, p);
    }

    const procedures = [...byType.values()].map((p) => {
      const days = p.expiresAt ? this.daysLeft(p.expiresAt) : -999;
      return {
        type: p.type,
        status: p.status,
        validTo: p.expiresAt?.toISOString() ?? "",
        daysLeft: Math.floor(days),
      };
    });

    const blockReasons: string[] = [];
    const warnings: string[] = [];
    let worst: DispatchSemaphore = "GREEN";

    if (vehicle.complianceBlocked) {
      blockReasons.push(
        vehicle.complianceReason || "complianceBlocked=true",
      );
      worst = "RED";
    }
    if (vehicle.status === VehicleStatus.MAINTENANCE) {
      blockReasons.push("Vehículo en mantenimiento");
      worst = "RED";
    }
    if (vehicle.status === VehicleStatus.OUT_OF_SERVICE) {
      blockReasons.push("Vehículo fuera de servicio");
      worst = "RED";
    }
    if (vehicle.status === VehicleStatus.COMPLIANCE_BLOCKED) {
      blockReasons.push("Estado COMPLIANCE_BLOCKED");
      worst = "RED";
    }

    for (const type of CRITICAL_DOC_TYPES) {
      const p = byType.get(type);
      if (!p) {
        warnings.push(`Sin registro de ${type}`);
        continue;
      }
      const days = p.expiresAt ? this.daysLeft(p.expiresAt) : -1;
      const sem = this.semaphoreFromDays(days);
      if (sem === "RED") {
        blockReasons.push(`${type} vencido`);
        worst = "RED";
      } else if (sem === "YELLOW") {
        warnings.push(`${type} por vencer (${Math.floor(days)}d)`);
        if (worst === "GREEN") worst = "YELLOW";
      }
    }

    return {
      vehicleId: vehicle.id,
      plate: vehicle.plate,
      semaphore: worst,
      dispatchable: blockReasons.length === 0,
      blockReasons,
      warnings,
      odometerKm: vehicle.odometerKm,
      procedures,
    };
  }

  async getDriverReadiness(
    organizationId: string,
    driverId: string,
  ): Promise<DriverReadiness> {
    const driver = await this.prisma.driver.findFirst({
      where: { id: driverId, organizationId },
    });
    if (!driver) throw new BadRequestException("Conductor no encontrado");

    const employee = await this.prisma.employee.findFirst({
      where: { organizationId, document: driver.document },
    });

    const blockReasons: string[] = [];
    const warnings: string[] = [];

    if (!driver.active) {
      blockReasons.push("Conductor inactivo en despacho");
    }
    if (driver.dispatchBlocked) {
      blockReasons.push(driver.blockReason || "dispatchBlocked=true");
    }
    if (!driver.licenseNumber?.trim()) {
      warnings.push("Sin licencia registrada en ficha de conductor");
    }
    if (driver.licenseExpiresAt && driver.licenseExpiresAt <= new Date()) {
      blockReasons.push("Licencia de conducción vencida");
    }

    const fatigueScore = driver.fatigueScore ?? employee?.fatigueScore ?? null;
    const employeeStatus = employee?.status ?? null;

    if (fatigueScore != null && fatigueScore >= HARD_RULES.FATIGUE_BLOCK_SCORE) {
      blockReasons.push(
        `Fatiga alta (${fatigueScore}/${HARD_RULES.FATIGUE_BLOCK_SCORE})`,
      );
    } else if (
      fatigueScore != null &&
      fatigueScore >= HARD_RULES.FATIGUE_BLOCK_SCORE - 20
    ) {
      warnings.push(`Fatiga elevada (${fatigueScore})`);
    }

    if (employee) {
      if (employee.status === EmployeeStatus.INACTIVE) {
        blockReasons.push("Empleado INACTIVO en RRHH");
      } else if (employee.status === EmployeeStatus.MEDICAL) {
        blockReasons.push("Empleado en estado MÉDICO");
      } else if (employee.status === EmployeeStatus.VACATION) {
        blockReasons.push("Empleado en VACACIONES");
      }
    }

    return {
      driverId: driver.id,
      name: driver.name,
      document: driver.document,
      dispatchable: blockReasons.length === 0,
      blockReasons,
      warnings,
      active: driver.active,
      fatigueScore,
      employeeStatus,
    };
  }

  async assertCanAssign(
    organizationId: string,
    vehicleId?: string | null,
    driverId?: string | null,
  ) {
    if (vehicleId) {
      const v = await this.getVehicleReadiness(organizationId, vehicleId);
      if (!v.dispatchable) {
        throw new BadRequestException(
          `Vehículo ${v.plate} bloqueado para despacho: ${v.blockReasons.join("; ")}`,
        );
      }
    }
    if (driverId) {
      const d = await this.getDriverReadiness(organizationId, driverId);
      if (!d.dispatchable) {
        throw new BadRequestException(
          `Conductor ${d.name} no disponible: ${d.blockReasons.join("; ")}`,
        );
      }
    }
  }

  async fleetMatrix(organizationId: string) {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { organizationId },
      orderBy: { plate: "asc" },
    });

    const rows = await Promise.all(
      vehicles.map(async (v) => this.getVehicleReadiness(organizationId, v.id)),
    );

    const counts = {
      green: rows.filter((r) => r.semaphore === "GREEN").length,
      yellow: rows.filter((r) => r.semaphore === "YELLOW").length,
      red: rows.filter((r) => r.semaphore === "RED").length,
    };

    return { counts, vehicles: rows, rules: HARD_RULES };
  }

  async dispatchBoard(organizationId: string) {
    const [vehicles, drivers] = await Promise.all([
      this.prisma.vehicle.findMany({
        where: { organizationId },
        orderBy: { plate: "asc" },
      }),
      this.prisma.driver.findMany({
        where: { organizationId },
        orderBy: { name: "asc" },
      }),
    ]);

    const vehicleRows = await Promise.all(
      vehicles.map((v) => this.getVehicleReadiness(organizationId, v.id)),
    );
    const driverRows = await Promise.all(
      drivers.map((d) => this.getDriverReadiness(organizationId, d.id)),
    );

    return { vehicles: vehicleRows, drivers: driverRows, rules: HARD_RULES };
  }
}
