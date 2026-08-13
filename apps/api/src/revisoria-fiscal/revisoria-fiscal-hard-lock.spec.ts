import { ForbiddenException } from "@nestjs/common";
import { isPathDeniedForRole, hasPermission } from "@fsg/shared";
import {
  rejectMutationIfHardLocked,
  RevisoriaFiscalService,
} from "./revisoria-fiscal.service";

describe("RBAC REVISOR_FISCAL", () => {
  it("deniega Operaciones, Ventas y Patio (403 path)", () => {
    expect(isPathDeniedForRole("revisor_fiscal", "/operaciones")).toBe(true);
    expect(isPathDeniedForRole("revisor_fiscal", "/api/v1/operaciones")).toBe(
      true,
    );
    expect(isPathDeniedForRole("revisor_fiscal", "/comercial")).toBe(true);
    expect(isPathDeniedForRole("revisor_fiscal", "/api/v1/comercial")).toBe(
      true,
    );
    expect(isPathDeniedForRole("revisor_fiscal", "/parqueadero")).toBe(true);
    expect(isPathDeniedForRole("revisor_fiscal", "/patio")).toBe(true);
  });

  it("permite lectura forense contable y CREATE solo de dictamen/cierre", () => {
    expect(
      isPathDeniedForRole("revisor_fiscal", "/revisoria-fiscal/dashboard"),
    ).toBe(false);
    expect(hasPermission("revisor_fiscal", "contabilidad", "READ")).toBe(true);
    expect(hasPermission("revisor_fiscal", "contabilidad", "UPDATE")).toBe(false);
    expect(hasPermission("revisor_fiscal", "contabilidad", "CREATE")).toBe(
      false,
    );
    expect(hasPermission("revisor_fiscal", "puc", "READ")).toBe(true);
    expect(hasPermission("revisor_fiscal", "nomina", "READ")).toBe(true);
    expect(hasPermission("revisor_fiscal", "fiscal_hard_lock", "CREATE")).toBe(
      true,
    );
    expect(hasPermission("revisor_fiscal", "fiscal_dictamen", "CREATE")).toBe(
      true,
    );
    expect(hasPermission("revisor_fiscal", "crm_comercial", "READ")).toBe(false);
    expect(hasPermission("revisor_fiscal", "logistica_despacho", "READ")).toBe(
      false,
    );
  });
});

describe("Hard Lock de periodo contable", () => {
  it("rechaza mutaciones cuando el periodo está HARD_LOCKED (403)", () => {
    expect(() =>
      rejectMutationIfHardLocked("HARD_LOCKED", "2026-07"),
    ).toThrow(ForbiddenException);

    try {
      rejectMutationIfHardLocked("HARD_LOCKED", "2026-07");
    } catch (e) {
      const err = e as ForbiddenException;
      const body = err.getResponse() as {
        statusCode: number;
        error: string;
        yearMonth: string;
      };
      expect(body.statusCode).toBe(403);
      expect(body.error).toBe("ACCOUNTING_PERIOD_HARD_LOCKED");
      expect(body.yearMonth).toBe("2026-07");
    }
  });

  it("permite mutaciones cuando el periodo está OPEN", () => {
    expect(() => rejectMutationIfHardLocked("OPEN", "2026-07")).not.toThrow();
    expect(() => rejectMutationIfHardLocked(null, "2026-07")).not.toThrow();
  });

  it("assertPeriodWritable rechaza tras hard lock (mock prisma)", async () => {
    const prisma = {
      accountingPeriod: {
        findUnique: jest.fn().mockResolvedValue({
          status: "HARD_LOCKED",
          yearMonth: "2026-08",
        }),
      },
    };
    const service = new RevisoriaFiscalService(prisma as never);
    await expect(
      service.assertPeriodWritable("org-1", new Date("2026-08-15T12:00:00Z")),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("assertPeriodWritable permite periodo abierto", async () => {
    const prisma = {
      accountingPeriod: {
        findUnique: jest.fn().mockResolvedValue({
          status: "OPEN",
          yearMonth: "2026-08",
        }),
      },
    };
    const service = new RevisoriaFiscalService(prisma as never);
    await expect(
      service.assertPeriodWritable("org-1", new Date("2026-08-15T12:00:00Z")),
    ).resolves.toBeUndefined();
  });
});
