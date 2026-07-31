import { VehicleStatus } from "@fsg/db";
import { HqseIncidentService } from "./hqse-incident.service";
import {
  HQSE_DRIVER_BLOCK_REASON,
  HQSE_VEHICLE_BLOCK_REASON,
  calculatePesvScorecard,
} from "./pesv.calc";

describe("calculatePesvScorecard — cumplimiento normativo", () => {
  it("calcula score ponderado y status NOMINAL", () => {
    const r = calculatePesvScorecard({
      riskControlsTotal: 10,
      riskControlsCompliant: 10,
      driversTotal: 20,
      driversWithValidTraining: 20,
      drillsScheduled: 4,
      drillsCompleted: 4,
      preopsTotal: 100,
      preopsApproved: 100,
    });
    expect(r.overallScore).toBe(100);
    expect(r.systemStatus).toBe("NOMINAL");
    expect(r.pillars).toHaveLength(4);
    expect(r.regulatorLabel).toMatch(/Supertransporte/);
  });

  it("marca ALERT cuando score entre 70 y 85", () => {
    // 0.3*0.8 + 0.25*0.8 + 0.2*0.8 + 0.25*0.8 = 0.8 → 80
    const r = calculatePesvScorecard({
      riskControlsTotal: 10,
      riskControlsCompliant: 8,
      driversTotal: 10,
      driversWithValidTraining: 8,
      drillsScheduled: 5,
      drillsCompleted: 4,
      preopsTotal: 10,
      preopsApproved: 8,
    });
    expect(r.overallScore).toBe(80);
    expect(r.systemStatus).toBe("ALERT");
  });

  it("marca CRITICAL cuando score < 70", () => {
    const r = calculatePesvScorecard({
      riskControlsTotal: 10,
      riskControlsCompliant: 3,
      driversTotal: 10,
      driversWithValidTraining: 4,
      drillsScheduled: 4,
      drillsCompleted: 1,
      preopsTotal: 20,
      preopsApproved: 8,
    });
    expect(r.overallScore).toBeLessThan(70);
    expect(r.systemStatus).toBe("CRITICAL");
  });

  it("trata denominador 0 como cumplimiento pleno del pilar", () => {
    const r = calculatePesvScorecard({
      riskControlsTotal: 0,
      riskControlsCompliant: 0,
      driversTotal: 0,
      driversWithValidTraining: 0,
      drillsScheduled: 0,
      drillsCompleted: 0,
      preopsTotal: 0,
      preopsApproved: 0,
    });
    expect(r.overallScore).toBe(100);
    expect(r.systemStatus).toBe("NOMINAL");
  });
});

