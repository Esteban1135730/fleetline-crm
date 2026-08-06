import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  forwardRef,
} from "@nestjs/common";
import {
  InvoiceStatus,
  InvoiceType,
  TripStatus,
  VehicleStatus,
  WorkOrderStatus,
} from "@fsg/db";
import { HARD_RULES, PreoperationalChecklistSchema } from "@fsg/shared";
import type { PreoperationalChecklist } from "@fsg/shared";
import { PrismaService } from "../prisma/prisma.service";
import { CommercialContractService } from "../comercial/commercial-contract.service";
import { ComplianceService } from "./compliance.service";
import { ComplianceGateService } from "./compliance-gate.service";
import { KafkaEventsService } from "./kafka-events.service";
import type { CreateTripDto, DispatchTripDto } from "./dto/trip.dto";

const tripInclude = {
  customer: true,
  vehicle: true,
  driver: true,
  route: true,
  planilla: true,
  preoperational: true,
  contract: {
    select: {
      id: true,
      code: true,
      name: true,
      customerId: true,
      monthlyValue: true,
    },
  },
  invoices: { select: { id: true, number: true, status: true }, take: 5 },
} as const;

@Injectable()
export class LogisticsService {
  constructor(
    private prisma: PrismaService,
    private compliance: ComplianceService,
    private gate: ComplianceGateService,
    private kafka: KafkaEventsService,
    @Inject(forwardRef(() => CommercialContractService))
    private commercialContracts: CommercialContractService,
  ) {}

