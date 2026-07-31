import { UnprocessableEntityException } from "@nestjs/common";
import { VehicleStatus } from "@fsg/db";
import { HARD_RULES } from "@fsg/shared";
import {
  GATE_CHECKOUT_DENIED,
  YardAccessService,
} from "./yard-access.service";
import { PhysicalInspectionService } from "./physical-inspection.service";

describe("YardAccessService — talanquera / compliance", () => {
  const access = new YardAccessService({} as never);

  it("deniega CHECK_OUT si complianceBlocked", () => {
    const denial = access.evaluateCheckoutDenial(
      {
        id: "v1",
        complianceBlocked: true,
        complianceReason: "SOAT vencido",
        status: VehicleStatus.AVAILABLE,
      },
      null,
    );
    expect(denial).not.toBeNull();
    expect(denial!.reason).toBe(GATE_CHECKOUT_DENIED);
    expect(denial!.blocks.some((b) => b.includes("SOAT"))).toBe(true);
  });

  it("deniega CHECK_OUT por fatiga de conductor", () => {
    const denial = access.evaluateCheckoutDenial(
      {
        id: "v1",
        complianceBlocked: false,
        complianceReason: null,
        status: VehicleStatus.AVAILABLE,
      },
      {
        id: "d1",
        dispatchBlocked: false,
        blockReason: null,
        fatigueScore: HARD_RULES.FATIGUE_BLOCK_SCORE,
        active: true,
      },
    );
    expect(denial?.blocks).toContain("DRIVER_FATIGUE");
  });

  it("permite salida si nominal", () => {
    expect(
      access.evaluateCheckoutDenial(
        {
          id: "v1",
          complianceBlocked: false,
          complianceReason: null,
          status: VehicleStatus.AVAILABLE,
        },
        {
          id: "d1",
          dispatchBlocked: false,
          blockReason: null,
          fatigueScore: 10,
          active: true,
        },
      ),
    ).toBeNull();
  });

  it("recordAccess CHECK_OUT bloqueado → HTTP 422 GATE_CHECKOUT_DENIED", async () => {
    const prisma = {
      vehicle: {
        findFirst: jest.fn().mockResolvedValue({
          id: "v-block",
          plate: "BOG-001",
          complianceBlocked: true,
          complianceReason: "RUNT suspendido",
          status: VehicleStatus.COMPLIANCE_BLOCKED,
          odometerKm: 1000,
        }),
      },
      yardAccessLog: {
        create: jest.fn().mockResolvedValue({ id: "ya-deny" }),
      },
      yardEvent: { create: jest.fn().mockResolvedValue({}) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const svc = new YardAccessService(prisma as never);

    try {
      await svc.recordAccess("org-1", {
        kind: "CHECK_OUT",
        vehicleId: "v-block",
        odometerKm: 1050,
      });
      throw new Error("expected 422");
    } catch (e) {
      expect(e).toBeInstanceOf(UnprocessableEntityException);
      expect((e as UnprocessableEntityException).getStatus()).toBe(422);
      expect((e as UnprocessableEntityException).getResponse()).toMatchObject({
        error: GATE_CHECKOUT_DENIED,
      });
    }
  });
});

describe("PhysicalInspectionService — falla crítica → Taller", () => {
  it("crea OT crítica y reporta bloqueo IN_MAINTENANCE", async () => {
    const woCreate = jest.fn().mockResolvedValue({
      id: "wo-1",
      code: "OT-0501",
    });
    const prisma = {
      vehicle: {
        findFirst: jest.fn().mockResolvedValue({
          id: "v1",
          plate: "BOG-002",
          odometerKm: 2000,
        }),
      },
      parkingLog: { findFirst: jest.fn() },
      yardInspection: {
        create: jest.fn().mockResolvedValue({
          id: "insp-1",
          criticalSafetyFault: true,
          vehicle: {
            id: "v1",
            plate: "BOG-002",
            status: VehicleStatus.MAINTENANCE,
            complianceBlocked: true,
          },
        }),
      },
      yardEvent: { create: jest.fn().mockResolvedValue({}) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };

    const svc = new PhysicalInspectionService(prisma as never, {
      create: woCreate,
    } as never);

    const out = await svc.createInspection("org-1", {
      vehicleId: "v1",
      phase: "CHECK_IN",
      criticalSafetyFault: true,
      criticalFaultDetail: "Falla de frenos — no apto para ruta",
      fuelLevelPct: 40,
      tireCondition: "OK",
    });

    expect(woCreate).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({
        vehicleId: "v1",
        critical: true,
        severity: "CRITICAL",
        description: expect.stringContaining("[CRITICAL]"),
      }),
    );
    expect(out.vehicleBlocked).toBe(true);
    expect(out.maintenanceStatus).toBe("IN_MAINTENANCE");
    expect(out.workOrder?.code).toBe("OT-0501");
    expect(prisma.yardEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kind: "DAMAGE_CV" }),
      }),
    );
  });

  it("detecta keywords críticas en notas", () => {
    const svc = new PhysicalInspectionService({} as never, {} as never);
    expect(svc.detectCriticalFromNotes("Fuga de frenos grave")).toBe(true);
    expect(svc.detectCriticalFromNotes("rayón menor puerta")).toBe(false);
  });
});
