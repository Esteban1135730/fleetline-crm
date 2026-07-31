import { UnprocessableEntityException } from "@nestjs/common";
import { TicketPriority, TicketStatus, VisitorKind } from "@fsg/db";
import {
  buildVisitorPass,
  computeSlaDueAt,
  isSlaBreached,
  resolveEscalationTarget,
  resolveSlaHours,
} from "./pqrs.calc";
import { PqrsTicketService } from "./pqrs-ticket.service";
import {
  VISITOR_CHECKIN_DENIED,
  VisitorControlService,
} from "./visitor-control.service";

describe("resolveSlaHours / SLA tracking", () => {
  it("asigna SLA según tipo y prioridad", () => {
    expect(resolveSlaHours("CLAIM", "URGENT")).toBe(4);
    expect(resolveSlaHours("PETITION", "LOW")).toBe(72);
    expect(resolveSlaHours("SUGGESTION", "MEDIUM")).toBe(72);
    expect(resolveSlaHours("COMPLAINT", "HIGH")).toBe(12);
  });

  it("detecta breach cuando resolución supera dueAt", () => {
    const created = new Date("2026-07-31T08:00:00.000Z");
    const due = computeSlaDueAt(created, 4);
    expect(due.toISOString()).toBe("2026-07-31T12:00:00.000Z");
    expect(
      isSlaBreached(due, new Date("2026-07-31T13:00:00.000Z")),
    ).toBe(true);
    expect(
      isSlaBreached(due, new Date("2026-07-31T11:00:00.000Z")),
    ).toBe(false);
  });
});

describe("resolveEscalationTarget", () => {
  it("escala a RRHH con conductor + CLAIM urgente", () => {
    const e = resolveEscalationTarget({
      type: "CLAIM",
      priority: "URGENT",
      driverId: "drv-1",
    });
    expect(e.rrhh).toBe(true);
  });

  it("escala a HQSE con vehículo + HIGH", () => {
    const e = resolveEscalationTarget({
      type: "COMPLAINT",
      priority: "HIGH",
      vehicleId: "veh-1",
    });
    expect(e.hqse).toBe(true);
  });
});

describe("PqrsTicketService — estado y SLA", () => {
  it("create setea slaDueAt y resolve marca estado RESOLVED", async () => {
    const createdAt = new Date("2026-07-31T10:00:00.000Z");
    const create = jest.fn().mockResolvedValue({
      id: "t-1",
      code: "PQRS-2026-0001",
      subject: "Mal trato conductor",
      pqrsType: "CLAIM",
      priority: TicketPriority.URGENT,
      status: TicketStatus.OPEN,
      slaHours: 4,
      slaDueAt: computeSlaDueAt(createdAt, 4),
      createdAt,
      escalatedToRrhh: true,
      escalatedToHqse: false,
      customer: null,
      vehicle: null,
      driver: { id: "drv-1", name: "Juan", document: "1" },
      assignee: null,
    });
    const findFirst = jest.fn().mockResolvedValue({
      id: "t-1",
      status: TicketStatus.OPEN,
      slaHours: 4,
      slaDueAt: computeSlaDueAt(createdAt, 4),
      createdAt,
    });
    const update = jest.fn().mockImplementation(({ data }) =>
      Promise.resolve({
        id: "t-1",
        code: "PQRS-2026-0001",
        status: data.status,
        resolvedAt: data.resolvedAt,
        slaBreached: data.slaBreached,
        resolutionNotes: data.resolutionNotes,
        customer: null,
        vehicle: null,
        driver: null,
        assignee: null,
      }),
    );
    const emit = jest.fn().mockResolvedValue(undefined);

    const prisma = {
      customer: { findFirst: jest.fn() },
      vehicle: { findFirst: jest.fn() },
      driver: {
        findFirst: jest.fn().mockResolvedValue({ id: "drv-1" }),
      },
      ticket: {
        count: jest.fn().mockResolvedValue(0),
        create,
        findFirst,
        update,
      },
    };

    const svc = new PqrsTicketService(prisma as never, { emit } as never);
    const created = await svc.create("org-1", {
      subject: "Mal trato conductor",
      requester: "Cliente ACME",
      message: "Reclamo por mal manejo del conductor",
      type: "CLAIM",
      priority: "URGENT",
      driverId: "drv-1",
    });

    expect(created.sla.hours).toBe(4);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pqrsType: "CLAIM",
          priority: "URGENT",
          slaHours: 4,
          escalatedToRrhh: true,
        }),
      }),
    );
    expect(emit).toHaveBeenCalledWith(
      "pqrs.ticket.escalated.rrhh",
      expect.objectContaining({ driverId: "drv-1" }),
    );

    const resolved = await svc.resolve("org-1", "t-1", {
      resolutionNotes: "Capacitación programada en RRHH",
    });
    expect(resolved.status).toBe(TicketStatus.RESOLVED);
    expect(resolved.slaTracking).toBeDefined();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: TicketStatus.RESOLVED,
          resolutionNotes: "Capacitación programada en RRHH",
        }),
      }),
    );
  });
});

