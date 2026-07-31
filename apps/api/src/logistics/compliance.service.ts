import { BadRequestException, Injectable } from "@nestjs/common";
import {
  DocStatus,
  EmployeeStatus,
  type ProcedureType,
} from "@fsg/db";
import { HARD_RULES, type DispatchSemaphore } from "@fsg/shared";
import { PrismaService } from "../prisma/prisma.service";

const CRITICAL_DOC_TYPES: ProcedureType[] = [
  "SOAT",
  "TECNOMECANICA",
  "TARJETA_OPERACION",
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
    return (validTo.getTime() - Date.now()) / 86400000;
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
      include: { procedures: true },
    });
    if (!vehicle) {
      throw new BadRequestException("Vehículo no encontrado");
    }

    const byType = new Map<string, (typeof vehicle.procedures)[0]>();
    for (const p of vehicle.procedures) {
      const prev = byType.get(p.type);
      if (!prev || p.validTo > prev.validTo) byType.set(p.type, p);
    }

    const procedures = [...byType.values()].map((p) => {
      const days = this.daysLeft(p.validTo);
      return {
        type: p.type,
        status: p.status,
        validTo: p.validTo.toISOString(),
        daysLeft: Math.floor(days),
      };
    });

    const blockReasons: string[] = [];
    const warnings: string[] = [];
    let worst: DispatchSemaphore = "GREEN";

    for (const type of CRITICAL_DOC_TYPES) {
      const p = byType.get(type);
      if (!p) {
        warnings.push(`Sin registro de ${type} en trámites`);
        if (worst === "GREEN") worst = "YELLOW";
        continue;
      }
      const days = this.daysLeft(p.validTo);
      const sem = this.semaphoreFromDays(days);
      if (sem === "RED") {
        blockReasons.push(
          `${type} vencido (${p.validTo.toISOString().slice(0, 10)})`,
        );
        worst = "RED";
      } else if (sem === "YELLOW") {
        warnings.push(`${type} vence en ${Math.floor(days)} día(s)`);
        if (worst === "GREEN") worst = "YELLOW";
      }
    }

    if (vehicle.status === "OUT_OF_SERVICE" || vehicle.status === "MAINTENANCE") {
      blockReasons.push(`Vehículo en estado ${vehicle.status}`);
      worst = "RED";
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
    if (!driver.license?.trim()) {
      warnings.push("Sin licencia registrada en ficha de conductor");
    }

    const fatigueScore = employee?.fatigueScore ?? null;
    const employeeStatus = employee?.status ?? null;

    if (employee) {
      if (employee.status === EmployeeStatus.INACTIVE) {
        blockReasons.push("Empleado INACTIVO en RRHH");
      } else if (employee.status === EmployeeStatus.MEDICAL) {
        blockReasons.push("Empleado en estado MÉDICO — no disponible para despacho");
      } else if (employee.status === EmployeeStatus.VACATION) {
        blockReasons.push("Empleado en VACACIONES — no disponible para despacho");
      }
      if (employee.fatigueScore >= HARD_RULES.FATIGUE_BLOCK_SCORE) {
        blockReasons.push(
          `Fatiga alta (${employee.fatigueScore}/${HARD_RULES.FATIGUE_BLOCK_SCORE}) — bloqueado por RRHH`,
        );
      } else if (employee.fatigueScore >= HARD_RULES.FATIGUE_BLOCK_SCORE - 20) {
        warnings.push(`Fatiga elevada (${employee.fatigueScore})`);
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
      include: { procedures: true },
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
