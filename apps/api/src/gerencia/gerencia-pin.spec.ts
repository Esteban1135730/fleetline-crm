import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { hasPermission } from "@fsg/shared";
import {
  assertExecutivePinProvided,
  assertExecutivePinValid,
  EXECUTIVE_PIN_INVALID,
  EXECUTIVE_PIN_REQUIRED,
  pickOptimalOverrideScenario,
} from "./dto/gerencia.dto";
import { GerenciaService } from "./gerencia.service";

describe("RBAC GERENTE_GENERAL", () => {
  it("visión total scorecard + aprobador final + CI READ", () => {
    expect(hasPermission("gerente_general", "balance_scorecard", "ANALYZE")).toBe(
      true,
    );
    expect(hasPermission("gerente_general", "gerencia_override", "UPDATE")).toBe(
      true,
    );
    expect(hasPermission("gerente_general", "gerencia_approvals", "UPDATE")).toBe(
      true,
    );
    expect(hasPermission("gerente_general", "contratos", "UPDATE")).toBe(true);
    expect(hasPermission("gerente_general", "finanzas", "UPDATE")).toBe(true);
    expect(hasPermission("gerente_general", "override_operativo", "CREATE")).toBe(
      true,
    );
    expect(hasPermission("gerente_general", "hallazgos_ci", "READ")).toBe(true);
    expect(hasPermission("gerente_general", "audit_forense", "AUDIT")).toBe(
      true,
    );
  });
});

describe("assertExecutivePinProvided — firma ejecutiva", () => {
  it("exige PIN de 6 dígitos (falla sin PIN)", () => {
    expect(() => assertExecutivePinProvided(undefined)).toThrow(
      BadRequestException,
    );
    expect(() => assertExecutivePinProvided(undefined)).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ error: EXECUTIVE_PIN_REQUIRED }),
      }),
    );
    expect(() => assertExecutivePinProvided("12")).toThrow(BadRequestException);
    expect(() => assertExecutivePinProvided("abcdef")).toThrow(
      BadRequestException,
    );
  });

  it("acepta PIN de 6 dígitos", () => {
    expect(assertExecutivePinProvided("258014")).toBe("258014");
  });

  it("rechaza PIN inválido contra hash", () => {
    expect(() =>
      assertExecutivePinValid("258014", null, () => true),
    ).toThrow(UnauthorizedException);
    expect(() =>
      assertExecutivePinValid("258014", "$hash", () => false),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ error: EXECUTIVE_PIN_INVALID }),
      }),
    );
  });
});

describe("pickOptimalOverrideScenario", () => {
  it("elige trade-off con mayor ganancia neta − penalidad", () => {
    const pick = pickOptimalOverrideScenario([
      {
        id: "pay-penalty",
        label: "Pagar penalidad y cumplir VIP",
        penaltyCostCop: 2_000_000,
        vipNetGainCop: 8_500_000,
      },
      {
        id: "cancel-vip",
        label: "Cancelar VIP",
        penaltyCostCop: 0,
        vipNetGainCop: 0,
      },
      {
        id: "reroute",
        label: "Reasignar itinerario",
        penaltyCostCop: 800_000,
        vipNetGainCop: 7_200_000,
      },
    ]);
    expect(pick?.id).toBe("pay-penalty");
  });
});

describe("GerenciaService.firmarAprobacionPin", () => {
  it("bloquea firma sin PIN de seguridad", async () => {
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: "u1",
          executivePinHash: "$2a$10$fake",
          email: "mauricio@inretrans.com",
        }),
      },
      executiveApproval: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };
    const svc = new GerenciaService(
      prisma as never,
      {} as never,
      { emit: jest.fn() } as never,
    );

    await expect(
      svc.firmarAprobacionPin("org-1", "u1", {
        approvalId: "ap-1",
        approve: true,
      }),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.executiveApproval.update).not.toHaveBeenCalled();
  });

  it("firma cuando el PIN es válido", async () => {
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: "u1",
          executivePinHash: "$ok",
          email: "mauricio@inretrans.com",
        }),
      },
      executiveApproval: {
        findFirst: jest.fn().mockResolvedValue({
          id: "ap-1",
          status: "PENDING",
          amountCop: 45_000_000,
          cashflowImpactCop: -45_000_000,
          kind: "NOMINA",
        }),
        update: jest.fn().mockResolvedValue({
          id: "ap-1",
          status: "SIGNED",
          pinVerified: true,
          amountCop: 45_000_000,
          cashflowImpactCop: -45_000_000,
          kind: "NOMINA",
        }),
      },
    };
    const kafka = { emit: jest.fn().mockResolvedValue(undefined) };

    // Monkey-patch bcrypt compare via assert — inject by mocking module is hard;
    // call with pin that passes assertExecutivePinValid using real bcrypt is complex.
    // Instead spy: replace compare by wrapping service call after pin assert with mock hash verify.
    const bcrypt = await import("bcryptjs");
    const hash = bcrypt.hashSync("258014", 4);
    prisma.user.findFirst = jest.fn().mockResolvedValue({
      id: "u1",
      executivePinHash: hash,
      email: "mauricio@inretrans.com",
    });

    const svc = new GerenciaService(
      prisma as never,
      {} as never,
      kafka as never,
    );

    const result = await svc.firmarAprobacionPin("org-1", "u1", {
      approvalId: "ap-1",
      pin: "258014",
      approve: true,
    });

    expect(result.status).toBe("APPROVAL_SIGNED");
    expect(prisma.executiveApproval.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "SIGNED",
          pinVerified: true,
        }),
      }),
    );
    expect(kafka.emit).toHaveBeenCalledWith(
      "gerencia.approval.signed",
      expect.objectContaining({ approvalId: "ap-1" }),
    );
  });
});
