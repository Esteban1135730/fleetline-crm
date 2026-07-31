import {
  ComplianceDocType,
  DocStatus,
  VehicleStatus,
} from "@fsg/db";
import { HARD_RULES } from "@fsg/shared";
import {
  ComplianceGateService,
  isNightDepart,
} from "./compliance-gate.service";
import { COMPLIANCE_BLOCK_CODES } from "./compliance-codes";

type Doc = {
  id: string;
  type: ComplianceDocType;
  status: DocStatus;
  expiresAt: Date | null;
};

function mockPrisma(vehicle: unknown, driver: unknown) {
  return {
    vehicle: {
      findFirst: jest.fn().mockResolvedValue(vehicle),
    },
    driver: {
      findFirst: jest.fn().mockResolvedValue(driver),
    },
  };
}

function baseDriver(over: Record<string, unknown> = {}) {
  return {
    id: "drv-1",
    name: "Carlos",
    document: "100",
    active: true,
    dispatchBlocked: false,
    blockReason: null,
    fatigueScore: 10,
    licenseNumber: "LIC-1",
    licenseExpiresAt: new Date(Date.now() + 86400000 * 400),
    complianceDocs: [] as Doc[],
    ...over,
  };
}

function baseVehicle(over: Record<string, unknown> = {}) {
  const future = new Date(Date.now() + 86400000 * 200);
  const docs: Doc[] = [
    {
      id: "d-soat",
      type: ComplianceDocType.SOAT,
      status: DocStatus.VALID,
      expiresAt: future,
    },
    {
      id: "d-tecno",
      type: ComplianceDocType.TECNOMECANICA,
      status: DocStatus.VALID,
      expiresAt: future,
    },
    {
      id: "d-fuec",
      type: ComplianceDocType.FUEC,
      status: DocStatus.VALID,
      expiresAt: future,
    },
  ];
  return {
    id: "veh-ok",
    plate: "BUS-001",
    status: VehicleStatus.AVAILABLE,
    complianceBlocked: false,
    complianceReason: null,
    nightRestricted: false,
    complianceDocs: docs,
    fuecDocuments: [{ id: "fuec-1", validTo: future, status: DocStatus.VALID }],
    ...over,
  };
}

describe("ComplianceGateService — Hard-Stop Logística", () => {
  const orgId = "org-1";
  const departDay = new Date("2026-07-31T10:00:00");

  it("isNightDepart detecta franja 21:00–05:00", () => {
    expect(isNightDepart(new Date("2026-07-31T22:00:00"))).toBe(true);
    expect(isNightDepart(new Date("2026-07-31T03:00:00"))).toBe(true);
    expect(isNightDepart(new Date("2026-07-31T10:00:00"))).toBe(false);
  });

  it("permite despacho cuando vehículo y docs están al día (BUS-001)", async () => {
    const prisma = mockPrisma(baseVehicle(), baseDriver());
    const gate = new ComplianceGateService(prisma as never);
    const result = await gate.evaluate({
      organizationId: orgId,
      vehicleId: "veh-ok",
      driverId: "drv-1",
      departAt: departDay,
      requireFuec: true,
    });
    expect(result.ok).toBe(true);
  });

  it("bloquea vehículo con complianceBlocked / SOAT vencido (BUS-002)", async () => {
    const expired = new Date(Date.now() - 86400000 * 30);
    const future = new Date(Date.now() + 86400000 * 90);
    const blocked = baseVehicle({
      id: "veh-bad",
      plate: "BUS-002",
      status: VehicleStatus.COMPLIANCE_BLOCKED,
      complianceBlocked: true,
      complianceReason: "HARD-STOP: SOAT vencido",
      complianceDocs: [
        {
          id: "d-soat-x",
          type: ComplianceDocType.SOAT,
          status: DocStatus.EXPIRED,
          expiresAt: expired,
        },
        {
          id: "d-tecno",
          type: ComplianceDocType.TECNOMECANICA,
          status: DocStatus.VALID,
          expiresAt: future,
        },
      ],
      fuecDocuments: [],
    });

    const prisma = mockPrisma(blocked, baseDriver());
    const gate = new ComplianceGateService(prisma as never);
    const result = await gate.evaluate({
      organizationId: orgId,
      vehicleId: "veh-bad",
      driverId: "drv-1",
      departAt: departDay,
      requireFuec: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    const codes = result.violations.map((v) => v.code);
    expect(codes).toContain(COMPLIANCE_BLOCK_CODES.VEHICLE_COMPLIANCE_BLOCKED);
    expect(codes).toContain(COMPLIANCE_BLOCK_CODES.SOAT_EXPIRED);
  });

  it("bloquea por DRIVER_FATIGUE cuando fatiga >= umbral", async () => {
    const prisma = mockPrisma(
      baseVehicle(),
      baseDriver({ fatigueScore: HARD_RULES.FATIGUE_BLOCK_SCORE }),
    );
    const gate = new ComplianceGateService(prisma as never);
    const result = await gate.evaluate({
      organizationId: orgId,
      vehicleId: "veh-ok",
      driverId: "drv-1",
      departAt: departDay,
      requireFuec: true,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violations.map((v) => v.code)).toContain(
      COMPLIANCE_BLOCK_CODES.DRIVER_FATIGUE,
    );
  });

  it("bloquea Kill-Switch nocturno si vehicle.nightRestricted", async () => {
    const prisma = mockPrisma(
      baseVehicle({ nightRestricted: true }),
      baseDriver(),
    );
    const gate = new ComplianceGateService(prisma as never);
    const result = await gate.evaluate({
      organizationId: orgId,
      vehicleId: "veh-ok",
      driverId: "drv-1",
      departAt: new Date("2026-07-31T22:30:00"),
      requireFuec: true,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violations.map((v) => v.code)).toContain(
      COMPLIANCE_BLOCK_CODES.VEHICLE_NIGHT_RESTRICTED,
    );
  });
});
