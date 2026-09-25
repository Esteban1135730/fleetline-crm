import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import {
  InvoiceStatus,
  InvoiceType,
} from "@fsg/db";
import { HARD_RULES } from "@fsg/shared";
import { PrismaService } from "../prisma/prisma.service";
import { KafkaEventsService } from "../logistics/kafka-events.service";
import { CommercialContractService } from "./commercial-contract.service";
import { calculateContractedFare } from "./contract.calc";

/**
 * Tarificación de viajes completados + pre-factura CxC (idempotente por tripId).
 */
@Injectable()
export class CommercialRevenueService {
  private readonly logger = new Logger(CommercialRevenueService.name);

  constructor(
    private prisma: PrismaService,
    private kafka: KafkaEventsService,
    private contracts: CommercialContractService,
  ) {}

  @OnEvent("trip.completed")
  async onTripCompleted(payload: {
    organizationId: string;
    tripId: string;
    amount: number;
    code?: string;
  }) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: payload.tripId, organizationId: payload.organizationId },
      include: {
        contract: true,
        customer: { select: { id: true, name: true, nit: true } },
      },
    });
    if (!trip) {
      return { skipped: true, reason: "TRIP_NOT_FOUND" };
    }

    return this.priceCompletedTrip({
      ...trip,
      fareAmount: trip.fareAmount,
      // fallback amount from event if trip has no fare yet
      eventAmount: payload.amount,
    });
  }

  async priceCompletedTrip(trip: {
    id: string;
    code: string;
    organizationId: string;
    contractId: string | null;
    customerId: string | null;
    distanceKm: number | null;
    fareAmount: unknown;
    eventAmount?: number;
    contract: {
      id: string;
      code: string;
      rateType: string;
      fixedFare: unknown;
      ratePerKm: unknown;
      monthlyValue: unknown;
      customerId: string;
    } | null;
    customer: { id: string; name: string; nit: string } | null;
  }) {
    const existing = await this.prisma.invoice.findFirst({
      where: { tripId: trip.id, type: InvoiceType.RECEIVABLE },
    });
    if (existing) {
      this.logger.log(
        `[REV] viaje ${trip.code} ya tiene prefactura ${existing.number} — skip`,
      );
      return {
        skipped: true,
        reason: "ALREADY_INVOICED",
        invoice: existing,
        fare: Number(existing.amount),
      };
    }

    const distanceKm =
      trip.distanceKm && trip.distanceKm > 0
        ? trip.distanceKm
        : HARD_RULES.DEFAULT_TRIP_DISTANCE_KM;

    let fare = 0;
    let contractId: string | null = trip.contractId;

    if (trip.contract) {
      fare = calculateContractedFare({
        rateType: trip.contract.rateType,
        fixedFare:
          trip.contract.fixedFare != null
            ? Number(trip.contract.fixedFare)
            : null,
        ratePerKm:
          trip.contract.ratePerKm != null
            ? Number(trip.contract.ratePerKm)
            : null,
        monthlyValue: Number(trip.contract.monthlyValue),
        distanceKm,
      });
      await this.contracts.consumeTripQuota(trip.contract.id, fare);
      contractId = trip.contract.id;
    } else {
      // Sin contrato: fare del viaje, monto del evento, o tarifa mínima por km
      const fromTrip =
        trip.fareAmount != null ? Number(trip.fareAmount) : 0;
      const fromEvent =
        trip.eventAmount != null && trip.eventAmount > 0
          ? trip.eventAmount
          : 0;
      fare =
        fromTrip > 0
          ? fromTrip
          : fromEvent > 0
            ? fromEvent
            : Math.round(distanceKm * 3_500);
    }

    await this.prisma.trip.update({
      where: { id: trip.id },
      data: { fareAmount: fare, distanceKm },
    });

    const counterparty =
      trip.customer?.name ||
      (trip.contract
        ? `Cliente ${trip.contract.customerId}`
        : "Cliente viaje");
    const invCount = await this.prisma.invoice.count({
      where: { organizationId: trip.organizationId },
    });

    let invoice;
    try {
      invoice = await this.prisma.invoice.create({
        data: {
          organizationId: trip.organizationId,
          number: `PF-${trip.code}-${String(invCount + 1).padStart(3, "0")}`,
          type: InvoiceType.RECEIVABLE,
          status: InvoiceStatus.DRAFT,
          counterparty,
          amount: fare,
          customerId:
            trip.customerId || trip.contract?.customerId || undefined,
          tripId: trip.id,
        },
      });
    } catch (err) {
      // Carrera: unique tripId
      const again = await this.prisma.invoice.findFirst({
        where: { tripId: trip.id, type: InvoiceType.RECEIVABLE },
      });
      if (again) {
        return {
          skipped: true,
          reason: "ALREADY_INVOICED",
          invoice: again,
          fare: Number(again.amount),
        };
      }
      throw err;
    }

    await this.kafka.emitCommercialRevenueGenerated({
      organizationId: trip.organizationId,
      tripId: trip.id,
      contractId: contractId ?? undefined,
      invoiceId: invoice.id,
      amount: fare,
      distanceKm,
      code: trip.code,
    });

    this.logger.log(
      `[REV] viaje ${trip.code} tarifado $${fare} → prefactura ${invoice.number}${contractId ? "" : " (sin contrato)"}`,
    );

    return {
      fare,
      distanceKm,
      invoice,
      contractId,
    };
  }

  /** API directa / tests */
  async priceTripById(organizationId: string, tripId: string) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, organizationId },
      include: {
        contract: true,
        customer: { select: { id: true, name: true, nit: true } },
      },
    });
    if (!trip) return { skipped: true, reason: "TRIP_NOT_FOUND" };
    return this.priceCompletedTrip(trip);
  }
}
