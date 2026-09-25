import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  AllowDirectiveQuery,
  DirectiveReadOnlyGuard,
} from "./directive-readonly.guard";
import { PresidenciaService } from "./presidencia.service";
import { ExecutiveKpiService } from "./executive-kpi.service";
import {
  assertReadOnlySql,
  TextToSqlAssistantService,
} from "./text-to-sql-assistant.service";
import { ThreeWayMatchStatus, TripStatus } from "@fsg/db";

function mockCtx(
  method: string,
  user?: { role?: string; directiveReadOnly?: boolean },
  allowQuery = false,
  path = "/operaciones/algo",
) {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(allowQuery),
  } as unknown as Reflector;
  const guard = new DirectiveReadOnlyGuard(reflector);
  const ctx = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ method, user, originalUrl: path, url: path, path }),
    }),
  } as never;
  return { guard, ctx, reflector };
}

describe("DirectiveReadOnlyGuard — Founder's Canvas", () => {
  it("bloquea POST operativo de sesión directiva con 403", () => {
    const { guard, ctx } = mockCtx("POST", {
      role: "PRESIDENTE",
      directiveReadOnly: true,
    });
    try {
      guard.canActivate(ctx);
      throw new Error("expected 403");
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenException);
      expect((e as ForbiddenException).getResponse()).toMatchObject({
        error: "DIRECTIVE_READ_ONLY",
      });
    }
  });

  it("permite ask-ai cuando @AllowDirectiveQuery", () => {
    const { guard, ctx } = mockCtx(
      "POST",
      { directiveReadOnly: true, role: "finanzas" },
      true,
    );
    expect(guard.canActivate(ctx)).toBe(true);
    expect(AllowDirectiveQuery).toBeDefined();
  });

  it("permite GET y no restringe roles operativos", () => {
    expect(
      mockCtx("GET", { role: "PRESIDENCIA" }).guard.canActivate(
        mockCtx("GET", { role: "PRESIDENCIA" }).ctx,
      ),
    ).toBe(true);
    expect(
      mockCtx("POST", { role: "despacho" }).guard.canActivate(
        mockCtx("POST", { role: "despacho" }).ctx,
      ),
    ).toBe(true);
  });

  it("permite PATCH /auth/password en sesión directiva (primer login)", () => {
    const { guard, ctx } = mockCtx(
      "PATCH",
      { role: "presidente", directiveReadOnly: true },
      false,
      "/auth/password",
    );
    expect(guard.canActivate(ctx)).toBe(true);
  });
});

