import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InventoryItemStatus, VehicleStatus, WorkOrderStatus } from "@fsg/db";
import { HARD_RULES } from "@fsg/shared";
import { PrismaService } from "../prisma/prisma.service";
import { KafkaEventsService } from "../logistics/kafka-events.service";
import type { CloseWorkOrderDto, CreateWorkOrderDto } from "./dto/taller.dto";
import type { CrearOrdenDto, LiberarQcDto } from "./dto/taller-v4.dto";

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
        timeEntries: {
          where: { active: true },
          take: 1,
        },
        findings: {
          where: { status: "PENDING" },
          take: 5,
        },
      },
      orderBy: { openedAt: "desc" },
    });
  }

  isCritical(dto: CreateWorkOrderDto | CrearOrdenDto): boolean {
    if ("critical" in dto && dto.critical === true) return true;
    if (dto.severity === "CRITICAL") return true;
    const d = (dto.description || "").toUpperCase();
    return (
      d.includes("[CRITICAL]") ||
      d.includes("CORRECTIVA GRAVE") ||
      d.includes("MOTOR FUNDIDO") ||
      d.includes("FRENOS FALLA")
    );
  }

  async create(organizationId: string, dto: CreateWorkOrderDto | CrearOrdenDto) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: dto.vehicleId, organizationId },
    });
    if (!vehicle) throw new NotFoundException("Vehículo no encontrado");

    const critical = this.isCritical(dto);
    const severity = dto.severity || (critical ? "CRITICAL" : "ROUTINE");
    const count = await this.prisma.workOrder.count({
      where: { organizationId },
    });

    const interval =
      vehicle.maintenanceEveryKm || HARD_RULES.MAINTENANCE_INTERVAL_KM;
    const nextDue = Math.ceil(vehicle.odometerKm / interval) * interval;
    const predictiveKmLeft = nextDue - vehicle.odometerKm;

    const bayCode =
      "bayCode" in dto && dto.bayCode
        ? dto.bayCode
        : `BAY-${String.fromCharCode(65 + (count % 4))}${(count % 3) + 1}`;

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
        bayCode,
        severity,
        qcStatus: "PENDING",
        predictiveKmLeft:
          severity === "PREVENTIVE" ||
          predictiveKmLeft <= HARD_RULES.TALLER_PREVENTIVE_ALERT_KM
            ? predictiveKmLeft
            : undefined,
      },
      include: { vehicle: true },
    });

    let prekit: { id: string; sku: string; quantity: number } | null = null;
    const prekitSku = "prekitSku" in dto ? dto.prekitSku : undefined;
    const prekitQty =
      "prekitQty" in dto && dto.prekitQty ? dto.prekitQty : 1;
    if (prekitSku) {
      const item = await this.prisma.inventoryItem.findFirst({
        where: { organizationId, sku: prekitSku },
      });
      if (item) {
        const reserved = await this.prisma.prekitReservation.create({
          data: {
            organizationId,
            workOrderId: wo.id,
            vehicleId: vehicle.id,
            plate: vehicle.plate,
            inventoryItemId: item.id,
            quantity: prekitQty,
            status: "RESERVED",
            predictiveKmLeft: wo.predictiveKmLeft,
            logisticsWindow: {
              coordinateWith: "LOGISTICA",
              alertKm: HARD_RULES.TALLER_PREVENTIVE_ALERT_KM,
            },
          },
        });
        if (item.status === InventoryItemStatus.AVAILABLE) {
          await this.prisma.inventoryItem.update({
            where: { id: item.id },
            data: { status: InventoryItemStatus.RESERVED },
          });
        }
        prekit = { id: reserved.id, sku: item.sku, quantity: prekitQty };
      }
    }

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
      logisticsStatus: "ROJO",
      prekit,
      predictiveAlert:
        wo.predictiveKmLeft != null &&
        wo.predictiveKmLeft <= HARD_RULES.TALLER_PREVENTIVE_ALERT_KM
          ? {
              kmLeft: wo.predictiveKmLeft,
              message: `Alerta predictiva — ${wo.predictiveKmLeft} km al preventivo`,
            }
          : null,
    };
  }

  async close(
    organizationId: string,
    workOrderId: string,
    _dto?: CloseWorkOrderDto,
  ) {
    return this.liberarQc(organizationId, workOrderId, {
      workOrderId,
      pass: true,
      notes: _dto?.notes,
    });
  }

  /**
   * QC Coordinador — cierra OT y libera vehículo en Logística (Rojo → Verde).
   */
  async liberarQc(
    organizationId: string,
    workOrderId: string,
    dto: LiberarQcDto,
    qcById?: string,
  ) {
    const wo = await this.prisma.workOrder.findFirst({
      where: { id: workOrderId, organizationId },
      include: { vehicle: true },
    });
    if (!wo) throw new NotFoundException("OT no encontrada");
    if (wo.status === WorkOrderStatus.DONE) {
      throw new BadRequestException("La OT ya está cerrada");
    }

    if (dto.pass === false) {
      const failed = await this.prisma.workOrder.update({
        where: { id: wo.id },
        data: {
          qcStatus: "FAILED",
          qcApprovedAt: new Date(),
          qcApprovedById: qcById,
          meta: { qcNotes: dto.notes },
        },
        include: { vehicle: true },
      });
      return {
        ...failed,
        vehicleReleased: false,
        logisticsStatus: "ROJO" as const,
        message: "QC fallido — vehículo permanece en mantenimiento",
      };
    }

    const updated = await this.prisma.workOrder.update({
      where: { id: wo.id },
      data: {
        status: WorkOrderStatus.DONE,
        closedAt: new Date(),
        qcStatus: "PASSED",
        qcApprovedAt: new Date(),
        qcApprovedById: qcById,
        meta: { qcNotes: dto.notes },
      },
      include: { vehicle: true },
    });

    await this.prisma.prekitReservation.updateMany({
      where: { workOrderId: wo.id, status: "RESERVED" },
      data: { status: "CONSUMED" },
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
    let vehicleReleased = false;

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
      vehicleReleased = true;

      await this.kafka.emit("taller.vehiculo.reparado", {
        vehicleId: wo.vehicleId,
        organizationId,
        workOrderId: wo.id,
        plate: wo.vehicle.plate,
        logisticsStatus: "VERDE",
      });
    }

    return {
      ...updated,
      vehicleReleased,
      remainingOpenOrders: otherOpen,
      logisticsStatus: (vehicleReleased ? "VERDE" : "ROJO") as "VERDE" | "ROJO",
      message: vehicleReleased
        ? "Alta médica — vehículo liberado en Logística (Verde)"
        : "OT cerrada — otras OT abiertas mantienen bloqueo",
    };
  }

  async coordinadorDashboard(organizationId: string) {
    const orders = await this.list(organizationId);
    const kanban = {
      OPEN: orders.filter((o) => o.status === WorkOrderStatus.OPEN),
      IN_PROGRESS: orders.filter(
        (o) => o.status === WorkOrderStatus.IN_PROGRESS,
      ),
      WAITING_PARTS: orders.filter(
        (o) => o.status === WorkOrderStatus.WAITING_PARTS,
      ),
      DONE: orders
        .filter((o) => o.status === WorkOrderStatus.DONE)
        .slice(0, 10),
    };

    const bays = orders
      .filter((o) => o.status !== WorkOrderStatus.DONE)
      .map((o) => ({
        bayCode: o.bayCode || "SIN-BAHIA",
        workOrderId: o.id,
        code: o.code,
        plate: o.vehicle.plate,
        mechanic: o.assignedTo?.name ?? null,
        timerActive: (o.timeEntries?.length ?? 0) > 0,
        startedAt: o.timeEntries?.[0]?.startedAt
          ? new Date(o.timeEntries[0].startedAt).toISOString()
          : null,
        status: o.status,
      }));

    const vehicles = await this.prisma.vehicle.findMany({
      where: { organizationId },
      select: {
        id: true,
        plate: true,
        odometerKm: true,
        maintenanceEveryKm: true,
        status: true,
      },
    });

    const predictive = vehicles
      .map((v) => {
        const interval =
          v.maintenanceEveryKm || HARD_RULES.MAINTENANCE_INTERVAL_KM;
        const nextDue =
          Math.ceil(v.odometerKm / interval) * interval || interval;
        const kmLeft = nextDue - v.odometerKm;
        return { ...v, kmLeft, nextDue };
      })
      .filter((v) => v.kmLeft <= HARD_RULES.TALLER_PREVENTIVE_ALERT_KM)
      .sort((a, b) => a.kmLeft - b.kmLeft);

    return {
      hub: "Taller 4.0",
      role: "COORDINADOR_TALLER",
      kanban,
      bays,
      predictiveAlerts: predictive,
      pendingFindings: orders.flatMap((o) =>
        (o.findings || []).map((f) => ({
          id: f.id,
          transcript: f.transcript,
          photoRef: f.photoRef,
          status: f.status,
          workOrderCode: o.code,
          plate: o.vehicle.plate,
        })),
      ),
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
