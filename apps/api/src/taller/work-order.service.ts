import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { VehicleStatus, WorkOrderStatus } from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";
import { KafkaEventsService } from "../logistics/kafka-events.service";
import type { CloseWorkOrderDto, CreateWorkOrderDto } from "./dto/taller.dto";

@Injectable()
export class WorkOrderService {
  constructor(
    private prisma: PrismaService,
    private kafka: KafkaEventsService,
  ) {}

  list(organizationId: string) {
    return this.prisma.workOrder.findMany({
      where: { organizationId },
      include: {
        vehicle: {
          select: {
            id: true,
            plate: true,
            status: true,
            complianceBlocked: true,
            odometerKm: true,
          },
        },
        assignedTo: { select: { id: true, name: true } },
        dispatches: { take: 10, orderBy: { dispatchedAt: "desc" } },
      },
      orderBy: { openedAt: "desc" },
    });
  }

  isCritical(dto: CreateWorkOrderDto): boolean {
    if (dto.critical === true) return true;
    if (dto.severity === "CRITICAL") return true;
    const d = (dto.description || "").toUpperCase();
    return (
      d.includes("[CRITICAL]") ||
      d.includes("CORRECTIVA GRAVE") ||
      d.includes("MOTOR FUNDIDO") ||
      d.includes("FRENOS FALLA")
    );
  }

  async create(organizationId: string, dto: CreateWorkOrderDto) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: dto.vehicleId, organizationId },
    });
    if (!vehicle) throw new NotFoundException("Vehículo no encontrado");

    const critical = this.isCritical(dto);
    const count = await this.prisma.workOrder.count({
      where: { organizationId },
    });

    const wo = await this.prisma.workOrder.create({
      data: {
        code: `OT-${String(500 + count + 1).padStart(4, "0")}`,
        description: critical
          ? `[CRITICAL] ${dto.description.replace(/^\[CRITICAL\]\s*/i, "")}`
          : dto.description,
        vehicleId: vehicle.id,
        organizationId,
        assignedToId: dto.assignedToId,
        odometerAtOpen: dto.odometerAtOpen ?? vehicle.odometerKm,
        status: WorkOrderStatus.OPEN,
      },
      include: { vehicle: true },
    });

    if (critical) {
      await this.prisma.vehicle.update({
        where: { id: vehicle.id },
        data: {
          status: VehicleStatus.MAINTENANCE,
          complianceBlocked: true,
          complianceReason: `OT crítica ${wo.code} — bloqueo despacho Logística`,
        },
      });

      await this.kafka.emit("taller.vehiculo.bloqueado", {
        vehicleId: vehicle.id,
        organizationId,
        workOrderId: wo.id,
        code: wo.code,
        plate: vehicle.plate,
        reason: "CRITICAL_WORK_ORDER",
      });
    } else {
      await this.prisma.vehicle.update({
        where: { id: vehicle.id },
        data: { status: VehicleStatus.MAINTENANCE },
      });
    }

    return {
      ...wo,
      critical,
      vehicleBlockedForDispatch: critical,
    };
  }

  async close(
    organizationId: string,
    workOrderId: string,
    _dto?: CloseWorkOrderDto,
  ) {
    const wo = await this.prisma.workOrder.findFirst({
      where: { id: workOrderId, organizationId },
      include: { vehicle: true },
    });
    if (!wo) throw new NotFoundException("OT no encontrada");
    if (wo.status === WorkOrderStatus.DONE) {
      throw new BadRequestException("La OT ya está cerrada");
    }

    const updated = await this.prisma.workOrder.update({
      where: { id: wo.id },
      data: {
        status: WorkOrderStatus.DONE,
        closedAt: new Date(),
      },
      include: { vehicle: true },
    });

    const otherOpen = await this.prisma.workOrder.count({
      where: {
        organizationId,
        vehicleId: wo.vehicleId,
        status: {
          in: [
            WorkOrderStatus.OPEN,
            WorkOrderStatus.IN_PROGRESS,
            WorkOrderStatus.WAITING_PARTS,
          ],
        },
        id: { not: wo.id },
      },
    });

    const wasCritical = wo.description.toUpperCase().includes("[CRITICAL]");

    if (otherOpen === 0) {
      await this.prisma.vehicle.update({
        where: { id: wo.vehicleId },
        data: {
          status: VehicleStatus.AVAILABLE,
          ...(wasCritical || wo.vehicle.complianceReason?.includes(wo.code)
            ? {
                complianceBlocked: false,
                complianceReason: null,
              }
            : {}),
        },
      });

      await this.kafka.emit("taller.vehiculo.reparado", {
        vehicleId: wo.vehicleId,
        organizationId,
        workOrderId: wo.id,
        plate: wo.vehicle.plate,
      });
    }

    return {
      ...updated,
      vehicleReleased: otherOpen === 0,
      remainingOpenOrders: otherOpen,
    };
  }
}

@Injectable()
export class TallerService {
  constructor(
    private prisma: PrismaService,
    private workOrders: WorkOrderService,
  ) {}

  listVehicles(organizationId: string) {
    return this.prisma.vehicle.findMany({
      where: { organizationId },
      orderBy: { plate: "asc" },
      select: {
        id: true,
        plate: true,
        brand: true,
        model: true,
        status: true,
        complianceBlocked: true,
        odometerKm: true,
        maintenanceEveryKm: true,
      },
    });
  }

  createWorkOrder(organizationId: string, dto: CreateWorkOrderDto) {
    return this.workOrders.create(organizationId, dto);
  }

  closeWorkOrder(
    organizationId: string,
    id: string,
    dto?: CloseWorkOrderDto,
  ) {
    return this.workOrders.close(organizationId, id, dto);
  }

  listWorkOrders(organizationId: string) {
    return this.workOrders.list(organizationId);
  }
}
