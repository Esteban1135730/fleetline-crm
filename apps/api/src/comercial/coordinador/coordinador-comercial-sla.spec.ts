import { LeadSlaStatus } from "@fsg/db";
import { HARD_RULES } from "@fsg/shared";
import {
  evaluateLeadSla,
  pickRoundRobinAgent,
} from "./dto/coordinador-comercial.dto";
import { CoordinadorComercialService } from "./coordinador-comercial.service";

describe("evaluateLeadSla — temporizador 2h", () => {
  const slaHours = HARD_RULES.COMERCIAL_LEAD_SLA_HOURS;

  it("marca RED y reassign cuando pasan 2h sin primer contacto", () => {
    const assignedAt = new Date("2026-08-12T10:00:00.000Z");
    const now = new Date("2026-08-12T12:00:00.000Z");
    const eval_ = evaluateLeadSla(
      { assignedAt, firstContactAt: null, slaHours },
      now,
    );
    expect(eval_.breached).toBe(true);
    expect(eval_.reassign).toBe(true);
    expect(eval_.status).toBe("RED");
    expect(eval_.hoursElapsed).toBeGreaterThanOrEqual(2);
  });

  it("no reasigna si hubo primer contacto", () => {
    const eval_ = evaluateLeadSla({
      assignedAt: new Date("2026-08-12T08:00:00.000Z"),
      firstContactAt: new Date("2026-08-12T08:30:00.000Z"),
    });
    expect(eval_.reassign).toBe(false);
    expect(eval_.status).toBe("OK");
  });

  it("WARNING cerca del vencimiento", () => {
    const assignedAt = new Date("2026-08-12T10:00:00.000Z");
    const now = new Date("2026-08-12T11:40:00.000Z"); // 1.66h de 2h
    const eval_ = evaluateLeadSla(
      { assignedAt, firstContactAt: null, slaHours: 2 },
      now,
    );
    expect(eval_.status).toBe("WARNING");
    expect(eval_.reassign).toBe(false);
  });
});

describe("pickRoundRobinAgent", () => {
  it("elige agente con mejor conversión/carga", () => {
    const pick = pickRoundRobinAgent([
      {
        userId: "a",
        openLoad: 8,
        conversionRate: 0.2,
        available: true,
        sectorAffinity: 0.3,
      },
      {
        userId: "b",
        openLoad: 2,
        conversionRate: 0.55,
        available: true,
        sectorAffinity: 0.8,
      },
      {
        userId: "c",
        openLoad: 1,
        conversionRate: 0.9,
        available: false,
        sectorAffinity: 1,
      },
    ]);
    expect(pick?.userId).toBe("b");
  });
});

describe("CoordinadorComercialService.reassignSlaBreachedLeads", () => {
  it("reasigna automáticamente lead con SLA 2h vencido sin atención", async () => {
    const assignedAt = new Date("2026-08-12T08:00:00.000Z");
    const now = new Date("2026-08-12T11:00:00.000Z"); // +3h

    const prisma = {
      commercialDeal: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "deal-sla-1",
            code: "B2B-SLA-001",
            ownerUserId: "gestor-lento",
            assignedAt,
            firstContactAt: null,
            createdAt: assignedAt,
            stage: "NUEVO_LEAD",
          },
        ]),
        update: jest.fn().mockResolvedValue({
          id: "deal-sla-1",
          ownerUserId: "gestor-rapido",
          slaStatus: LeadSlaStatus.REASSIGNED,
        }),
      },
    };

    const kafka = { emit: jest.fn() };
    const svc = new CoordinadorComercialService(
      prisma as never,
      kafka as never,
    );

    const agents = [
      {
        userId: "gestor-lento",
        name: "Lento",
        openLoad: 5,
        conversionRate: 0.2,
        available: true,
        sectorAffinity: 0.4,
      },
      {
        userId: "gestor-rapido",
        name: "Rápido",
        openLoad: 1,
        conversionRate: 0.7,
        available: true,
        sectorAffinity: 0.9,
      },
    ];

    const results = await svc.reassignSlaBreachedLeads(
      "org-1",
      agents,
      now,
    );

    expect(results).toHaveLength(1);
    expect(results[0]!.from).toBe("gestor-lento");
    expect(results[0]!.to).toBe("gestor-rapido");
    expect(results[0]!.reason).toMatch(/SLA_2H_BREACHED/);
    expect(prisma.commercialDeal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "deal-sla-1" },
        data: expect.objectContaining({
          ownerUserId: "gestor-rapido",
          reassignedFromUserId: "gestor-lento",
          slaStatus: LeadSlaStatus.REASSIGNED,
          slaBreached: true,
        }),
      }),
    );
  });

  it("no reasigna si el lead fue contactado a tiempo", async () => {
    const prisma = {
      commercialDeal: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "deal-ok",
            code: "B2B-OK",
            ownerUserId: "gestor-1",
            assignedAt: new Date("2026-08-12T10:00:00.000Z"),
            firstContactAt: new Date("2026-08-12T10:20:00.000Z"),
            createdAt: new Date("2026-08-12T10:00:00.000Z"),
            stage: "NUEVO_LEAD",
          },
        ]),
        update: jest.fn(),
      },
    };
    const svc = new CoordinadorComercialService(
      prisma as never,
      { emit: jest.fn() } as never,
    );

    const results = await svc.reassignSlaBreachedLeads(
      "org-1",
      [
        {
          userId: "gestor-1",
          openLoad: 1,
          conversionRate: 0.5,
          available: true,
          sectorAffinity: 0.5,
        },
        {
          userId: "gestor-2",
          openLoad: 0,
          conversionRate: 0.5,
          available: true,
          sectorAffinity: 0.5,
        },
      ],
      new Date("2026-08-12T14:00:00.000Z"),
    );

    expect(results).toHaveLength(0);
    expect(prisma.commercialDeal.update).not.toHaveBeenCalled();
  });
});