describe("HqseIncidentService — bloqueos CRITICAL", () => {
  it("CRITICAL activa MAINTENANCE+complianceBlocked, dispatchBlocked y OT peritaje", async () => {
    const vehicleUpdate = jest.fn().mockResolvedValue({
      id: "veh-1",
      plate: "BOG-892",
      status: VehicleStatus.MAINTENANCE,
      complianceBlocked: true,
    });
    const driverUpdate = jest.fn().mockResolvedValue({
      id: "drv-1",
      name: "Carlos Pérez",
      dispatchBlocked: true,
      blockReason: HQSE_DRIVER_BLOCK_REASON,
    });
    const workOrderCreate = jest.fn().mockResolvedValue({
      id: "wo-1",
      code: "OT-HQSE-0001",
    });
    const incidentUpdate = jest.fn().mockResolvedValue({});
    const incidentCreate = jest.fn().mockResolvedValue({
      id: "inc-1",
      code: "INC-2026-0001",
      title: "Colisión frontal",
      severity: "CRITICAL",
      vehicleId: "veh-1",
      driverId: "drv-1",
      autoBlocked: false,
      vehicle: null,
      driver: null,
    });
    const incidentFindUnique = jest.fn().mockResolvedValue({
      id: "inc-1",
      code: "INC-2026-0001",
      severity: "CRITICAL",
      autoBlocked: true,
      workOrderId: "wo-1",
      vehicle: {
        id: "veh-1",
        plate: "BOG-892",
        status: VehicleStatus.MAINTENANCE,
        complianceBlocked: true,
      },
      driver: {
        id: "drv-1",
        name: "Carlos Pérez",
        document: "123",
        dispatchBlocked: true,
        blockReason: HQSE_DRIVER_BLOCK_REASON,
      },
    });

    const prisma = {
      vehicle: {
        findFirst: jest.fn().mockResolvedValue({ id: "veh-1", plate: "BOG-892" }),
        update: vehicleUpdate,
      },
      driver: {
        findFirst: jest.fn().mockResolvedValue({ id: "drv-1", name: "Carlos" }),
        update: driverUpdate,
      },
      hqseIncident: {
        count: jest.fn().mockResolvedValue(0),
        create: incidentCreate,
        update: incidentUpdate,
        findUniqueOrThrow: incidentFindUnique,
      },
      workOrder: {
        count: jest.fn().mockResolvedValue(0),
        create: workOrderCreate,
      },
    };
    const kafka = { emit: jest.fn().mockResolvedValue(undefined) };
    const svc = new HqseIncidentService(prisma as never, kafka as never);

    const out = await svc.create("org-1", {
      title: "Colisión frontal",
      severity: "CRITICAL",
      vehicleId: "veh-1",
      driverId: "drv-1",
    });

    expect(vehicleUpdate).toHaveBeenCalledWith({
      where: { id: "veh-1" },
      data: expect.objectContaining({
        status: VehicleStatus.MAINTENANCE,
        complianceBlocked: true,
        complianceReason: expect.stringContaining(HQSE_VEHICLE_BLOCK_REASON),
      }),
      select: expect.any(Object),
    });
    expect(driverUpdate).toHaveBeenCalledWith({
      where: { id: "drv-1" },
      data: expect.objectContaining({
        dispatchBlocked: true,
        blockReason: HQSE_DRIVER_BLOCK_REASON,
      }),
      select: expect.any(Object),
    });
    expect(workOrderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          vehicleId: "veh-1",
          description: expect.stringContaining("[CRITICAL] Peritaje HQSE"),
        }),
      }),
    );
    expect(kafka.emit).toHaveBeenCalledWith(
      "hqse.incident.severe",
      expect.objectContaining({
        organizationId: "org-1",
        severity: "CRITICAL",
        vehicleId: "veh-1",
        driverId: "drv-1",
      }),
    );
    expect(out.autoActions?.vehicleBlocked?.complianceBlocked).toBe(true);
    expect(out.autoActions?.driverBlocked?.dispatchBlocked).toBe(true);
    expect(out.autoActions?.workOrder?.code).toBe("OT-HQSE-0001");
    expect(out.autoBlocked).toBe(true);
  });

  it("MINOR no dispara bloqueos automáticos", async () => {
    const vehicleUpdate = jest.fn();
    const driverUpdate = jest.fn();
    const prisma = {
      vehicle: { findFirst: jest.fn(), update: vehicleUpdate },
      driver: { findFirst: jest.fn(), update: driverUpdate },
      hqseIncident: {
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn().mockResolvedValue({
          id: "inc-2",
          code: "INC-2026-0002",
          severity: "MINOR",
          autoBlocked: false,
          vehicle: null,
          driver: null,
        }),
        update: jest.fn(),
      },
      workOrder: { count: jest.fn(), create: jest.fn() },
    };
    const kafka = { emit: jest.fn() };
    const svc = new HqseIncidentService(prisma as never, kafka as never);

    const out = await svc.create("org-1", {
      title: "Rayón menor",
      severity: "MINOR",
    });

    expect(vehicleUpdate).not.toHaveBeenCalled();
    expect(driverUpdate).not.toHaveBeenCalled();
    expect(kafka.emit).not.toHaveBeenCalled();
    expect(out.autoActions).toBeNull();
  });
});
