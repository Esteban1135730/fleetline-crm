import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { FleetModule, YardInspectionPhase } from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";
import { WorkOrderService } from "../taller/work-order.service";
import type { YardInspectionDto } from "./dto/patio.dto";

/**
 * Inventario físico de patio — daños / combustible / llantas.
 * Falla crítica → OT en Taller + unidad en MAINTENANCE.
 */
@Injectable()
export class PhysicalInspectionService {
  constructor(
    private prisma: PrismaService,
    private workOrders: WorkOrderService,
  ) {}

  async createInspection(
    organizationId: string,
    dto: YardInspectionDto,
    actorUserId?: string,
  ) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: dto.vehicleId, organizationId },
    });
    if (!vehicle) throw new NotFoundException("Vehículo no encontrado");

    if (dto.parkingLogId) {
      const pl = await this.prisma.parkingLog.findFirst({
        where: { id: dto.parkingLogId, organizationId },
      });
      if (!pl) throw new NotFoundException("ParkingLog no encontrado");
    }

    const critical =
      dto.criticalSafetyFault === true ||
      this.detectCriticalFromNotes(dto.criticalFaultDetail) ||
      this.detectCriticalFromNotes(dto.visualDamageNotes);

    if (critical && !dto.criticalFaultDetail && !dto.visualDamageNotes) {
      throw new BadRequestException(
        "Falla crítica requiere criticalFaultDetail o visualDamageNotes",
      );
    }

    const phase = (dto.phase || "CHECK_IN") as YardInspectionPhase;

    let workOrderId: string | undefined;
    let workOrder: Awaited<ReturnType<WorkOrderService["create"]>> | null =
      null;

    if (critical) {
      const detail =
        dto.criticalFaultDetail ||
        dto.visualDamageNotes ||
        "Falla crítica detectada en inspección de patio";
      workOrder = await this.workOrders.create(organizationId, {
        vehicleId: vehicle.id,
        description: `[CRITICAL] Inspección patio — ${detail}`,
        critical: true,
        severity: "CRITICAL",
        odometerAtOpen: vehicle.odometerKm,
      });
      workOrderId = workOrder.id;

      await this.prisma.yardEvent.create({
        data: {
          organizationId,
          vehicleId: vehicle.id,
          kind: "DAMAGE_CV",
          payload: {
            workOrderId,
            code: workOrder.code,
            detail,
            phase,
          },
        },
      });
    }

    const inspection = await this.prisma.yardInspection.create({
      data: {
        organizationId,
        vehicleId: vehicle.id,
        parkingLogId: dto.parkingLogId,
        phase,
        fuelLevelPct: dto.fuelLevelPct,
        tireCondition: dto.tireCondition,
        visualDamageNotes: dto.visualDamageNotes,
        criticalSafetyFault: critical,
        criticalFaultDetail: dto.criticalFaultDetail,
        photoRefs: dto.photoRefs || [],
        inspectorName: dto.inspectorName,
        workOrderId,
        meta: { actorUserId },
      },
      include: {
        vehicle: {
          select: {
            id: true,
            plate: true,
            status: true,
            complianceBlocked: true,
          },
        },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId,
        action: critical
          ? "YARD_INSPECTION_CRITICAL"
          : "YARD_INSPECTION_RECORDED",
        entity: "YardInspection",
        entityId: inspection.id,
        module: FleetModule.PARQUEADERO,
        userId: actorUserId,
        meta: {
          vehicleId: vehicle.id,
          critical,
          workOrderId,
          phase,
        },
      },
    });

    return {
      inspection,
      workOrder,
      vehicleBlocked: critical,
      maintenanceStatus: critical ? "IN_MAINTENANCE" : null,
    };
  }

  detectCriticalFromNotes(notes?: string | null): boolean {
    if (!notes) return false;
    const n = notes.toUpperCase();
    return (
      n.includes("CRITICAL") ||
      n.includes("FRENO") ||
      n.includes("FRENOS") ||
      n.includes("DIRECCION") ||
      n.includes("DIRECCIÓN") ||
      n.includes("LLANTA REVENTADA") ||
      n.includes("FUGAS ACEITE") ||
      n.includes("NO APTO")
    );
  }
}
