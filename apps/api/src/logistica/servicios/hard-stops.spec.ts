/**
 * Hard-Stops INRETRANS OS — lógica de bloqueo en alta de servicio (M03/M07/M12).
 * Tests de integración de reglas (sin Nest DI) alineados a createServicio.
 */
import { HARD_RULES } from "@fsg/shared";
import { VehicleStatus } from "@fsg/db";

export type GateDriver = {
  id: string;
  dispatchBlocked: boolean;
  blockReason?: string | null;
  fatigueScore: number;
};

export type GateVehicle = {
  id: string;
  plate: string;
  status: VehicleStatus;
  complianceBlocked: boolean;
  complianceReason?: string | null;
};

export type GateContract = {
  ok: boolean;
  code?: string;
  message?: string;
};

export function evaluateServicioHardStops(input: {
  driver?: GateDriver | null;
  vehicle?: GateVehicle | null;
  contractGate?: GateContract | null;
  complianceOk?: boolean;
  complianceBlocks?: string[];
}): { ok: boolean; blocks: string[]; message?: string } {
  const blocks: string[] = [];

  if (input.contractGate && !input.contractGate.ok) {
    blocks.push(input.contractGate.code || "CONTRACT_QUOTA_OR_VALIDITY_BLOCKED");
    return {
      ok: false,
      blocks,
      message: input.contractGate.message || "Hard-Stop Comercial: sin cupo/vigencia",
    };
  }

  if (input.driver?.dispatchBlocked) {
    blocks.push("DRIVER_DISPATCH_BLOCKED");
  }
  if (
    input.driver &&
    input.driver.fatigueScore >= HARD_RULES.FATIGUE_BLOCK_SCORE
  ) {
    blocks.push("DRIVER_FATIGUE");
  }

  if (input.vehicle?.status === VehicleStatus.MAINTENANCE) {
    blocks.push("VEHICLE_MAINTENANCE");
  }
  if (input.vehicle?.status === VehicleStatus.OUT_OF_SERVICE) {
    blocks.push("VEHICLE_OUT_OF_SERVICE");
  }
  if (input.vehicle?.complianceBlocked) {
    blocks.push("VEHICLE_COMPLIANCE_BLOCKED");
  }

  if (input.complianceOk === false && input.complianceBlocks?.length) {
    blocks.push(...input.complianceBlocks);
  }

  if (blocks.length) {
    return {
      ok: false,
      blocks: [...new Set(blocks)],
      message: "Hard-Stop: servicio bloqueado",
    };
  }
  return { ok: true, blocks: [] };
}

describe("Hard-Stops alta servicio (Golden Path gates)", () => {
  const driverOk: GateDriver = {
    id: "d1",
    dispatchBlocked: false,
    fatigueScore: 10,
  };
  const vehicleOk: GateVehicle = {
    id: "v1",
    plate: "ABC123",
    status: VehicleStatus.AVAILABLE,
    complianceBlocked: false,
  };

  it("permite asignación con conductor/vehículo nominales y cupo OK", () => {
    const r = evaluateServicioHardStops({
      driver: driverOk,
      vehicle: vehicleOk,
      contractGate: { ok: true },
      complianceOk: true,
    });
    expect(r.ok).toBe(true);
    expect(r.blocks).toEqual([]);
  });

  it("bloquea Comercial sin cupo/presupuesto (M03)", () => {
    const r = evaluateServicioHardStops({
      driver: driverOk,
      vehicle: vehicleOk,
      contractGate: {
        ok: false,
        code: "CONTRACT_QUOTA_OR_VALIDITY_BLOCKED",
        message: "Cupo agotado",
      },
    });
    expect(r.ok).toBe(false);
    expect(r.blocks).toContain("CONTRACT_QUOTA_OR_VALIDITY_BLOCKED");
  });

  it("bloquea fatiga RRHH (M12)", () => {
    const r = evaluateServicioHardStops({
      driver: {
        ...driverOk,
        fatigueScore: HARD_RULES.FATIGUE_BLOCK_SCORE,
      },
      vehicle: vehicleOk,
    });
    expect(r.ok).toBe(false);
    expect(r.blocks).toContain("DRIVER_FATIGUE");
  });

  it("bloquea vehículo en mantenimiento Taller (M07)", () => {
    const r = evaluateServicioHardStops({
      driver: driverOk,
      vehicle: { ...vehicleOk, status: VehicleStatus.MAINTENANCE },
    });
    expect(r.ok).toBe(false);
    expect(r.blocks).toContain("VEHICLE_MAINTENANCE");
  });

  it("bloquea unidad compliance / SARLAFT operativo", () => {
    const r = evaluateServicioHardStops({
      driver: driverOk,
      vehicle: {
        ...vehicleOk,
        complianceBlocked: true,
        complianceReason: "SARLAFT",
      },
    });
    expect(r.ok).toBe(false);
    expect(r.blocks).toContain("VEHICLE_COMPLIANCE_BLOCKED");
  });

  it("bloquea compliance gate compuesto (docs/licencia)", () => {
    const r = evaluateServicioHardStops({
      driver: driverOk,
      vehicle: vehicleOk,
      complianceOk: false,
      complianceBlocks: ["DRIVER_LICENSE_EXPIRED", "VEHICLE_SOAT_EXPIRED"],
    });
    expect(r.ok).toBe(false);
    expect(r.blocks).toEqual(
      expect.arrayContaining([
        "DRIVER_LICENSE_EXPIRED",
        "VEHICLE_SOAT_EXPIRED",
      ]),
    );
  });
});
