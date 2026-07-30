import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  InvoiceStatus,
  InvoiceType,
  JournalEntryStatus,
  TripStatus,
  VehicleStatus,
} from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";

const tripInclude = {
  customer: true,
  vehicle: true,
  driver: true,
  contract: { select: { id: true, code: true, name: true, customerId: true, monthlyValue: true } },
  invoice: { select: { id: true, number: true, status: true } },
} as const;

@Injectable()
export class LogisticsService {
  constructor(private prisma: PrismaService) {}

  listTrips(organizationId: string) {
    return this.prisma.trip.findMany({
      where: { organizationId },
      include: tripInclude,
      orderBy: { scheduledAt: "desc" },
    });
  }

  listDrivers(organizationId: string, all = false) {
    return this.prisma.driver.findMany({
      where: {
        organizationId,
        ...(all ? {} : { active: true }),
      },
      include: { user: { select: { id: true, email: true, name: true } } },
      orderBy: { name: "asc" },
    });
  }

  createDriver(
    organizationId: string,
    data: {
      name: string;
      document: string;
      phone?: string;
      license?: string;
      userId?: string;
    },
  ) {
    return this.prisma.driver.create({
      data: {
        organizationId,
        name: data.name,
        document: data.document,
        phone: data.phone,
        license: data.license,
        userId: data.userId || undefined,
        active: true,
      },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
  }

  async updateDriver(
    organizationId: string,
    id: string,
    data: {
      name?: string;
      phone?: string;
      license?: string;
      active?: boolean;
      userId?: string | null;
    },
  ) {
    const d = await this.prisma.driver.findFirst({
      where: { id, organizationId },
    });
    if (!d) throw new NotFoundException("Conductor no encontrado");
    return this.prisma.driver.update({
      where: { id },
      data: {
        name: data.name,
        phone: data.phone,
        license: data.license,
        active: data.active,
        userId: data.userId === undefined ? undefined : data.userId,
      },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
  }

  /** Viajes del conductor vinculado al usuario logueado (app móvil) */
  async myTrips(organizationId: string, userId: string) {
    const driver = await this.prisma.driver.findFirst({
      where: { organizationId, userId, active: true },
    });
    if (!driver) {
      return { driver: null, trips: [] };
    }
    const trips = await this.prisma.trip.findMany({
      where: {
        organizationId,
        driverId: driver.id,
        status: {
          in: [
            TripStatus.PENDING,
            TripStatus.ASSIGNED,
            TripStatus.IN_TRANSIT,
            TripStatus.INCIDENT,
          ],
        },
      },
      include: tripInclude,
      orderBy: { scheduledAt: "asc" },
    });
    return { driver, trips };
  }

  getGps(organizationId: string) {
    return this.prisma.vehicle.findMany({
      where: {
        organizationId,
        status: {
          in: [
            VehicleStatus.IN_SERVICE,
            VehicleStatus.AVAILABLE,
            VehicleStatus.MAINTENANCE,
          ],
        },
      },
      select: {
        id: true,
        plate: true,
        lat: true,
        lng: true,
        status: true,
        updatedAt: true,
      },
      orderBy: { plate: "asc" },
    });
  }

  async updateGps(
    organizationId: string,
    vehicleId: string,
    data: { lat: number; lng: number },
  ) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
    });
    if (!vehicle) throw new NotFoundException("Vehículo no encontrado");

    const updated = await this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        lat: data.lat,
        lng: data.lng,
        status:
          vehicle.status === VehicleStatus.AVAILABLE
            ? VehicleStatus.IN_SERVICE
            : vehicle.status,
      },
      select: {
        id: true,
        plate: true,
        lat: true,
        lng: true,
        status: true,
        updatedAt: true,
      },
    });
    return updated;
  }

  async createTrip(
    organizationId: string,
    data: {
      origin: string;
      destination: string;
      scheduledAt: string;
      customerId?: string;
      contractId?: string;
      vehicleId?: string;
      driverId?: string;
      fareAmount?: number;
      notes?: string;
    },
  ) {
    let customerId = data.customerId || undefined;
    let fareAmount = data.fareAmount;

    if (data.contractId) {
      const contract = await this.prisma.transportContract.findFirst({
        where: { id: data.contractId, organizationId },
      });
      if (!contract) throw new NotFoundException("Contrato no encontrado");
      if (!customerId) customerId = contract.customerId;
      if (fareAmount == null && contract.monthlyValue != null) {
        fareAmount = Number(contract.monthlyValue);
      }
    }

    const count = await this.prisma.trip.count({ where: { organizationId } });
    return this.prisma.trip.create({
      data: {
        code: `TRP-${1000 + count + 1}`,
        origin: data.origin,
        destination: data.destination,
        scheduledAt: new Date(data.scheduledAt),
        customerId,
        contractId: data.contractId || undefined,
        vehicleId: data.vehicleId || undefined,
        driverId: data.driverId || undefined,
        fareAmount,
        notes: data.notes,
        status: data.vehicleId ? TripStatus.ASSIGNED : TripStatus.PENDING,
        organizationId,
      },
      include: tripInclude,
    });
  }

  async updateStatus(organizationId: string, id: string, status: string) {
    const trip = await this.prisma.trip.findFirst({
      where: { id, organizationId },
    });
    if (!trip) throw new NotFoundException("Viaje no encontrado");

    const mapped = status.toUpperCase() as TripStatus;
    const data: {
      status: TripStatus;
      startedAt?: Date | null;
      completedAt?: Date | null;
    } = {
      status: mapped,
      startedAt:
        mapped === TripStatus.IN_TRANSIT ? new Date() : trip.startedAt,
      completedAt:
        mapped === TripStatus.COMPLETED ? new Date() : trip.completedAt,
    };

    if (mapped === TripStatus.IN_TRANSIT && trip.vehicleId) {
      await this.prisma.vehicle.update({
        where: { id: trip.vehicleId },
        data: { status: VehicleStatus.IN_SERVICE },
      });
    }
    if (
      (mapped === TripStatus.COMPLETED || mapped === TripStatus.CANCELLED) &&
      trip.vehicleId
    ) {
      await this.prisma.vehicle.update({
        where: { id: trip.vehicleId },
        data: { status: VehicleStatus.AVAILABLE },
      });
    }

    return this.prisma.trip.update({
      where: { id },
      data,
      include: tripInclude,
    });
  }

  async reportIncident(organizationId: string, id: string, notes: string) {
    const trip = await this.prisma.trip.findFirst({
      where: { id, organizationId },
    });
    if (!trip) throw new NotFoundException("Viaje no encontrado");

    return this.prisma.trip.update({
      where: { id },
      data: {
        status: TripStatus.INCIDENT,
        notes: notes.trim() || "Novedad operativa reportada",
      },
      include: tripInclude,
    });
  }

  async invoiceFromTrip(organizationId: string, tripId: string) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, organizationId },
      include: { customer: true, contract: true, invoice: true },
    });
    if (!trip) throw new NotFoundException("Viaje no encontrado");
    if (trip.status !== TripStatus.COMPLETED) {
      throw new BadRequestException(
        "Solo se puede facturar un viaje en estado Terminado",
      );
    }
    if (trip.invoice) {
      throw new BadRequestException(
        `Este viaje ya tiene factura ${trip.invoice.number}`,
      );
    }

    let customerId = trip.customerId;
    if (!customerId && trip.contractId) {
      customerId = trip.contract?.customerId ?? null;
      if (customerId) {
        await this.prisma.trip.update({
          where: { id: trip.id },
          data: { customerId },
        });
      }
    }
    if (!customerId) {
      throw new BadRequestException("El viaje no tiene cliente asignado");
    }

    let amount = Number(trip.fareAmount || 0);
    if (amount <= 0 && trip.contract?.monthlyValue) {
      amount = Number(trip.contract.monthlyValue);
      await this.prisma.trip.update({
        where: { id: trip.id },
        data: { fareAmount: amount },
      });
    }
    if (amount <= 0) {
      throw new BadRequestException(
        "El viaje no tiene valor. Indica fareAmount al crear el viaje o en el contrato.",
      );
    }

    const count = await this.prisma.invoice.count({ where: { organizationId } });
    const due = new Date();
    due.setDate(due.getDate() + 15);

    const inv = await this.prisma.invoice.create({
      data: {
        number: `FV-2026-${String(count + 1).padStart(3, "0")}`,
        type: InvoiceType.RECEIVABLE,
        status: InvoiceStatus.ISSUED,
        amount,
        dueDate: due,
        customerId,
        tripId: trip.id,
        organizationId,
        description: `Viaje ${trip.code}: ${trip.origin} → ${trip.destination}`,
      },
      include: { customer: true, trip: { select: { id: true, code: true } } },
    });

    try {
      const [clientes, ingresos] = await Promise.all([
        this.prisma.account.findFirst({ where: { organizationId, code: "1305" } }),
        this.prisma.account.findFirst({ where: { organizationId, code: "4135" } }),
      ]);
      if (clientes && ingresos) {
        const jCount = await this.prisma.journalEntry.count({
          where: { organizationId },
        });
        const entry = await this.prisma.journalEntry.create({
          data: {
            number: `AS-2026-${String(jCount + 1).padStart(3, "0")}`,
            description: `Emisión ${inv.number}`,
            status: JournalEntryStatus.POSTED,
            organizationId,
            lines: {
              create: [
                { accountId: clientes.id, debit: amount, credit: 0, memo: "CxC" },
                {
                  accountId: ingresos.id,
                  debit: 0,
                  credit: amount,
                  memo: "Ingreso transporte",
                },
              ],
            },
          },
        });
        await this.prisma.invoice.update({
          where: { id: inv.id },
          data: { journalEntryId: entry.id },
        });
      }
    } catch {
      /* PUC incompleto */
    }

    return inv;
  }
}
