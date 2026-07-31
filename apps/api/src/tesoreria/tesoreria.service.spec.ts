import { ForbiddenException } from "@nestjs/common";
import { ThreeWayMatchStatus } from "@fsg/db";
import { TesoreriaService } from "./tesoreria.service";
import { MfaService } from "./mfa.service";
import {
  PaymentQueueService,
  PurchaseMatchConsumer,
} from "./payment-queue.service";

describe("Tesorería — Zero-Touch / MFA / 3-Way gate", () => {
  describe("PurchaseMatchConsumer → PaymentSchedule", () => {
    it("al recibir purchase.match.approved crea la obligación de pago", async () => {
      const created: unknown[] = [];
      const prisma = {
        invoice: {
          findFirst: jest.fn().mockResolvedValue({
            id: "inv-1",
            amount: 2_500_000,
            counterparty: "Repuestos SA",
            status: "CLEARED_FOR_PAYMENT",
            threeWayMatches: [{ id: "match-1", status: "APPROVED" }],
            supplier: { name: "Repuestos SA" },
          }),
          update: jest.fn(),
        },
        threeWayMatch: { findFirst: jest.fn() },
        paymentSchedule: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn(async ({ data }: { data: object }) => {
            const row = { id: "ps-1", ...data };
            created.push(row);
            return row;
          }),
        },
      };

      const queue = new PaymentQueueService(prisma as never);
      const consumer = new PurchaseMatchConsumer(queue);

      const result = await consumer.handle({
        matchId: "match-1",
        purchaseOrderId: "po-1",
        invoiceId: "inv-1",
        goodsReceiptId: "gr-1",
        organizationId: "org-1",
        amount: 2_500_000,
      });

      expect(result).toMatchObject({
        id: "ps-1",
        invoiceId: "inv-1",
        threeWayMatchId: "match-1",
        amount: 2_500_000,
        status: "QUEUED",
      });
      expect(prisma.paymentSchedule.create).toHaveBeenCalled();
    });
  });

  describe("TesoreriaService.assertInvoiceAuthorizedForPayment", () => {
    it("bloquea pago directo sin 3-Way Match APPROVED (HTTP 403)", async () => {
      const prisma = {
        invoice: {
          findFirst: jest.fn().mockResolvedValue({
            id: "inv-x",
            threeWayMatches: [],
          }),
        },
      };
      const svc = new TesoreriaService(prisma as never, new MfaService(), {
        emitPaymentDisbursed: jest.fn().mockResolvedValue(undefined),
      } as never, {
        assertSupplierClear: jest.fn().mockResolvedValue(undefined),
        assertDocumentClear: jest.fn().mockResolvedValue(undefined),
        assertNotBlocked: jest.fn(),
      } as never);

      await expect(
        svc.assertInvoiceAuthorizedForPayment("org-1", "inv-x"),
      ).rejects.toBeInstanceOf(ForbiddenException);

      try {
        await svc.assertInvoiceAuthorizedForPayment("org-1", "inv-x");
      } catch (e) {
        const err = e as ForbiddenException;
        expect(err.getResponse()).toMatchObject({
          error: "PAYMENT_NOT_AUTHORIZED_UNMATCHED",
        });
      }
    });

    it("permite factura con match APPROVED", async () => {
      const prisma = {
        invoice: {
          findFirst: jest.fn().mockResolvedValue({
            id: "inv-ok",
            threeWayMatches: [
              { id: "m1", status: ThreeWayMatchStatus.APPROVED },
            ],
          }),
        },
      };
      const svc = new TesoreriaService(prisma as never, new MfaService(), {
        emitPaymentDisbursed: jest.fn().mockResolvedValue(undefined),
      } as never, {
        assertSupplierClear: jest.fn().mockResolvedValue(undefined),
        assertDocumentClear: jest.fn().mockResolvedValue(undefined),
        assertNotBlocked: jest.fn(),
      } as never);
      const inv = await svc.assertInvoiceAuthorizedForPayment("org-1", "inv-ok");
      expect(inv.id).toBe("inv-ok");
    });
  });

  describe("MFA en desembolso", () => {
    const prevThreshold = process.env.TREASURY_MFA_THRESHOLD_COP;
    const prevOtp = process.env.TREASURY_MFA_STATIC_OTP;

    beforeEach(() => {
      process.env.TREASURY_MFA_THRESHOLD_COP = "1000000";
      process.env.TREASURY_MFA_STATIC_OTP = "123456";
    });
    afterEach(() => {
      process.env.TREASURY_MFA_THRESHOLD_COP = prevThreshold;
      process.env.TREASURY_MFA_STATIC_OTP = prevOtp;
    });

    it("sin token MFA la transacción de desembolso falla", async () => {
      const prisma = {
        paymentSchedule: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: "ps-1",
              invoiceId: "inv-1",
              amount: 5_000_000,
              status: "QUEUED",
              invoice: { id: "inv-1" },
            },
          ]),
          update: jest.fn(),
        },
        invoice: {
          findFirst: jest.fn().mockResolvedValue({
            id: "inv-1",
            threeWayMatches: [{ id: "m1", status: "APPROVED" }],
          }),
          update: jest.fn(),
        },
      };

      const svc = new TesoreriaService(prisma as never, new MfaService(), {
        emitPaymentDisbursed: jest.fn().mockResolvedValue(undefined),
      } as never, {
        assertSupplierClear: jest.fn().mockResolvedValue(undefined),
        assertDocumentClear: jest.fn().mockResolvedValue(undefined),
        assertNotBlocked: jest.fn(),
      } as never);

      await expect(
        svc.disburse("org-1", "user-1", "fin@fsg.co", {
          paymentScheduleIds: ["ps-1"],
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      try {
        await svc.disburse("org-1", "user-1", "fin@fsg.co", {
          paymentScheduleIds: ["ps-1"],
        });
      } catch (e) {
        expect((e as ForbiddenException).getResponse()).toMatchObject({
          error: "MFA_REQUIRED",
        });
      }
    });

    it("con MFA válido completa el desembolso", async () => {
      const prisma = {
        paymentSchedule: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: "ps-1",
              invoiceId: "inv-1",
              amount: 5_000_000,
              status: "QUEUED",
              invoice: { id: "inv-1" },
            },
          ]),
          update: jest.fn().mockResolvedValue({
            id: "ps-1",
            status: "DISBURSED",
            amount: 5_000_000,
          }),
        },
        invoice: {
          findFirst: jest.fn().mockResolvedValue({
            id: "inv-1",
            threeWayMatches: [{ id: "m1", status: "APPROVED" }],
          }),
          update: jest.fn(),
        },
      };

      const svc = new TesoreriaService(prisma as never, new MfaService(), {
        emitPaymentDisbursed: jest.fn().mockResolvedValue(undefined),
      } as never, {
        assertSupplierClear: jest.fn().mockResolvedValue(undefined),
        assertDocumentClear: jest.fn().mockResolvedValue(undefined),
        assertNotBlocked: jest.fn(),
      } as never);
      const out = await svc.disburse("org-1", "user-1", "fin@fsg.co", {
        paymentScheduleIds: ["ps-1"],
        mfaToken: "123456",
      });

      expect(out.disbursed).toBe(1);
      expect(out.mfaVerified).toBe(true);
      expect(out.totalAmount).toBe(5_000_000);
    });
  });
});
