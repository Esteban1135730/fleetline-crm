import { ForbiddenException } from "@nestjs/common";
import { CfoService } from "./cfo.service";
import { MfaService } from "../../tesoreria/mfa.service";

describe("CfoService.dispersarConMfa", () => {
  const prevThreshold = process.env.CFO_MFA_THRESHOLD_COP;
  const prevOtp = process.env.TREASURY_MFA_STATIC_OTP;

  beforeEach(() => {
    process.env.CFO_MFA_THRESHOLD_COP = "20000000";
    process.env.TREASURY_MFA_STATIC_OTP = "000000";
  });

  afterEach(() => {
    if (prevThreshold === undefined) delete process.env.CFO_MFA_THRESHOLD_COP;
    else process.env.CFO_MFA_THRESHOLD_COP = prevThreshold;
    if (prevOtp === undefined) delete process.env.TREASURY_MFA_STATIC_OTP;
    else process.env.TREASURY_MFA_STATIC_OTP = prevOtp;
  });

  function build(overrides?: {
    validateToken?: boolean;
    schedules?: Array<{ id: string; amount: number }>;
  }) {
    const schedules = overrides?.schedules ?? [
      { id: "sch-1", amount: 25_000_000 },
    ];
    const prisma = {
      paymentSchedule: {
        findMany: jest.fn().mockResolvedValue(
          schedules.map((s) => ({
            id: s.id,
            amount: s.amount,
            status: "QUEUED",
          })),
        ),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
      },
      invoice: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }) },
      account: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const mfa = {
      validateToken: jest
        .fn()
        .mockReturnValue(overrides?.validateToken ?? false),
      thresholdCop: () => 5_000_000,
    } as unknown as MfaService;
    const tesoreria = {
      disburse: jest.fn().mockResolvedValue({
        disbursed: 1,
        totalAmount: 25_000_000,
        mfaVerified: true,
      }),
    };
    const svc = new CfoService(
      prisma as never,
      mfa,
      tesoreria as never,
    );
    return { svc, mfa, tesoreria, prisma };
  }

  it("bloquea dispersión sin OTP válido", async () => {
    const { svc, tesoreria } = build({ validateToken: false });
    await expect(
      svc.dispersarConMfa("org-1", "user-cfo", "elena@inretrans.com", {
        paymentScheduleIds: ["sch-1"],
        mfaToken: "111111",
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tesoreria.disburse).not.toHaveBeenCalled();
  });

  it("bloquea si el token OTP está mal formado vía validateToken false", async () => {
    const { svc, mfa, tesoreria } = build({ validateToken: false });
    try {
      await svc.dispersarConMfa("org-1", "user-cfo", "elena@inretrans.com", {
        paymentScheduleIds: ["sch-1"],
        mfaToken: "000000",
      });
      fail("debió lanzar ForbiddenException");
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenException);
      const body = (e as ForbiddenException).getResponse() as {
        error?: string;
      };
      expect(body.error).toBe("MFA_INVALID");
    }
    expect(mfa.validateToken).toHaveBeenCalled();
    expect(tesoreria.disburse).not.toHaveBeenCalled();
  });

  it("libera lote cuando OTP CFO es válido", async () => {
    const { svc, tesoreria } = build({ validateToken: true });
    const out = await svc.dispersarConMfa(
      "org-1",
      "user-cfo",
      "elena@inretrans.com",
      {
        paymentScheduleIds: ["sch-1"],
        mfaToken: "000000",
      },
    );
    expect(out.cfoApproved).toBe(true);
    expect(tesoreria.disburse).toHaveBeenCalled();
  });
});
