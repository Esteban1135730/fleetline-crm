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
  WorkOrderStatus,
} from "@fsg/db";
import { HARD_RULES, PreoperationalChecklistSchema } from "@fsg/shared";
import type { PreoperationalChecklist } from "@fsg/shared";
import { PrismaService } from "../prisma/prisma.service";
import { ComplianceService } from "./compliance.service";

const tripInclude = {
  customer: true,
  vehicle: true,
  driver: true,
  contract: {
    select: {
      id: true,
      code: true,
      name: true,
      customerId: true,
      monthlyValue: true,
    },
  },
  invoice: { select: { id: true, number: true, status: true } },
} as const;

@Injectable()
export class LogisticsService {
  constructor(
    private prisma: PrismaService,
    private compliance: ComplianceService,
  ) {}

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
        odometerKm: true,
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

    return this.prisma.vehicle.update({
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
        odometerKm: true,
        updatedAt: true,
      },
    });
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

    if (data.vehicleId || data.driverId) {
      await this.compliance.assertCanAssign(
        organizationId,
        data.vehicleId,
        data.driverId,
      );
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

  async createDraftTripFromQuote(
    organizationId: string,
    data: {
      customerId: string;
      origin: string;
      destination: string;
      fareAmount: number;
      notes?: string;
      quoteCode?: string;
    },
  ) {
    const count = await this.prisma.trip.count({ where: { organizationId } });
    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() + 1);
    scheduledAt.setHours(6, 0, 0, 0);

    return this.prisma.trip.create({
      data: {
        code: `TRP-${1000 + count + 1}`,
        origin: data.origin,
        destination: data.destination,
        scheduledAt,
        customerId: data.customerId,
        fareAmount: data.fareAmount,
        notes:
          data.notes ||
          `Borrador desde cotización ${data.quoteCode || ""} — asignar unidad y conductor`.trim(),
        status: TripStatus.PENDING,
        organizationId,
      },
      include: tripInclude,
    });
  }

  async createDraftTripFromContract(
    organizationId: string,
    data: {
      contractId: string;
      customerId: string;
      origin: string;
      destination: string;
      fareAmount?: number;
      notes?: string;
    },
  ) {
    const count = await this.prisma.trip.count({ where: { organizationId } });
    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() + 1);
    scheduledAt.setHours(6, 0, 0, 0);

    return this.prisma.trip.create({
      data: {
        code: `TRP-${1000 + count + 1}`,
        origin: data.origin,
        destination: data.destination,
        scheduledAt,
        customerId: data.customerId,
        contractId: data.contractId,
        fareAmount: data.fareAmount,
        notes:
          data.notes ||
          "Borrador auto-generado desde Comercial — asignar vehículo y conductor",
        status: TripStatus.PENDING,
        organizationId,
      },
      include: tripInclude,
    });
  }

  async updateStatus(
    organizationId: string,
    id: string,
    status: string,
    opts?: { distanceKm?: number },
  ) {
    const trip = await this.prisma.trip.findFirst({
      where: { id, organizationId },
    });
    if (!trip) throw new NotFoundException("Viaje no encontrado");

    const mapped = status.toUpperCase() as TripStatus;

    if (
      mapped === TripStatus.ASSIGNED ||
      mapped === TripStatus.IN_TRANSIT
    ) {
      await this.compliance.assertCanAssign(
        organizationId,
        trip.vehicleId,
        trip.driverId,
      );
    }

    if (mapped === TripStatus.IN_TRANSIT) {
      if (!trip.preoperationalAt) {
        throw new BadRequestException(
          "Imposible iniciar viaje: Se requiere inspección preoperacional aprobada.",
        );
      }
      if (!trip.vehicleId || !trip.driverId) {
        throw new BadRequestException(
          "Asigne vehículo y conductor antes de iniciar el viaje",
        );
      }
    }

    const data: {
      status: TripStatus;
      startedAt?: Date | null;
      completedAt?: Date | null;
      distanceKm?: number;
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

    if (mapped === TripStatus.COMPLETED && trip.vehicleId) {
      const distance =
        opts?.distanceKm != null && opts.distanceKm > 0
          ? opts.distanceKm
          : HARD_RULES.DEFAULT_TRIP_DISTANCE_KM;
      data.distanceKm = distance;
      await this.applyOdometerAndPreventive(
        organizationId,
        trip.vehicleId,
        distance,
      );
      await this.prisma.vehicle.update({
        where: { id: trip.vehicleId },
        data: { status: VehicleStatus.AVAILABLE },
      });
    } else if (mapped === TripStatus.CANCELLED && trip.vehicleId) {
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

  private async applyOdometerAndPreventive(
    organizationId: string,
    vehicleId: string,
    distanceKm: number,
  ) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
    });
    if (!vehicle) return;

    const prev = vehicle.odometerKm;
    const next = prev + Math.round(distanceKm);
    const interval = vehicle.maintenanceEveryKm || HARD_RULES.MAINTENANCE_INTERVAL_KM;
    const crossed =
      Math.floor(prev / interval) < Math.floor(next / interval);

    await this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: { odometerKm: next },
    });

    if (!crossed) return;

    const openPreventive = await this.prisma.workOrder.findFirst({
      where: {
        vehicleId,
        status: { in: [WorkOrderStatus.OPEN, WorkOrderStatus.IN_PROGRESS] },
        description: { contains: "Preventivo odómetro" },
      },
    });
    if (openPreventive) return;

    const count = await this.prisma.workOrder.count();
    await this.prisma.workOrder.create({
      data: {
        code: `OT-${count + 1}`,
        description: `Preventivo odómetro — umbral ${interval} km alcanzado (${next} km)`,
        status: WorkOrderStatus.OPEN,
        vehicleId,
      },
    });
    await this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: { status: VehicleStatus.MAINTENANCE },
    });
  }

  async submitPreoperational(
    organizationId: string,
    tripId: string,
    body: unknown,
  ) {
    const parsed = PreoperationalChecklistSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        "Checklist inválido: frenos, luces, llantas, kitCarretera y nivelAceite son obligatorios (boolean)",
      );
    }
    const checklist: PreoperationalChecklist = parsed.data;

    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, organizationId },
    });
    if (!trip) throw new NotFoundException("Viaje no encontrado");

    if (
      trip.status !== TripStatus.PENDING &&
      trip.status !== TripStatus.ASSIGNED
    ) {
      throw new BadRequestException(
        "El preoperacional solo aplica a viajes pendientes o asignados",
      );
    }

    const ok =
      checklist.frenos &&
      checklist.luces &&
      checklist.llantas &&
      checklist.kitCarretera &&
      checklist.nivelAceite;
    if (!ok) {
      throw new BadRequestException(
        "Checklist incompleto: todos los ítems deben estar APTO (frenos, luces, llantas, kit, aceite)",
      );
    }

    await this.compliance.assertCanAssign(
      organizationId,
      trip.vehicleId,
      trip.driverId,
    );

    return this.prisma.trip.update({
      where: { id: tripId },
      data: {
        preoperationalAt: new Date(),
        preoperationalJson: checklist,
        status: trip.vehicleId ? TripStatus.ASSIGNED : trip.status,
      },
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
        this.prisma.account.findFirst({
          where: { organizationId, code: "1305" },
        }),
        this.prisma.account.findFirst({
          where: { organizationId, code: "4135" },
        }),
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
                {
                  accountId: clientes.id,
                  debit: amount,
                  credit: 0,
                  memo: "CxC",
                },
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
