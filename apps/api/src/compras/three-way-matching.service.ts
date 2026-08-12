import { Injectable } from "@nestjs/common";
import {
  InvoiceStatus,
  PurchaseStatus,
  ThreeWayMatchStatus,
} from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";
import { KafkaEventsService } from "../logistics/kafka-events.service";
import {
  THREE_WAY_TOLERANCE,
  type ThreeWayEvaluation,
  type ThreeWayLineAudit,
  type ThreeWayOutcome,
} from "./three-way.types";

function num(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  return Number(v);
}

function withinPrice(poTotal: number, invoiceTotal: number): boolean {
  const delta = Math.abs(invoiceTotal - poTotal);
  if (THREE_WAY_TOLERANCE.PRICE_PERCENT === 0) {
    return delta <= THREE_WAY_TOLERANCE.PRICE_ABS_COP;
  }
  const allowed = Math.abs(poTotal) * (THREE_WAY_TOLERANCE.PRICE_PERCENT / 100);
  return delta <= Math.max(allowed, THREE_WAY_TOLERANCE.PRICE_ABS_COP);
}

function withinQty(poQty: number, receiptQty: number): boolean {
  if (poQty === 0) return receiptQty === 0;
  const delta = Math.abs(receiptQty - poQty);
  const allowed = poQty * THREE_WAY_TOLERANCE.QTY_PERCENT;
  return delta <= Math.max(allowed, 0);
}

@Injectable()
export class ThreeWayMatchingService {
  constructor(
    private prisma: PrismaService,
    private kafka: KafkaEventsService,
  ) {}

  /**
   * Algoritmo puro (testeable) — OC vs Remisión vs Factura.
   */
  evaluate(input: {
    poTotal: number;
    poQty: number;
    receiptQty: number;
    invoiceTotal: number;
    lines?: ThreeWayLineAudit[];
  }): ThreeWayEvaluation {
    const priceDelta = num(input.invoiceTotal) - num(input.poTotal);
    const qtyDelta = num(input.receiptQty) - num(input.poQty);
    const reasons: string[] = [];

    const priceOk = withinPrice(input.poTotal, input.invoiceTotal);
    const qtyOk = withinQty(input.poQty, input.receiptQty);

    if (!priceOk) {
      reasons.push(
        `PRICE_MISMATCH: factura ${input.invoiceTotal} vs OC ${input.poTotal} (tol ${THREE_WAY_TOLERANCE.PRICE_PERCENT}% / ±${THREE_WAY_TOLERANCE.PRICE_ABS_COP})`,
      );
    }
    if (!qtyOk) {
      reasons.push(
        `QTY_MISMATCH: recepción ${input.receiptQty} vs OC ${input.poQty} (tol ${THREE_WAY_TOLERANCE.QTY_PERCENT * 100}%)`,
      );
    }

    const lines = input.lines ?? [];
    for (const line of lines) {
      if (!line.priceOk) {
        reasons.push(
          `LINE_PRICE_MISMATCH: ${line.description} unit OC ${line.poUnitCost} vs factura ${line.invoiceUnitCost}`,
        );
      }
      if (!line.qtyOk && line.receivedQty != null) {
        reasons.push(
          `LINE_QTY_MISMATCH: ${line.description} OC ${line.poQty} vs recibido ${line.receivedQty}`,
        );
      }
    }

    const lineFail = lines.some((l) => !l.priceOk || !l.qtyOk);
    const outcome: ThreeWayOutcome =
      priceOk && qtyOk && !lineFail ? "APPROVED" : "DISCREPANCY_REJECTED";

    return {
      outcome,
      priceDelta,
      qtyDelta,
      poTotal: input.poTotal,
      receiptQty: input.receiptQty,
      invoiceTotal: input.invoiceTotal,
      poQty: input.poQty,
      reasons,
      lines,
      tolerances: THREE_WAY_TOLERANCE,
    };
  }