  listTrips(organizationId: string) {
    return this.prisma.trip.findMany({
      where: { organizationId },
      include: tripInclude,
      orderBy: { departAt: "desc" },
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
        licenseNumber: data.license,
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
        licenseNumber: data.license,
        active: data.active,
        userId: data.userId === undefined ? undefined : data.userId,
      },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
  }

  async myTrips(organizationId: string, userId: string) {
    let driver = await this.prisma.driver.findFirst({
      where: { organizationId, userId, active: true },
    });

    // Auto-vínculo: usuario CONDUCTOR sin Driver.userId → enlazar por nombre exacto
    if (!driver) {
      const user = await this.prisma.user.findFirst({
        where: { id: userId, organizationId, active: true },
      });
      if (user && String(user.role).toUpperCase() === "CONDUCTOR") {
        const byName = await this.prisma.driver.findFirst({
          where: {
            organizationId,
            active: true,
            userId: null,
            name: user.name,
          },
        });
        if (byName) {
          driver = await this.prisma.driver.update({
            where: { id: byName.id },
            data: { userId: user.id },
          });
        }
      }
    }

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
            TripStatus.AWAITING_PREOP,
            TripStatus.AWAITING_FUEC,
            TripStatus.IN_TRANSIT,
            TripStatus.INCIDENT,
          ],
        },
      },
      include: tripInclude,
      orderBy: { departAt: "asc" },
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

    await this.prisma.gpsSnapshot.create({
      data: {
        vehicleId,
        lat: data.lat,
        lng: data.lng,
      },
    });

    // Histórico por servicio EN RUTA
    const activeTrip = await this.prisma.trip.findFirst({
      where: {
        organizationId,
        vehicleId,
        status: TripStatus.IN_TRANSIT,
      },
      orderBy: { startedAt: "desc" },
    });
    if (activeTrip) {
      await this.prisma.tripTrackPoint.create({
        data: {
          tripId: activeTrip.id,
          vehicleId,
          lat: data.lat,
          lng: data.lng,
        },
      });
    }

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

  /**
   * Crea viaje. Si trae vehicleId+driverId, el ComplianceGuard ya validó Hard-Stop.
   * Emite `trip.dispatched` cuando nace asignado (con unidad y conductor).
   */
  async createTrip(organizationId: string, data: CreateTripDto) {
    let customerId = data.customerId || undefined;
    let fareAmount = data.fareAmount;
    const departAt = new Date(
      data.departAt || data.scheduledAt || Date.now(),
    );
    if (Number.isNaN(departAt.getTime())) {
      throw new BadRequestException(
        "departAt debe ser una fecha ISO 8601 válida",
      );
    }

    if (data.contractId) {
      const contract = await this.commercialContracts.assertAssignableForDispatch(
        organizationId,
        data.contractId,
        {
          departAt,
          estimatedFare: fareAmount,
        },
      );
      if (!customerId) customerId = contract.customerId;
      if (fareAmount == null && contract.monthlyValue != null) {
        fareAmount = Number(contract.monthlyValue);
      }
    }

    if (data.vehicleId && data.driverId) {
      const gate = await this.gate.evaluate({
        organizationId,
        vehicleId: data.vehicleId,
        driverId: data.driverId,
        departAt,
        requireFuec: data.requireFuec === true || data.dispatch === true,
      });
      if (!gate.ok) {
        throw new UnprocessableEntityException({
          error: "COMPLIANCE_GATE_BLOCKED",
          message:
            "Hard-Stop: el viaje no puede despacharse por incumplimiento normativo",
          blocks: gate.violations.map((v) => v.code),
          violations: gate.violations,
        });
      }
    }

    const count = await this.prisma.trip.count({ where: { organizationId } });
    const assigned = Boolean(data.vehicleId && data.driverId);

    const trip = await this.prisma.trip.create({
      data: {
        code: `TRP-${1000 + count + 1}`,
        origin: data.origin,
        destination: data.destination,
        departAt,
        customerId,
        contractId: data.contractId || undefined,
        vehicleId: data.vehicleId || undefined,
        driverId: data.driverId || undefined,
        routeId: data.routeId || undefined,
        fareAmount: fareAmount ?? 0,
        status: assigned ? TripStatus.ASSIGNED : TripStatus.PENDING,
        organizationId,
      },
      include: tripInclude,
    });

    if (assigned && trip.vehicleId && trip.driverId) {
      await this.kafka.emitTripDispatched({
        tripId: trip.id,
        organizationId,
        vehicleId: trip.vehicleId,
        driverId: trip.driverId,
        code: trip.code,
        departAt: trip.departAt.toISOString(),
      });
    }

    return trip;
  }

  /**
   * Despacho / asignación de unidad+conductor a un viaje existente.
   * ComplianceGuard + gate con FUEC obligatorio → emite trip.dispatched.
   */
  async dispatchTrip(
    organizationId: string,
    tripId: string,
    data: DispatchTripDto,
  ) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, organizationId },
    });
    if (!trip) throw new NotFoundException("Viaje no encontrado");

    const departAt = data.departAt
      ? new Date(data.departAt)
      : trip.departAt;

    if (trip.contractId) {
      await this.commercialContracts.assertAssignableForDispatch(
        organizationId,
        trip.contractId,
        {
          departAt,
          estimatedFare: Number(trip.fareAmount) || undefined,
        },
      );
    }

    const gate = await this.gate.evaluate({
      organizationId,
      vehicleId: data.vehicleId,
      driverId: data.driverId,
      departAt,
      requireFuec: true,
    });
    if (!gate.ok) {
      throw new UnprocessableEntityException({
        error: "COMPLIANCE_GATE_BLOCKED",
        message:
          "Hard-Stop: el viaje no puede despacharse por incumplimiento normativo",
        blocks: gate.violations.map((v) => v.code),
        violations: gate.violations,
      });
    }

    const updated = await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        vehicleId: data.vehicleId,
        driverId: data.driverId,
        routeId: data.routeId ?? trip.routeId,
        departAt,
        status: TripStatus.ASSIGNED,
      },
      include: tripInclude,
    });

    await this.kafka.emitTripDispatched({
      tripId: updated.id,
      organizationId,
      vehicleId: data.vehicleId,
      driverId: data.driverId,
      code: updated.code,
      departAt: updated.departAt.toISOString(),
    });

    return updated;
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
    const departAt = new Date();
    departAt.setDate(departAt.getDate() + 1);
    departAt.setHours(6, 0, 0, 0);

    return this.prisma.trip.create({
      data: {
        code: `TRP-${1000 + count + 1}`,
        origin: data.origin,
        destination: data.destination,
        departAt,
        customerId: data.customerId,
        fareAmount: data.fareAmount,
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
    const departAt = new Date();
    departAt.setDate(departAt.getDate() + 1);
    departAt.setHours(6, 0, 0, 0);

    return this.prisma.trip.create({
      data: {
        code: `TRP-${1000 + count + 1}`,
        origin: data.origin,
        destination: data.destination,
        departAt,
        customerId: data.customerId,
        contractId: data.contractId,
        fareAmount: data.fareAmount ?? 0,
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
      include: { preoperational: true },
    });
    if (!trip) throw new NotFoundException("Viaje no encontrado");

    const mapped = status.toUpperCase() as TripStatus;

    if (mapped === TripStatus.ASSIGNED || mapped === TripStatus.IN_TRANSIT) {
      if (trip.vehicleId && trip.driverId) {
        const gate = await this.gate.evaluate({
          organizationId,
          vehicleId: trip.vehicleId,
          driverId: trip.driverId,
          departAt: trip.departAt,
          requireFuec: mapped === TripStatus.IN_TRANSIT,
        });
        if (!gate.ok) {
          throw new UnprocessableEntityException({
            error: "COMPLIANCE_GATE_BLOCKED",
            message: "Hard-Stop al cambiar estado",
            blocks: gate.violations.map((v) => v.code),
            violations: gate.violations,
          });
        }
      }
    }

    if (mapped === TripStatus.IN_TRANSIT) {
      if (!trip.preoperational?.approved) {
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
      await this.applyOdometerAndPreventive(
        organizationId,
        trip.vehicleId,
        distance,
      );
      await this.prisma.trip.update({
        where: { id },
        data: { distanceKm: distance },
      });
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

    const updated = await this.prisma.trip.update({
      where: { id },
      data: { status: mapped },
      include: tripInclude,
    });

    if (mapped === TripStatus.COMPLETED) {
      await this.kafka.emitTripCompleted({
        organizationId,
        tripId: updated.id,
        code: updated.code,
        amount: Number(updated.fareAmount),
        contractId: updated.contractId,
      });
    }

    return updated;
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
    const interval =
      vehicle.maintenanceEveryKm || HARD_RULES.MAINTENANCE_INTERVAL_KM;
    const crossed = Math.floor(prev / interval) < Math.floor(next / interval);

    await this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: { odometerKm: next },
    });

    if (!crossed) return;

    const openPreventive = await this.prisma.workOrder.findFirst({
      where: {
        vehicleId,
        organizationId,
        status: { in: [WorkOrderStatus.OPEN, WorkOrderStatus.IN_PROGRESS] },
        description: { contains: "Preventivo odómetro" },
      },
    });
    if (openPreventive) return;

    const count = await this.prisma.workOrder.count({ where: { organizationId } });
    await this.prisma.workOrder.create({
      data: {
        code: `OT-${count + 1}`,
        description: `Preventivo odómetro — umbral ${interval} km alcanzado (${next} km)`,
        status: WorkOrderStatus.OPEN,
        vehicleId,
        organizationId,
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
        "Checklist inválido: frenos, luces, llantas, kitCarretera y nivelAceite son obligatorios",
      );
    }
    const checklist: PreoperationalChecklist = parsed.data;

    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, organizationId },
    });
    if (!trip) throw new NotFoundException("Viaje no encontrado");
    if (!trip.driverId) {
      throw new BadRequestException("El viaje no tiene conductor asignado");
    }

    if (
      trip.status !== TripStatus.PENDING &&
      trip.status !== TripStatus.ASSIGNED &&
      trip.status !== TripStatus.AWAITING_PREOP
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
        "Checklist incompleto: todos los ítems deben estar APTO",
      );
    }

    if (trip.vehicleId) {
      await this.compliance.assertCanAssign(
        organizationId,
        trip.vehicleId,
        trip.driverId,
      );
    }

    await this.prisma.preoperational.upsert({
      where: { tripId },
      create: {
        tripId,
        driverId: trip.driverId,
        brakesOk: checklist.frenos,
        lightsOk: checklist.luces,
        tiresOk: checklist.llantas,
        kitOk: checklist.kitCarretera,
        oilOk: checklist.nivelAceite,
        observations: checklist.observaciones,
        approved: true,
        payload: checklist,
      },
      update: {
        brakesOk: checklist.frenos,
        lightsOk: checklist.luces,
        tiresOk: checklist.llantas,
        kitOk: checklist.kitCarretera,
        oilOk: checklist.nivelAceite,
        observations: checklist.observaciones,
        approved: true,
        payload: checklist,
        signedAt: new Date(),
      },
    });

    return this.prisma.trip.update({
      where: { id: tripId },
      data: {
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
        incidentNote: notes.trim() || "Novedad operativa reportada",
      },
      include: tripInclude,
    });
  }

  async invoiceFromTrip(organizationId: string, tripId: string) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, organizationId },
      include: {
        customer: true,
        contract: true,
        invoices: { take: 1 },
      },
    });
    if (!trip) throw new NotFoundException("Viaje no encontrado");
    if (trip.status !== TripStatus.COMPLETED) {
      throw new BadRequestException(
        "Solo se puede facturar un viaje en estado Terminado",
      );
    }
    if (trip.invoices.length) {
      throw new BadRequestException(
        `Este viaje ya tiene factura ${trip.invoices[0].number}`,
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
      throw new BadRequestException("El viaje no tiene valor (fareAmount).");
    }

    const count = await this.prisma.invoice.count({ where: { organizationId } });
    const due = new Date();
    due.setDate(due.getDate() + 15);
    const counterparty =
      trip.customer?.name || trip.customer?.nit || "Cliente flota";

    return this.prisma.invoice.create({
      data: {
        number: `FV-2026-${String(count + 1).padStart(3, "0")}`,
        type: InvoiceType.RECEIVABLE,
        status: InvoiceStatus.ISSUED,
        counterparty,
        amount,
        dueDate: due,
        customerId,
        tripId: trip.id,
        organizationId,
      },
      include: { customer: true, trip: { select: { id: true, code: true } } },
    });
  }
}
