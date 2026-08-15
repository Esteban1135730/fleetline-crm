import {
  isRecepcionistaDeniedModule,
  normalizeRole,
  recepcionistaCan,
  RECEPCIONISTA_PERMISSIONS,
} from "@fsg/shared";
import { ModulesGuard } from "../auth/modules.guard";
import { RecepcionService } from "./recepcion.service";

describe("RBAC Recepcionista (Flor)", () => {
  it("normaliza RECEPCION / ATENCION → recepcionista", () => {
    expect(normalizeRole("RECEPCIONISTA")).toBe("recepcionista");
    expect(normalizeRole("RECEPCION")).toBe("recepcionista");
    expect(normalizeRole("atencion")).toBe("recepcionista");
  });

  it("permite visitas omnicanal CREATE y deniega finanzas/RRHH/contratos", () => {
    expect(recepcionistaCan("visitor_control", "CREATE")).toBe(true);
    expect(recepcionistaCan("visitor_control", "UPDATE")).toBe(true);
    expect(recepcionistaCan("omnicanal", "UPDATE")).toBe(true);
    expect(recepcionistaCan("comercial_crm", "CREATE")).toBe(true);
    expect(recepcionistaCan("comercial_crm", "UPDATE")).toBe(false);
    expect(recepcionistaCan("qhse_pqrs", "CREATE")).toBe(true);
    expect(recepcionistaCan("torre_rutas", "READ")).toBe(true);
    expect(recepcionistaCan("finanzas", "READ")).toBe(false);
    expect(recepcionistaCan("rrhh", "READ")).toBe(false);
    expect(RECEPCIONISTA_PERMISSIONS.contratos).toEqual([]);
  });

  it("marca módulos denegados", () => {
    expect(isRecepcionistaDeniedModule("tesoreria")).toBe(true);
    expect(isRecepcionistaDeniedModule("rrhh")).toBe(true);
    expect(isRecepcionistaDeniedModule("comercial")).toBe(true);
    expect(isRecepcionistaDeniedModule("call_center")).toBe(false);
    expect(isRecepcionistaDeniedModule("logistica")).toBe(false);
  });

  it("ModulesGuard retorna 403 a recepcionista en /finanzas o /rrhh", () => {
    const reflector = {
      getAllAndOverride: () => ["tesoreria", "finanzas"],
    };
    const guard = new ModulesGuard(reflector as never);
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({ user: { role: "recepcionista" } }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    };
    expect(() => guard.canActivate(ctx as never)).toThrow(
      /No tienes permisos para acceder a este recurso/i,
    );

    const reflectorRrhh = {
      getAllAndOverride: () => ["rrhh"],
    };
    const guard2 = new ModulesGuard(reflectorRrhh as never);
    expect(() => guard2.canActivate(ctx as never)).toThrow(
      /No tienes permisos para acceder a este recurso/i,
    );
  });
});

describe("RecepcionService — Kafka check-in y convert-lead", () => {
  function buildService(overrides?: {
    ticket?: Record<string, unknown>;
    customerFind?: unknown;
  }) {
    const emit = jest.fn().mockResolvedValue(undefined);
    const notify = jest.fn().mockResolvedValue(undefined);
    const gatewayEmit = jest.fn();
    const visitorCreate = jest.fn().mockResolvedValue({
      id: "v1",
      name: "Carlos Mendoza",
      document: "1001001",
      company: "Globant",
      hostName: "Ana",
      hostUserId: null,
      visitClass: "B2B_MEETING",
      badgeRfid: "RFID-22",
      passCode: "PASS-1",
      boardStatus: "CHECKED_IN",
    });

    const prisma = {
      visitor: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: visitorCreate,
      },
      ticket: {
        findFirst: jest.fn().mockResolvedValue(
          overrides?.ticket ?? {
            id: "t1",
            code: "TK-1",
            meta: { receptionInbox: true },
          },
        ),
        create: jest.fn().mockResolvedValue({
          id: "t-walkin",
          code: "LEAD-2026-0001",
          meta: {},
        }),
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
      },
      customer: {
        findFirst: jest.fn().mockResolvedValue(overrides?.customerFind ?? null),
        create: jest.fn().mockResolvedValue({
          id: "c1",
          name: "Acme",
          nit: "900",
          email: "a@acme.co",
        }),
      },
      quote: {
        create: jest.fn().mockResolvedValue({
          id: "q1",
          code: "LD-2026-1",
        }),
        count: jest.fn().mockResolvedValue(1),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: "u-com",
          email: "comercial@fsg.co",
        }),
      },
    };

    const svc = new RecepcionService(
      prisma as never,
      { emit } as never,
      { server: { to: () => ({ emit: gatewayEmit }) } } as never,
      { notify } as never,
    );
    return { svc, emit, notify, visitorCreate, prisma };
  }

  it("emite visitor.checked_in al registrar visita", async () => {
    const { svc, emit } = buildService();
    await svc.checkIn("org1", "actor1", {
      name: "Carlos Mendoza",
      document: "1001001",
      reason: "Reunión comercial",
      hostName: "Ana",
      company: "Globant",
      visitClass: "B2B_MEETING",
      badgeRfid: "RFID-22",
    });
    expect(emit).toHaveBeenCalledWith(
      "visitor.checked_in",
      expect.objectContaining({
        visitorName: "Carlos Mendoza",
        badgeRfid: "RFID-22",
      }),
    );
    expect(emit).toHaveBeenCalledWith(
      "frontdesk.visitor.cleared",
      expect.any(Object),
    );
  });

  it("convierte chat a Lead comercial y saca de bandeja", async () => {
    const { svc, emit, prisma } = buildService();
    const out = await svc.convertLead("org1", "actor1", {
      ticketId: "t1",
      companyName: "Acme SAS",
      email: "compras@acme.co",
      serviceDate: new Date("2026-09-01"),
    });
    expect(out.assignedAwayFromReception).toBe(true);
    expect(out.dailyLeadMetrics).toBe(1);
    expect(prisma.ticket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          meta: expect.objectContaining({
            assignedAwayFromReception: true,
            receptionInbox: false,
          }),
        }),
      }),
    );
    expect(emit).toHaveBeenCalledWith(
      "recepcion.lead.converted",
      expect.objectContaining({ ticketId: "t1" }),
    );
  });

  it("crea Lead presencial sin chat de bandeja", async () => {
    const { svc, prisma } = buildService();
    const out = await svc.convertLead("org1", "actor1", {
      companyName: "Walkin SAS",
      email: "hola@walkin.co",
    });
    expect(prisma.ticket.create).toHaveBeenCalled();
    expect(out.ticketId).toBe("t-walkin");
    expect(out.message).toMatch(/Lead presencial/i);
    expect(out.destination.href).toBe("/comercial");
  });
});
