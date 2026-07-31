import {
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  B2bServiceRequestKind,
  B2bServiceRequestStatus,
  InvoiceStatus,
  InvoiceType,
  TripStatus,
} from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";
import {
  CommercialContractService,
  CONTRACT_DISPATCH_DENIED,
} from "../comercial/commercial-contract.service";
import { consolidateB2bDashboard } from "../pasajeros/boarding.calc";
import type {
  B2bActiveFleetQuery,
  B2bDashboardQuery,
  B2bServiceRequestDto,
} from "./dto/clientes-b2b.dto";

/**
 * Portal Clientes B2B (Módulo 21) — autogestión con cupo comercial.
 */
@Injectable()
export class B2bPortalService {
  private readonly logger = new Logger(B2bPortalService.name);

  constructor(
    private prisma: PrismaService,
    private contracts: CommercialContractService,
  ) {}

  async requestService(organizationId: string, dto: B2bServiceRequestDto) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, organizationId },
    });
    if (!customer) throw new NotFoundException("Cliente no encontrado");

    const contract = await this.contracts.assertAssignableForDispatch(
      organizationId,
      dto.contractId,
      {
        departAt: dto.departAt || new Date(),
        estimatedFare: dto.estimatedFare,
      },
    );

    if (contract.customerId !== customer.id) {
      throw new UnprocessableEntityException({
        error: CONTRACT_DISPATCH_DENIED,
        message: "Contrato no pertenece al cliente solicitante",
        blocks: ["CONTRACT_CUSTOMER_MISMATCH"],
      });
    }

    const departAt = dto.departAt || new Date(Date.now() + 3_600_000);
    const count = await this.prisma.trip.count({ where: { organizationId } });
    const trip = await this.prisma.trip.create({
      data: {
        organizationId,
        code: `B2B-${1000 + count + 1}`,
        origin: dto.origin,
        destination: dto.destination,
        departAt,
        customerId: customer.id,
        contractId: contract.id,
        fareAmount: dto.estimatedFare ?? Number(contract.fixedFare ?? 0),
        status: TripStatus.PENDING,
      },
    });

    const request = await this.prisma.b2bServiceRequest.create({
      data: {
        organizationId,
        customerId: customer.id,
        contractId: contract.id,
        kind: (dto.kind as B2bServiceRequestKind) || B2bServiceRequestKind.EXPRESS,
        status: B2bServiceRequestStatus.APPROVED,
        origin: dto.origin,
        destination: dto.destination,
        departAt,
        estimatedFare: dto.estimatedFare,
        notes: dto.notes,
        originalTripId: dto.originalTripId,
        tripId: trip.id,
      },
      include: {
        trip: { select: { id: true, code: true, status: true, departAt: true } },
        contract: { select: { id: true, code: true, name: true } },
      },
    });

    this.logger.log(
      `[B2B] servicio ${request.kind} aprobado trip=${trip.code} contract=${contract.code}`,
    );

    return request;
  }

  async dashboard(organizationId: string, query: B2bDashboardQuery) {
    const days = query.days ?? 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const customer = await this.prisma.customer.findFirst({
      where: { id: query.customerId, organizationId },
    });
    if (!customer) throw new NotFoundException("Cliente no encontrado");

    const contract = query.contractId
      ? await this.prisma.transportContract.findFirst({
          where: {
            id: query.contractId,
            organizationId,
            customerId: customer.id,
          },
        })
      : await this.prisma.transportContract.findFirst({
          where: {
            organizationId,
            customerId: customer.id,
            status: "ACTIVE",
          },
          orderBy: { startsAt: "desc" },
        });

    const tripWhere = {
      organizationId,
      customerId: customer.id,
      ...(contract ? { contractId: contract.id } : {}),
      createdAt: { gte: since },
    };

    const [tripsTotal, tripsCompleted, trips, draftInvoices, issuedInvoices, activeTrips] =
      await Promise.all([
        this.prisma.trip.count({ where: tripWhere }),
        this.prisma.trip.count({
          where: { ...tripWhere, status: TripStatus.COMPLETED },
        }),
        this.prisma.trip.findMany({
          where: { ...tripWhere, status: TripStatus.COMPLETED },
          select: { departAt: true, updatedAt: true, createdAt: true },
        }),
        this.prisma.invoice.findMany({
          where: {
            organizationId,
            customerId: customer.id,
            type: InvoiceType.RECEIVABLE,
            status: InvoiceStatus.DRAFT,
          },
          select: { amount: true },
        }),
        this.prisma.invoice.count({
          where: {
            organizationId,
            customerId: customer.id,
            type: InvoiceType.RECEIVABLE,
            status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PAID] },
          },
        }),
        this.prisma.trip.findMany({
          where: {
            organizationId,
            customerId: customer.id,
            status: { in: [TripStatus.ASSIGNED, TripStatus.IN_TRANSIT] },
            vehicleId: { not: null },
          },
          select: { vehicleId: true },
          distinct: ["vehicleId"],
        }),
      ]);

    // SLA on-time: completed within 30 min of scheduled depart (proxy)
    const tripsOnTime = trips.filter((t) => {
      const lag = t.updatedAt.getTime() - t.departAt.getTime();
      return lag <= 30 * 60_000;
    }).length;

    const draftAmount = draftInvoices.reduce(
      (s, i) => s + Number(i.amount),
      0,
    );

    const metrics = consolidateB2bDashboard({
      tripsTotal,
      tripsCompleted,
      tripsOnTime,
      budgetCap: contract?.budgetCap != null ? Number(contract.budgetCap) : null,
      budgetConsumed: contract ? Number(contract.budgetConsumed) : 0,
      tripQuota: contract?.tripQuota ?? null,
      tripsUsed: contract?.tripsUsed ?? 0,
      draftInvoices: draftInvoices.length,
      draftInvoiceAmount: draftAmount,
      issuedInvoices,
      activeVehicles: activeTrips.length,
    });

    return {
      customer: { id: customer.id, name: customer.name, nit: customer.nit },
      contract: contract
        ? {
            id: contract.id,
            code: contract.code,
            name: contract.name,
            status: contract.status,
          }
        : null,
      periodDays: days,
      ...metrics,
    };
  }

  async activeFleet(organizationId: string, query: B2bActiveFleetQuery) {
    const trips = await this.prisma.trip.findMany({
      where: {
        organizationId,
        customerId: query.customerId,
        status: {
          in: [
            TripStatus.ASSIGNED,
            TripStatus.IN_TRANSIT,
            TripStatus.PENDING,
          ],
        },
        vehicleId: { not: null },
      },
      include: {
        vehicle: {
          select: {
            id: true,
            plate: true,
            lat: true,
            lng: true,
            status: true,
            brand: true,
            model: true,
          },
        },
        driver: { select: { id: true, name: true, phone: true } },
        contract: { select: { id: true, code: true } },
      },
      orderBy: { departAt: "asc" },
    });

    const vehicles = new Map<
      string,
      {
        vehicle: NonNullable<(typeof trips)[0]["vehicle"]>;
        trips: Array<{
          id: string;
          code: string;
          status: TripStatus;
          origin: string;
          destination: string;
          departAt: Date;
          driver: (typeof trips)[0]["driver"];
          contract: (typeof trips)[0]["contract"];
        }>;
      }
    >();

    for (const t of trips) {
      if (!t.vehicle) continue;
      const entry = vehicles.get(t.vehicle.id) || {
        vehicle: t.vehicle,
        trips: [],
      };
      entry.trips.push({
        id: t.id,
        code: t.code,
        status: t.status,
        origin: t.origin,
        destination: t.destination,
        departAt: t.departAt,
        driver: t.driver,
        contract: t.contract,
      });
      vehicles.set(t.vehicle.id, entry);
    }

    return {
      customerId: query.customerId,
      count: vehicles.size,
      units: [...vehicles.values()].map((u) => ({
        ...u.vehicle,
        location: { lat: u.vehicle.lat, lng: u.vehicle.lng },
        activeTrips: u.trips,
      })),
    };
  }
}
