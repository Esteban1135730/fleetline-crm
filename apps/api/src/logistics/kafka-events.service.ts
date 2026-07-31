import { Injectable, Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";

/**
 * Emisor Kafka (pub/sub). Si no hay brokers, registra en log (dev-safe).
 * También re-emite en EventEmitter2 para consumers in-process (Tesorería).
 */
@Injectable()
export class KafkaEventsService {
  private readonly logger = new Logger(KafkaEventsService.name);

  constructor(private readonly events: EventEmitter2) {}

  async emit(topic: string, payload: unknown): Promise<void> {
    const brokers = (process.env.KAFKA_BROKERS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (!brokers.length) {
      this.logger.log(
        `[KAFKA:noop] ${topic} ${JSON.stringify(payload).slice(0, 500)}`,
      );
    } else {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { Kafka } = require("kafkajs") as typeof import("kafkajs");
        const kafka = new Kafka({
          clientId: process.env.KAFKA_CLIENT_ID || "fleetline-api",
          brokers,
        });
        const producer = kafka.producer();
        await producer.connect();
        await producer.send({
          topic,
          messages: [
            {
              key:
                typeof payload === "object" &&
                payload &&
                "tripId" in payload &&
                typeof (payload as { tripId: unknown }).tripId === "string"
                  ? (payload as { tripId: string }).tripId
                  : typeof payload === "object" &&
                      payload &&
                      "invoiceId" in payload &&
                      typeof (payload as { invoiceId: unknown }).invoiceId ===
                        "string"
                    ? (payload as { invoiceId: string }).invoiceId
                    : undefined,
              value: JSON.stringify({
                event: topic,
                at: new Date().toISOString(),
                data: payload,
              }),
            },
          ],
        });
        await producer.disconnect();
        this.logger.log(`[KAFKA] emitted ${topic}`);
      } catch (err) {
        this.logger.error(
          `[KAFKA] emit failed for ${topic}: ${(err as Error).message}`,
        );
      }
    }

    this.events.emit(topic, payload);
  }

  emitTripDispatched(payload: {
    tripId: string;
    organizationId: string;
    vehicleId: string;
    driverId: string;
    code: string;
    departAt: string;
  }) {
    return this.emit("trip.dispatched", payload);
  }

  emitComplianceVehicleBlocked(payload: {
    vehicleId: string;
    organizationId: string;
    plate: string;
    reason: string;
    blocks: string[];
    source: "runt_sync" | "nightly_cron" | "manual";
  }) {
    return this.emit("compliance.vehicle.blocked", payload);
  }

  emitPurchaseMatchApproved(payload: {
    matchId: string;
    purchaseOrderId: string;
    invoiceId: string;
    goodsReceiptId: string;
    organizationId: string;
    amount: number;
  }) {
    return this.emit("purchase.match.approved", payload);
  }

  emitPurchaseMatchRejected(payload: {
    matchId: string;
    purchaseOrderId: string;
    invoiceId: string;
    organizationId: string;
    reason: string;
    priceDelta: number;
    qtyDelta: number;
  }) {
    return this.emit("purchase.match.rejected", payload);
  }

  emitPaymentDisbursed(payload: {
    organizationId: string;
    amount: number;
    paymentScheduleIds: string[];
    invoiceIds: string[];
    bankRef?: string;
  }) {
    return this.emit("payment.disbursed", payload);
  }

  emitPartDispatched(payload: {
    organizationId: string;
    amount: number;
    workOrderId: string;
    inventoryItemId: string;
    quantity: number;
  }) {
    return this.emit("part.dispatched", payload);
  }

  emitTripCompleted(payload: {
    organizationId: string;
    amount: number;
    tripId: string;
    code?: string;
    contractId?: string | null;
  }) {
    return this.emit("trip.completed", payload);
  }

  emitCommercialRevenueGenerated(payload: {
    organizationId: string;
    tripId: string;
    contractId: string;
    invoiceId: string;
    amount: number;
    distanceKm: number;
    code?: string;
  }) {
    return this.emit("commercial.revenue.generated", payload);
  }

  emitPayrollCalculated(payload: {
    organizationId: string;
    payrollRunId: string;
    amount: number;
    totalOvertime: number;
    totalNight: number;
    totalCommissions: number;
    periodStart: string;
    periodEnd: string;
  }) {
    return this.emit("payroll.calculated", payload);
  }

  emitDocumentProcessed(payload: {
    organizationId: string;
    archiveDocumentId: string;
    docType: string;
    vehicleId?: string | null;
    driverId?: string | null;
    supplierId?: string | null;
    purchaseOrderId?: string | null;
    plate?: string | null;
    taxIdOrDocument?: string | null;
    issuer?: string | null;
    amount?: number | null;
    issuedAt?: string | null;
    expiresAt?: string | null;
    contentHash?: string | null;
    fileRef?: string | null;
  }) {
    return this.emit("document.processed", payload);
  }
}
