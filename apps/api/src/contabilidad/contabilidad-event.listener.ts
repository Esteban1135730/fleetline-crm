import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { AccountingLedgerService } from "./accounting-ledger.service";

/**
 * Escucha eventos de dominio / Kafka bridge y genera asientos NIIF.
 */
@Injectable()
export class ContabilidadEventListener {
  private readonly logger = new Logger(ContabilidadEventListener.name);

  constructor(private ledger: AccountingLedgerService) {}

  @OnEvent("purchase.match.approved")
  async onPurchaseMatchApproved(payload: {
    organizationId: string;
    amount: number;
    invoiceId: string;
    purchaseOrderId: string;
    matchId: string;
  }) {
    return this.ledger.postDoubleEntry({
      organizationId: payload.organizationId,
      memo: `NIIF CxP — 3-Way Match aprobado (factura ${payload.invoiceId})`,
      debitCode: "1435",
      creditCode: "2205",
      amount: payload.amount,
      sourceEvent: "purchase.match.approved",
      meta: {
        invoiceId: payload.invoiceId,
        purchaseOrderId: payload.purchaseOrderId,
        matchId: payload.matchId,
      },
    });
  }

  @OnEvent("payment.disbursed")
  async onPaymentDisbursed(payload: {
    organizationId: string;
    amount: number;
    paymentScheduleIds?: string[];
    invoiceIds?: string[];
    bankRef?: string;
  }) {
    this.logger.log(
      `[EVT] payment.disbursed org=${payload.organizationId} amount=${payload.amount}`,
    );
    return this.ledger.postDoubleEntry({
      organizationId: payload.organizationId,
      memo: `NIIF pago proveedores — desembolso H2H ${payload.bankRef || ""}`.trim(),
      debitCode: "2205",
      creditCode: "1110",
      amount: payload.amount,
      sourceEvent: "payment.disbursed",
      meta: {
        paymentScheduleIds: payload.paymentScheduleIds,
        invoiceIds: payload.invoiceIds,
        bankRef: payload.bankRef,
      },
    });
  }

  @OnEvent("part.dispatched")
  async onPartDispatched(payload: {
    organizationId: string;
    amount: number;
    workOrderId: string;
    inventoryItemId: string;
    quantity: number;
  }) {
    return this.ledger.postDoubleEntry({
      organizationId: payload.organizationId,
      memo: `NIIF consumo repuesto OT ${payload.workOrderId}`,
      debitCode: "5105",
      creditCode: "1435",
      amount: payload.amount,
      sourceEvent: "part.dispatched",
      meta: {
        workOrderId: payload.workOrderId,
        inventoryItemId: payload.inventoryItemId,
        quantity: payload.quantity,
      },
    });
  }

  @OnEvent("trip.completed")
  async onTripCompleted(payload: {
    organizationId: string;
    amount: number;
    tripId: string;
    code?: string;
    contractId?: string | null;
  }) {
    // Viajes contratados: Contabilidad espera commercial.revenue.generated (M03)
    if (payload.contractId) {
      this.logger.log(
        `[EVT] trip.completed con contrato — defer a commercial.revenue.generated trip=${payload.tripId}`,
      );
      return { deferred: true };
    }
    return this.ledger.postDoubleEntry({
      organizationId: payload.organizationId,
      memo: `NIIF ingreso viaje ${payload.code || payload.tripId}`,
      debitCode: "1305",
      creditCode: "4135",
      amount: payload.amount,
      sourceEvent: "trip.completed",
      meta: { tripId: payload.tripId, code: payload.code },
    });
  }

  @OnEvent("commercial.revenue.generated")
  async onCommercialRevenueGenerated(payload: {
    organizationId: string;
    tripId: string;
    contractId: string;
    invoiceId: string;
    amount: number;
    distanceKm?: number;
    code?: string;
  }) {
    this.logger.log(
      `[EVT] commercial.revenue.generated trip=${payload.code || payload.tripId} amount=${payload.amount}`,
    );
    return this.ledger.postDoubleEntry({
      organizationId: payload.organizationId,
      memo: `NIIF ingreso contractual ${payload.code || payload.tripId}`,
      debitCode: "1305",
      creditCode: "4135",
      amount: payload.amount,
      sourceEvent: "commercial.revenue.generated",
      meta: {
        tripId: payload.tripId,
        contractId: payload.contractId,
        invoiceId: payload.invoiceId,
        distanceKm: payload.distanceKm,
        code: payload.code,
      },
    });
  }

  @OnEvent("payroll.calculated")
  async onPayrollCalculated(payload: {
    organizationId: string;
    payrollRunId: string;
    amount: number;
    totalOvertime?: number;
    totalNight?: number;
    totalCommissions?: number;
    periodStart?: string;
    periodEnd?: string;
  }) {
    this.logger.log(
      `[EVT] payroll.calculated run=${payload.payrollRunId} amount=${payload.amount}`,
    );
    return this.ledger.postDoubleEntry({
      organizationId: payload.organizationId,
      memo: `NIIF provisión nómina ${payload.periodStart || ""} → ${payload.periodEnd || ""}`.trim(),
      debitCode: "5205",
      creditCode: "2505",
      amount: payload.amount,
      sourceEvent: "payroll.calculated",
      meta: {
        payrollRunId: payload.payrollRunId,
        totalOvertime: payload.totalOvertime,
        totalNight: payload.totalNight,
        totalCommissions: payload.totalCommissions,
      },
    });
  }
}
