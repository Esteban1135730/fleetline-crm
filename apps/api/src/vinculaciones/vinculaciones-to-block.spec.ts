import { ComplianceDocType, DocStatus, VehicleStatus } from "@fsg/db";
import {
  legalBlockVehiclePatch,
  shouldBlockVehicleOnToExpiry,
} from "./dto/vinculaciones.dto";
import { VinculacionesService } from "./vinculaciones.service";

describe("shouldBlockVehicleOnToExpiry — Tarjeta de Operación", () => {
  it("bloquea en Logística cuando TO está vencida (día 0 / pasado)", () => {
    const today = new Date("2026-08-12T10:00:00.000Z");
    const expired = shouldBlockVehicleOnToExpiry({
      docType: ComplianceDocType.TARJETA_OPERACION,
      expiresAt: new Date("2026-08-12T00:00:00.000Z"),
      now: today,
    });
    expect(expired.block).toBe(true);
    expect(expired.legalRed).toBe(true);
    expect(expired.reason).toMatch(/TARJETA_OPERACION_VENCIDA/);

    const past = shouldBlockVehicleOnToExpiry({
      docType: "TARJETA_OPERACION",
      expiresAt: new Date("2026-08-01T00:00:00.000Z"),
      docStatus: DocStatus.EXPIRED,
      now: today,
    });
    expect(past.block).toBe(true);
  });

  it("no bloquea SOAT u otros docs con esta regla TO", () => {
    const r = shouldBlockVehicleOnToExpiry({
      docType: ComplianceDocType.SOAT,
      expiresAt: new Date("2020-01-01"),
    });
    expect(r.block).toBe(false);
  });

  it("no bloquea TO vigente futura", () => {
    const r = shouldBlockVehicleOnToExpiry({
      docType: ComplianceDocType.TARJETA_OPERACION,
      expiresAt: new Date("2027-01-01"),
      now: new Date("2026-08-12"),
    });
    expect(r.block).toBe(false);
  });

  it("legalBlockVehiclePatch marca COMPLIANCE_BLOCKED", () => {
    const patch = legalBlockVehiclePatch("TO vencida");
    expect(patch.complianceBlocked).toBe(true);
    expect(patch.status).toBe(VehicleStatus.COMPLIANCE_BLOCKED);
  });
});

describe("VinculacionesService.applyToExpiryBlockIfDue", () => {
  it("actualiza vehículo a ROJO legal y emite suspensión a Logística", async () => {
    const prisma = {
      vehicle: {
        update: jest.fn().mockResolvedValue({
          id: "veh-1",
          plate: "BOG-892",
          organizationId: "org-1",
          complianceBlocked: true,
          status: VehicleStatus.COMPLIANCE_BLOCKED,
        }),
      },
    };
    const kafka = { emit: jest.fn().mockResolvedValue(undefined) };
    const runt = {};
    const svc = new VinculacionesService(
      prisma as never,
      kafka as never,
      runt as never,
    );

    const result = await svc.applyToExpiryBlockIfDue("veh-1", {
      type: ComplianceDocType.TARJETA_OPERACION,
      expiresAt: new Date("2026-08-12"),
      status: DocStatus.EXPIRED,
    });

    expect(result.blocked).toBe(true);
    expect(result.logisticsRebound).toBe(true);
    expect(prisma.vehicle.update).toHaveBeenCalledWith({
      where: { id: "veh-1" },
      data: expect.objectContaining({
        complianceBlocked: true,
        status: VehicleStatus.COMPLIANCE_BLOCKED,
      }),
    });
    expect(kafka.emit).toHaveBeenCalledWith(
      "tramites.vehiculo.suspendido",
      expect.objectContaining({
        plate: "BOG-892",
        source: "vinculaciones_to_expiry",
      }),
    );
  });

  it("no muta vehículo si TO aún vigente", async () => {
    const prisma = { vehicle: { update: jest.fn() } };
    const kafka = { emit: jest.fn() };
    const svc = new VinculacionesService(
      prisma as never,
      kafka as never,
      {} as never,
    );

    const result = await svc.applyToExpiryBlockIfDue("veh-2", {
      type: ComplianceDocType.TARJETA_OPERACION,
      expiresAt: new Date(Date.now() + 30 * 86400000),
      status: DocStatus.VALID,
    });

    expect(result.blocked).toBe(false);
    expect(prisma.vehicle.update).not.toHaveBeenCalled();
    expect(kafka.emit).not.toHaveBeenCalled();
  });
});
