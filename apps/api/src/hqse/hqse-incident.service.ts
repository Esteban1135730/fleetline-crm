import {
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  IncidentKind,
  IncidentSeverity,
  IncidentStatus,
  VehicleStatus,
  WorkOrderStatus,
} from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";
import { KafkaEventsService } from "../logistics/kafka-events.service";
import type {
  CreateIncidentDto,
  ListIncidentsQuery,
} from "./dto/hqse.dto";
import {
  HQSE_AUTO_BLOCK_SEVERITIES,
  HQSE_DRIVER_BLOCK_REASON,
  HQSE_VEHICLE_BLOCK_REASON,
} from "./pesv.calc";

const incidentInclude = {
  vehicle: {
    select: {
      id: true,
      plate: true,
      status: true,
      complianceBlocked: true,
    },
  },
  driver: {
    select: {
      id: true,
      name: true,
      document: true,
      dispatchBlocked: true,
      blockReason: true,
    },
  },
} as const;

/**
 * Incidentes / accidentes de tránsito y hallazgos SST (Módulo 14).
 * CRITICAL/SEVERE → kill-switch flota + conductor + OT peritaje Taller.
 */
@Injectable()
export class HqseIncidentService {
  private readonly logger = new Logger(HqseIncidentService.name);

  constructor(
    private prisma: PrismaService,
    private kafka: KafkaEventsService,
  ) {}

  list(organizationId: string, query: ListIncidentsQuery) {
    return this.prisma.hqseIncident.findMany({
      where: {
        organizationId,
        ...(query.severity
          ? { severity: query.severity as IncidentSeverity }
          : {}),
        ...(query.status ? { status: query.status as IncidentStatus } : {}),
        ...(query.kind ? { kind: query.kind as IncidentKind } : {}),
        ...(query.vehicleId ? { vehicleId: query.vehicleId } : {}),
        ...(query.driverId ? { driverId: query.driverId } : {}),
        ...(query.from || query.to
          ? {
              occurredAt: {
                ...(query.from ? { gte: query.from } : {}),
                ...(query.to ? { lte: query.to } : {}),
              },
            }
          : {}),
      },
      include: incidentInclude,
      orderBy: { occurredAt: "desc" },
    });
  }

  async create(
    organizationId: string,
    dto: CreateIncidentDto,
    reportedById?: string,
  ) {
    if (dto.vehicleId) {
      const v = await this.prisma.vehicle.findFirst({
        where: { id: dto.vehicleId, organizationId },
      });
      if (!v) throw new NotFoundException("Vehículo no encontrado");
    }
    if (dto.driverId) {
      const d = await this.prisma.driver.findFirst({
        where: { id: dto.driverId, organizationId },
      });
      if (!d) throw new NotFoundException("Conductor no encontrado");
    }

    const count = await this.prisma.hqseIncident.count({
      where: { organizationId },
    });
    const severity = dto.severity as IncidentSeverity;
    const autoBlock = HQSE_AUTO_BLOCK_SEVERITIES.has(severity);

    const incident = await this.prisma.hqseIncident.create({
      data: {
        organizationId,
        code: `INC-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`,
        title: dto.title,
        description: dto.description,
        kind: (dto.kind as IncidentKind) || IncidentKind.TRAFFIC_ACCIDENT,
        severity,
        status: IncidentStatus.OPEN,
        occurredAt: dto.occurredAt || new Date(),
        location: dto.location,
        vehicleId: dto.vehicleId,
        driverId: dto.driverId,
        reportedById,
        autoBlocked: false,
      },
      include: incidentInclude,
    });

    if (!autoBlock) {
      return { ...incident, autoActions: null };
    }

    const autoActions = await this.applySevereIncidentBlocks(
      organizationId,
      incident.id,
      {
        code: incident.code,
        severity,
        vehicleId: dto.vehicleId,
        driverId: dto.driverId,
        title: dto.title,
      },
    );

    const refreshed = await this.prisma.hqseIncident.findUniqueOrThrow({
      where: { id: incident.id },
      include: incidentInclude,
    });

    return { ...refreshed, autoActions };
  }

  /**
   * Kill-switch HQSE: vehículo MAINTENANCE+complianceBlocked,
   * conductor dispatchBlocked (reevaluación), OT peritaje Taller.
   */
  async applySevereIncidentBlocks(
    organizationId: string,
    incidentId: string,
    ctx: {
      code: string;
      severity: IncidentSeverity | string;
      vehicleId?: string;
      driverId?: string;
      title: string;
    },
  ) {
    let vehicleBlocked: {
      id: string;
      plate: string;
      status: VehicleStatus;
      complianceBlocked: boolean;
    } | null = null;
    let driverBlocked: {
      id: string;
      name: string;
      dispatchBlocked: boolean;
      blockReason: string | null;
    } | null = null;
    let workOrder: { id: string; code: string } | null = null;

    if (ctx.vehicleId) {
      vehicleBlocked = await this.prisma.vehicle.update({
        where: { id: ctx.vehicleId },
        data: {
          status: VehicleStatus.MAINTENANCE,
          complianceBlocked: true,
          complianceReason: `${HQSE_VEHICLE_BLOCK_REASON}:${ctx.code}`,
        },
        select: {
          id: true,
          plate: true,
          status: true,
          complianceBlocked: true,
        },
      });

      const woCount = await this.prisma.workOrder.count({
        where: { organizationId },
      });
      const wo = await this.prisma.workOrder.create({
        data: {
          organizationId,
          vehicleId: ctx.vehicleId,
          code: `OT-HQSE-${String(woCount + 1).padStart(4, "0")}`,
          description: `[CRITICAL] Peritaje HQSE post-incidente ${ctx.code} — ${ctx.title}`,
          status: WorkOrderStatus.OPEN,
        },
        select: { id: true, code: true },
      });
      workOrder = wo;
    }

    if (ctx.driverId) {
      driverBlocked = await this.prisma.driver.update({
        where: { id: ctx.driverId },
        data: {
          dispatchBlocked: true,
          blockReason: HQSE_DRIVER_BLOCK_REASON,
        },
        select: {
          id: true,
          name: true,
          dispatchBlocked: true,
          blockReason: true,
        },
      });
    }

    await this.prisma.hqseIncident.update({
      where: { id: incidentId },
      data: {
        autoBlocked: true,
        workOrderId: workOrder?.id,
        status: IncidentStatus.INVESTIGATING,
        meta: {
          vehicleBlocked: !!vehicleBlocked,
          driverBlocked: !!driverBlocked,
          workOrderId: workOrder?.id,
          workOrderCode: workOrder?.code,
        },
      },
    });

    await this.kafka.emit("hqse.incident.severe", {
      organizationId,
      incidentId,
      code: ctx.code,
      severity: ctx.severity,
      vehicleId: ctx.vehicleId,
      driverId: ctx.driverId,
      workOrderId: workOrder?.id,
      plate: vehicleBlocked?.plate,
    });

    this.logger.warn(
      `[HQSE] ${ctx.severity} ${ctx.code} — vehículo=${vehicleBlocked?.plate ?? "n/a"} conductor=${driverBlocked?.name ?? "n/a"} OT=${workOrder?.code ?? "n/a"}`,
    );

    return {
      vehicleBlocked,
      driverBlocked,
      workOrder,
      notifiedModule: "taller",
    };
  }
}
