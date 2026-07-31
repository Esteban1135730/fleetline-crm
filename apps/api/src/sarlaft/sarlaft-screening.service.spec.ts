import { ForbiddenException } from "@nestjs/common";
import { SarlaftRisk } from "@fsg/db";
import { RestrictiveListsClient } from "./restrictive-lists.client";
import {
  SARLAFT_BLOCK_SCORE,
  SarlaftScreeningService,
} from "./sarlaft-screening.service";
import { SarlaftComplianceGuard } from "./sarlaft-compliance.guard";

describe("RestrictiveListsClient — listas mock", () => {
  const client = new RestrictiveListsClient();

  it("marca NIT en lista OFAC con score >= 80", async () => {
    const r = await client.screen("900.999.888");
    expect(r.matched).toBe(true);
    expect(r.riskScore).toBeGreaterThanOrEqual(SARLAFT_BLOCK_SCORE);
    expect(r.hits.some((h) => h.list === "OFAC")).toBe(true);
  });

  it("documento limpio sin hits", async () => {
    const r = await client.screen("901234567");
    expect(r.matched).toBe(false);
    expect(r.riskScore).toBe(0);
  });
});

describe("SarlaftScreeningService — bloqueo de entidad", () => {
  it("screenEntity setea sarlaftBlocked cuando hay match restrictivo", async () => {
    const supplierUpdate = jest.fn().mockResolvedValue({});
    const checkCreate = jest.fn().mockResolvedValue({
      id: "alert-1",
      document: "900999888",
      risk: SarlaftRisk.BLOCKED,
      riskScore: 95,
    });
    const auditCreate = jest.fn().mockResolvedValue({});

    const prisma = {
      supplier: {
        findFirst: jest.fn().mockResolvedValue({
          id: "sup-1",
          name: "Proveedor OFAC",
          nit: "900999888",
          organizationId: "org-1",
        }),
        update: supplierUpdate,
      },
      employee: { findFirst: jest.fn(), update: jest.fn() },
      customer: { findFirst: jest.fn(), update: jest.fn() },
      sarlaftCheck: { create: checkCreate },
      auditLog: { create: auditCreate },
    };

    const svc = new SarlaftScreeningService(
      prisma as never,
      new RestrictiveListsClient(),
    );

    const out = await svc.screenEntity(
      "org-1",
      "SUPPLIER",
      "sup-1",
      "900999888",
    );

    expect(out.sarlaftBlocked).toBe(true);
    expect(out.screening.riskScore).toBeGreaterThanOrEqual(80);
    expect(supplierUpdate).toHaveBeenCalledWith({
      where: { id: "sup-1" },
      data: expect.objectContaining({
        sarlaftBlocked: true,
        sarlaftRiskScore: expect.any(Number),
      }),
    });
    expect(checkCreate).toHaveBeenCalled();
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "SARLAFT_SCREEN" }),
      }),
    );
  });
});

describe("SarlaftComplianceGuard — Tesorería 403", () => {
  it("rebota desembolso a proveedor bloqueado con SARLAFT_COMPLIANCE_BLOCKED", async () => {
    const guard = new SarlaftComplianceGuard({
      supplier: {
        findFirst: jest.fn().mockResolvedValue({
          id: "sup-blocked",
          name: "Bloqueado SA",
          nit: "900999888",
          sarlaftBlocked: true,
        }),
      },
      sarlaftCheck: { findFirst: jest.fn() },
    } as never);

    try {
      await guard.assertSupplierClear(
        "org-1",
        "sup-blocked",
        "TREASURY_DISBURSE",
      );
      throw new Error("expected 403");
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenException);
      expect((e as ForbiddenException).getStatus()).toBe(403);
      expect((e as ForbiddenException).getResponse()).toMatchObject({
        error: "SARLAFT_COMPLIANCE_BLOCKED",
        context: "TREASURY_DISBURSE",
      });
    }
  });

  it("permite proveedor sin bloqueo", async () => {
    const guard = new SarlaftComplianceGuard({
      supplier: {
        findFirst: jest.fn().mockResolvedValue({
          id: "sup-ok",
          name: "Limpio SA",
          nit: "901000111",
          sarlaftBlocked: false,
        }),
      },
      sarlaftCheck: { findFirst: jest.fn().mockResolvedValue(null) },
    } as never);

    const s = await guard.assertSupplierClear(
      "org-1",
      "sup-ok",
      "TREASURY_DISBURSE",
    );
    expect(s?.id).toBe("sup-ok");
  });
});
