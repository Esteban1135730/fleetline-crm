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
) {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(allowQuery),
  } as unknown as Reflector;
  const guard = new DirectiveReadOnlyGuard(reflector);
  const ctx = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ method, user }),
    }),
  } as never;
  return { guard, ctx, reflector };
}

describe("DirectiveReadOnlyGuard — Founder's Canvas", () => {
  it("bloquea POST operativo de Presidencia con 403", () => {
    const { guard, ctx } = mockCtx("POST", { role: "PRESIDENCIA" });
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
        findMany: jest.fn().mockResolvedValue([{ amount: 4_500_000 }]),
      },
      vehicle: {
        findMany: jest.fn().mockResolvedValue([
          { id: "v1", complianceBlocked: true },
          { id: "v2", complianceBlocked: false },
          { id: "v3", complianceBlocked: false },
          { id: "v4", complianceBlocked: true },
        ]),
      },
      paymentSchedule: {
        findMany: jest.fn().mockResolvedValue([
          { amount: 1_000_000, dueDate: new Date("2020-01-01") },
          { amount: 500_000, dueDate: new Date("2099-01-01") },
        ]),
      },
      invoice: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { amount: 750_000 },
          _count: 2,
        }),
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
      executiveQueryLog: { create: executiveCreate },
    };
    return { prisma, executiveCreate };
  }

  it("consolida módulos 04, 06, 08, 09 y 10 y registra ExecutiveQueryLog", async () => {
    const { prisma, executiveCreate } = buildPrisma();
    const kpis = new ExecutiveKpiService(prisma as never);
    const svc = new PresidenciaService(prisma as never, kpis);

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
