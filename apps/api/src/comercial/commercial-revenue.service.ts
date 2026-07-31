import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import {
  InvoiceStatus,
  InvoiceType,
} from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";
import { KafkaEventsService } from "../logistics/kafka-events.service";
import { CommercialContractService } from "./commercial-contract.service";
import { calculateContractedFare } from "./contract.calc";

/**
 * Tarificación de viajes completados según contrato + pre-factura.
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
    if (!trip?.contractId || !trip.contract) {
      return { skipped: true, reason: "NO_CONTRACT" };
    }

    return this.priceCompletedTrip(trip);
  }

  async priceCompletedTrip(trip: {
    id: string;
    code: string;
    organizationId: string;
    contractId: string | null;
    customerId: string | null;
    distanceKm: number | null;
    fareAmount: unknown;
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
    if (!trip.contract) return { skipped: true };

    const distanceKm = trip.distanceKm ?? 45;
    const fare = calculateContractedFare({
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

    await this.prisma.trip.update({
      where: { id: trip.id },
      data: { fareAmount: fare },
    });

    await this.contracts.consumeTripQuota(trip.contract.id, fare);

    const counterparty =
      trip.customer?.name || `Cliente ${trip.contract.customerId}`;
    const invCount = await this.prisma.invoice.count({
      where: { organizationId: trip.organizationId },
    });
    const invoice = await this.prisma.invoice.create({
      data: {
        organizationId: trip.organizationId,
        number: `PF-${trip.code}-${String(invCount + 1).padStart(3, "0")}`,
        type: InvoiceType.RECEIVABLE,
        status: InvoiceStatus.DRAFT,
        counterparty,
        amount: fare,
        customerId: trip.customerId || trip.contract.customerId,
        tripId: trip.id,
      },
    });

    await this.kafka.emitCommercialRevenueGenerated({
      organizationId: trip.organizationId,
      tripId: trip.id,
      contractId: trip.contract.id,
      invoiceId: invoice.id,
      amount: fare,
      distanceKm,
      code: trip.code,
    });

    this.logger.log(
      `[REV] viaje ${trip.code} tarifado $${fare} → prefactura ${invoice.number}`,
    );

    return {
      fare,
      distanceKm,
      invoice,
      contractId: trip.contract.id,
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