describe("PresidenciaService — canvas KPIs + ExecutiveQueryLog", () => {
  function buildPrisma() {
    const executiveCreate = jest.fn().mockResolvedValue({ id: "eql-1" });
    const prisma = {
      trip: {
        count: jest.fn().mockResolvedValue(12),
        aggregate: jest.fn().mockResolvedValue({
          _sum: { fareAmount: 4_800_000 },
        }),
        groupBy: jest.fn().mockResolvedValue([
          {
            origin: "Bogotá",
            destination: "Medellín",
            _sum: { fareAmount: 3_000_000 },
            _count: { _all: 8 },
          },
          {
            origin: "Cali",
            destination: "Pereira",
            _sum: { fareAmount: 1_800_000 },
            _count: { _all: 4 },
          },
        ]),
        findMany: jest.fn().mockResolvedValue([
          {
            id: "t1",
            origin: "Bogotá",
            destination: "Medellín",
            routeExpenses: [{ amount: 200_000 }],
          },
          {
            id: "t2",
            origin: "Cali",
            destination: "Pereira",
            routeExpenses: [{ amount: 50_000 }],
          },
        ]),
      },
      journalLine: {
        findMany: jest.fn().mockImplementation(async (args: {
          where?: { OR?: Array<{ debitAccountId?: string; creditAccountId?: string }> };
          select?: { amount?: boolean };
        }) => {
          // Mayor para saldos de caja
          const or = args?.where?.OR;
          if (or?.some((c) => c.debitAccountId || c.creditAccountId)) {
            const debitId = or.find((c) => c.debitAccountId)?.debitAccountId;
            if (debitId === "acc-1") {
              return [
                {
                  amount: 80_000_000,
                  debitAccountId: "acc-1",
                  creditAccountId: "other",
                },
              ];
            }
            if (debitId === "acc-2") {
              return [
                {
                  amount: 120_000_000,
                  debitAccountId: "acc-2",
                  creditAccountId: "other",
                },
              ];
            }
            return [];
          }
          // Ingresos contables (módulo 04)
          return [{ amount: 4_500_000 }];
        }),
      },
      vehicle: {
        findMany: jest.fn().mockResolvedValue([
          { id: "v1", complianceBlocked: true },
          { id: "v2", complianceBlocked: false },
          { id: "v3", complianceBlocked: false },
          { id: "v4", complianceBlocked: true },
        ]),
        count: jest.fn().mockResolvedValue(2),
        groupBy: jest.fn().mockResolvedValue([
          { status: "IN_SERVICE", _count: { _all: 1 } },
          { status: "AVAILABLE", _count: { _all: 1 } },
          { status: "COMPLIANCE_BLOCKED", _count: { _all: 2 } },
        ]),
      },
      complianceDocument: { findMany: jest.fn().mockResolvedValue([]) },
      transportContract: {
        count: jest.fn().mockResolvedValue(2),
        aggregate: jest.fn().mockResolvedValue({
          _sum: { monthlyValue: 0 },
          _count: { _all: 0 },
        }),
      },
      commercialIntelligentQuote: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { proposedRatePerKm: 0 },
          _count: { _all: 0 },
        }),
      },
      purchaseOrder: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { totalEstimated: 1_200_000 },
        }),
      },
      account: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([
          { id: "acc-1", code: "1105", name: "Caja general" },
          { id: "acc-2", code: "1110", name: "Banco Colombia" },
        ]),
      },
      managerialOverride: { count: jest.fn().mockResolvedValue(0) },
      paymentSchedule: {
        findMany: jest.fn().mockImplementation(async (args: {
          where?: {
            dueDate?: { gte?: Date; lte?: Date };
            OR?: Array<{ dueDate?: null | { lte?: Date } }>;
            status?: unknown;
          };
          select?: { amount?: boolean; dueDate?: boolean };
        }) => {
          // cash-breakdown: vencidas + ventana 7 días
          if (args?.where?.OR?.some((c) => c.dueDate === null || c.dueDate?.lte)) {
            const soon = new Date();
            soon.setDate(soon.getDate() + 3);
            return [
              {
                id: "ps-1",
                invoiceId: "inv-pay-1",
                counterparty: "Proveedor Demo",
                amount: 20_000_000,
                dueDate: soon,
                status: "QUEUED",
              },
            ];
          }
          // executive KPI cola
          return [
            { amount: 1_000_000, dueDate: new Date("2020-01-01") },
            { amount: 500_000, dueDate: new Date("2099-01-01") },
          ];
        }),
        aggregate: jest.fn().mockResolvedValue({
          _sum: { amount: 1_500_000 },
        }),
      },
      invoice: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { amount: 750_000 },
          _count: 2,
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      threeWayMatch: {
        groupBy: jest.fn().mockResolvedValue([
          { status: ThreeWayMatchStatus.APPROVED, _count: { _all: 8 } },
          {
            status: ThreeWayMatchStatus.DISCREPANCY_REJECTED,
            _count: { _all: 2 },
          },
          { status: ThreeWayMatchStatus.PENDING, _count: { _all: 1 } },
        ]),
      },
      qualityEvent: {
        aggregate: jest.fn().mockResolvedValue({
          _avg: { npsScore: 74 },
          _count: { _all: 10 },
        }),
      },
      commercialDeal: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      executiveQueryLog: { create: executiveCreate },
    };
    return { prisma, executiveCreate };
  }

  it("consolida módulos 04, 06, 08, 09 y 10 y registra ExecutiveQueryLog", async () => {
    const { prisma, executiveCreate } = buildPrisma();
    const kpis = new ExecutiveKpiService(prisma as never);
    const textToSql = { ask: jest.fn() } as unknown as TextToSqlAssistantService;
    const kafka = { emit: jest.fn().mockResolvedValue(undefined) };
    const svc = new PresidenciaService(
      prisma as never,
      kpis,
      textToSql,
      kafka as never,
    );

    const out = await svc.canvasKpis("org-1", "user-presidencia");

    expect(out.profitability.module).toBe("04+10");
    expect(out.profitability.tripsCompleted).toBe(12);
    expect(out.profitability.grossFare).toBe(4_800_000);
    expect(out.profitability.journalIncomePosted).toBe(4_500_000);
    expect(out.profitability.byRoute[0].routeKey).toContain("Bogotá");

    expect(out.killSwitch.module).toBe("06");
    expect(out.killSwitch.totalUnits).toBe(4);
    expect(out.killSwitch.blockedUnits).toBe(2);
    expect(out.killSwitch.blockedPct).toBe(50);

    expect(out.cashFlow.module).toBe("09");
    expect(out.cashFlow.queuedPayables).toBe(2);
    expect(out.cashFlow.atRiskAmount).toBe(1_000_000 + 750_000);

    expect(out.procurementDiscrepancies.module).toBe("08");
    expect(out.procurementDiscrepancies.rejectedMatches).toBe(2);
    expect(out.procurementDiscrepancies.approvedMatches).toBe(8);

    expect(out.pillars.nps.value).toBe(74);
    expect(out.pillars.liquidity.label).toBe("Caja Libre");
    // 80M + 120M − 20M pagos 7d
    expect(out.pillars.liquidity.valueCop).toBe(180_000_000);
    expect(out.cashFlow.receivableAtRiskAmount).toBe(0);

    expect(out.opsStatus.opsStatus).toBe("CRITICAL");
    expect(out.opsStatus.blockedVehicles).toBe(2);
    expect(out.opsStatus.sarlaftBlocks).toBe(1);
    expect(out.opsStatus.reason).toBe("2 unidades SOAT/FUEC · 1 SARLAFT");
    expect(out.opsStatus.href).toBe("/tramites");

    expect(executiveCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: "org-1",
        userId: "user-presidencia",
        utterance: "GET /presidencia/canvas-kpis",
      }),
    });

    expect(prisma.trip.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: TripStatus.COMPLETED }),
      }),
    );
  });
});

describe("TextToSqlAssistantService — audit + read-only SQL", () => {
  it("registra ExecutiveQueryLog al preguntar", async () => {
    const create = jest.fn().mockResolvedValue({ id: "log-ai-1" });
    const prisma = { executiveQueryLog: { create } };
    const svc = new TextToSqlAssistantService(prisma as never);

    const out = await svc.ask({
      organizationId: "org-1",
      userId: "user-1",
      question: "¿Cuál fue la ruta con más bloqueos por SOAT este mes?",
    });

    expect(out.engine).toBe("heuristic");
    expect(out.sql.toLowerCase()).toContain("select");
    expect(out.sql).toContain("SOAT");
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: "org-1",
        userId: "user-1",
        utterance: expect.stringContaining("SOAT"),
        generatedSql: expect.stringMatching(/^\s*SELECT/i),
      }),
    });
  });

  it("rechaza SQL mutativo", () => {
    expect(() => assertReadOnlySql("DELETE FROM \"Trip\"")).toThrow();
    expect(() => assertReadOnlySql("SELECT 1; DROP TABLE \"Trip\"")).toThrow();
  });
});