  /**
   * Persiste resultado, actualiza OC/Factura y emite Kafka.
   */
  async processMatch(input: {
    organizationId: string;
    purchaseOrderId: string;
    goodsReceiptId: string;
    invoiceId: string;
  }) {
    const [po, receipt, invoice] = await Promise.all([
      this.prisma.purchaseOrder.findFirst({
        where: {
          id: input.purchaseOrderId,
          organizationId: input.organizationId,
        },
        include: { lines: true, supplier: true },
      }),
      this.prisma.goodsReceipt.findFirst({
        where: { id: input.goodsReceiptId },
        include: { purchaseOrder: true },
      }),
      this.prisma.invoice.findFirst({
        where: {
          id: input.invoiceId,
          organizationId: input.organizationId,
        },
      }),
    ]);

    if (!po) throw new Error("PURCHASE_ORDER_NOT_FOUND");
    if (!receipt) throw new Error("GOODS_RECEIPT_NOT_FOUND");
    if (!invoice) throw new Error("INVOICE_NOT_FOUND");
    if (receipt.purchaseOrderId !== po.id) {
      throw new Error("GOODS_RECEIPT_PO_MISMATCH");
    }

    const poQty = po.lines.reduce((s, l) => s + l.quantity, 0);
    const poTotal =
      po.lines.length > 0
        ? po.lines.reduce((s, l) => s + num(l.lineTotal), 0)
        : num(po.totalEstimated);

    const payload = (receipt.payload ?? {}) as {
      lines?: Array<{
        description?: string;
        quantity?: number;
        sku?: string;
        barcode?: string;
      }>;
    };

    const dian = (invoice.dianPayload ?? {}) as {
      lines?: Array<{
        description?: string;
        quantity?: number;
        unitCost?: number;
        lineTotal?: number;
      }>;
    };

    const lines: ThreeWayLineAudit[] = po.lines.map((ol, idx) => {
      const recv = payload.lines?.[idx];
      const invLine = dian.lines?.[idx];
      const receivedQty = recv?.quantity ?? null;
      const invoiceUnitCost =
        invLine?.unitCost != null ? num(invLine.unitCost) : null;
      const invoiceLineTotal =
        invLine?.lineTotal != null
          ? num(invLine.lineTotal)
          : invoiceUnitCost != null && invLine?.quantity != null
            ? invoiceUnitCost * num(invLine.quantity)
            : null;

      const qtyOk =
        receivedQty == null
          ? true
          : withinQty(ol.quantity, receivedQty);
      const priceOk =
        invoiceUnitCost == null
          ? true
          : withinPrice(num(ol.unitCost), invoiceUnitCost);

      return {
        description: ol.description,
        poQty: ol.quantity,
        poUnitCost: num(ol.unitCost),
        receivedQty,
        invoiceUnitCost,
        invoiceLineTotal,
        qtyOk,
        priceOk,
      };
    });

    const evaluation = this.evaluate({
      poTotal,
      poQty,
      receiptQty: receipt.quantityTotal,
      invoiceTotal: num(invoice.amount),
      lines,
    });

    const status: ThreeWayMatchStatus =
      evaluation.outcome === "APPROVED"
        ? ThreeWayMatchStatus.APPROVED
        : ThreeWayMatchStatus.DISCREPANCY_REJECTED;

    const match = await this.prisma.threeWayMatch.create({
      data: {
        purchaseOrderId: po.id,
        goodsReceiptId: receipt.id,
        invoiceId: invoice.id,
        status,
        priceDelta: evaluation.priceDelta,
        qtyDelta: evaluation.qtyDelta,
        details: {
          outcome: evaluation.outcome,
          reasons: evaluation.reasons,
          tolerances: evaluation.tolerances,
          lines: evaluation.lines,
          poCode: po.code,
          receiptCode: receipt.code,
          invoiceNumber: invoice.number,
          auditAt: new Date().toISOString(),
        },
        evaluatedAt: new Date(),
      },
    });

    if (evaluation.outcome === "APPROVED") {
      await this.prisma.$transaction([
        this.prisma.purchaseOrder.update({
          where: { id: po.id },
          data: {
            status: PurchaseStatus.MATCHED,
            matchStatus: ThreeWayMatchStatus.APPROVED,
            matchNotes: "3-Way Match APPROVED — liberado a Tesorería",
          },
        }),
        this.prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            status: InvoiceStatus.CLEARED_FOR_PAYMENT,
            purchaseOrderId: po.id,
          },
        }),
      ]);

      await this.kafka.emitPurchaseMatchApproved({
        matchId: match.id,
        purchaseOrderId: po.id,
        invoiceId: invoice.id,
        goodsReceiptId: receipt.id,
        organizationId: input.organizationId,
        amount: num(invoice.amount),
      });
    } else {
      await this.prisma.$transaction([
        this.prisma.purchaseOrder.update({
          where: { id: po.id },
          data: {
            status: PurchaseStatus.MATCH_FAILED,
            matchStatus: ThreeWayMatchStatus.DISCREPANCY_REJECTED,
            matchNotes: evaluation.reasons.join(" | ").slice(0, 500),
          },
        }),
        this.prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            status: InvoiceStatus.PENDING_MATCH,
            paymentApproved: false,
            purchaseOrderId: po.id,
          },
        }),
      ]);

      await this.kafka.emitPurchaseMatchRejected({
        matchId: match.id,
        purchaseOrderId: po.id,
        invoiceId: invoice.id,
        organizationId: input.organizationId,
        reason: evaluation.reasons.join("; "),
        priceDelta: evaluation.priceDelta,
        qtyDelta: evaluation.qtyDelta,
      });
    }

    return {
      matchId: match.id,
      invoiceId: invoice.id,
      status: evaluation.outcome,
      matchStatus: status,
      priceDelta: evaluation.priceDelta,
      qtyDelta: evaluation.qtyDelta,
      reasons: evaluation.reasons,
      invoiceClearedForPayment: evaluation.outcome === "APPROVED",
      invoiceBlocked: evaluation.outcome === "DISCREPANCY_REJECTED",
      evaluation,
    };
  }
}