describe("VisitorControlService — check-in / check-out QR", () => {
  it("genera pase QR en check-in y libera en check-out", async () => {
    const create = jest.fn().mockImplementation(({ data }) =>
      Promise.resolve({
        id: "vis-1",
        ...data,
        checkedOutAt: null,
      }),
    );
    const update = jest.fn().mockImplementation(({ data }) =>
      Promise.resolve({
        id: "vis-1",
        name: "Ana López",
        document: "10203040",
        passCode: "PV-TEST-3040",
        checkedInAt: new Date("2026-07-31T09:00:00.000Z"),
        checkedOutAt: data.checkedOutAt,
      }),
    );

    const prisma = {
      visitor: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null) // open duplicate check
          .mockResolvedValueOnce({
            id: "vis-1",
            name: "Ana López",
            passCode: "PV-TEST-3040",
            checkedInAt: new Date("2026-07-31T09:00:00.000Z"),
            checkedOutAt: null,
          }),
        create,
        update,
      },
    };

    const svc = new VisitorControlService(prisma as never);
    const inResult = await svc.checkIn("org-1", {
      name: "Ana López",
      document: "10203040",
      reason: "Reunión comercial",
      hostName: "Recepción Norte",
      siteLabel: "PATIO_BOG",
      kind: "VISITOR",
    });

    expect(inResult.pass.passCode).toMatch(/^PV-/);
    expect(inResult.pass.qrPayload).toContain("VISITOR_PASS");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          passCode: expect.stringMatching(/^PV-/),
          qrPayload: expect.any(String),
          badgeIssuedAt: expect.any(Date),
        }),
      }),
    );

    const out = await svc.checkOut("org-1", { visitorId: "vis-1" });
    expect(out.checkedOutAt).toBeTruthy();
    expect(out.dwellMinutes).toBeGreaterThanOrEqual(0);
  });

  it("rechaza contratista sin ARL vigente", async () => {
    const svc = new VisitorControlService({
      visitor: { findFirst: jest.fn(), create: jest.fn() },
    } as never);

    await expect(
      svc.checkIn("org-1", {
        name: "Contratista X",
        document: "900111",
        reason: "Mantenimiento eléctrico",
        hostName: "Jefe Patio",
        kind: "CONTRACTOR",
        arlValid: false,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    try {
      await svc.checkIn("org-1", {
        name: "Contratista X",
        document: "900111",
        reason: "Mantenimiento eléctrico",
        hostName: "Jefe Patio",
        kind: "CONTRACTOR",
        arlValid: false,
      });
    } catch (e) {
      const body = (e as UnprocessableEntityException).getResponse() as {
        error: string;
      };
      expect(body.error).toBe(VISITOR_CHECKIN_DENIED);
    }
  });

  it("buildVisitorPass emite código y payload QR", () => {
    const pass = buildVisitorPass({
      organizationId: "org-1",
      document: "1234567890",
      name: "Visitante",
      siteLabel: "SEDE_A",
    });
    expect(pass.passCode).toMatch(/^PV-/);
    const parsed = JSON.parse(pass.qrPayload);
    expect(parsed.kind).toBe("VISITOR_PASS");
    expect(parsed.site).toBe("SEDE_A");
  });
});

describe("VisitorKind enum smoke", () => {
  it("expone VISITOR y CONTRACTOR", () => {
    expect(VisitorKind.VISITOR).toBe("VISITOR");
    expect(VisitorKind.CONTRACTOR).toBe("CONTRACTOR");
  });
});
