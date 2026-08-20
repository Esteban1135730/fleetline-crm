import { Injectable, NotFoundException, ConflictException } from "@nestjs/common";
import { VehicleStatus, WorkOrderStatus } from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class FleetService {
  constructor(private prisma: PrismaService) {}

  listVehicles(organizationId: string) {
    return this.prisma.vehicle.findMany({
      where: { organizationId },
      include: {
        workOrders: { where: { status: { not: WorkOrderStatus.DONE } } },
      },
      orderBy: { plate: "asc" },
    });
  }

  createVehicle(
    organizationId: string,
    data: {
      plate: string;
      brand: string;
      model: string;
      year: number;
      capacity?: number;
      lat?: number;
      lng?: number;
    },
  ) {
    return this.prisma.vehicle.create({
      data: {
        organizationId,
        plate: data.plate.toUpperCase(),
        brand: data.brand,
        model: data.model,
        year: data.year,
        capacity: data.capacity ?? 20,
        lat: data.lat,
        lng: data.lng,
        status: VehicleStatus.AVAILABLE,
      },
    });
  }

  async updateVehicle(
    organizationId: string,
    id: string,
    data: {
      plate?: string;
      brand?: string;
      model?: string;
      year?: number;
      capacity?: number;
      status?: string;
      lat?: number;
      lng?: number;
    },
  ) {
    const v = await this.prisma.vehicle.findFirst({
      where: { id, organizationId },
    });
    if (!v) throw new NotFoundException("Vehículo no encontrado");

    const plate = data.plate?.trim().toUpperCase();
    if (plate && plate !== v.plate) {
      const dup = await this.prisma.vehicle.findFirst({
        where: { organizationId, plate, NOT: { id } },
      });
      if (dup) {
        throw new ConflictException(`Ya existe una unidad con placa ${plate}`);
      }
    }

    return this.prisma.vehicle.update({
      where: { id },
      data: {
        plate: plate || undefined,
        brand: data.brand,
        model: data.model,
        year: data.year,
        capacity: data.capacity,
        lat: data.lat,
        lng: data.lng,
        status: data.status
          ? (data.status.toUpperCase() as VehicleStatus)
          : undefined,
      },
    });
  }

  async deleteVehicle(organizationId: string, id: string) {
    const v = await this.prisma.vehicle.findFirst({
      where: { id, organizationId },
      include: { _count: { select: { trips: true } } },
    });
    if (!v) throw new NotFoundException("Vehículo no encontrado");
    if (v._count.trips > 0) {
      throw new ConflictException(
        "No se puede eliminar: la unidad tiene viajes. Corrige la placa con Editar.",
      );
    }
    await this.prisma.vehicle.delete({ where: { id } });
    return { ok: true, id };
  }

  listWorkOrders(organizationId: string) {
    return this.prisma.workOrder.findMany({
      where: { vehicle: { organizationId } },
      include: {
        vehicle: true,
        assignedTo: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async createWorkOrder(
    organizationId: string,
    data: { vehicleId: string; description: string; cost?: number },
  ) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: data.vehicleId, organizationId },
    });
    if (!vehicle) throw new NotFoundException("Vehículo no encontrado");

    const count = await this.prisma.workOrder.count({
      where: { vehicle: { organizationId } },
    });

    await this.prisma.vehicle.update({
      where: { id: vehicle.id },
      data: { status: VehicleStatus.MAINTENANCE },
    });

    return this.prisma.workOrder.create({
      data: {
        code: `OT-${500 + count + 1}`,
        description: data.description,
        vehicleId: data.vehicleId,
        organizationId,
        cost: data.cost,
        status: WorkOrderStatus.OPEN,
      },
      include: { vehicle: true },
    });
  }

  async updateWorkOrder(
    organizationId: string,
    id: string,
    data: { status?: string; description?: string; cost?: number },
  ) {
    const wo = await this.prisma.workOrder.findFirst({
      where: { id, vehicle: { organizationId } },
    });
    if (!wo) throw new NotFoundException("OT no encontrada");

    const mapped = data.status
      ? (data.status.toUpperCase() as WorkOrderStatus)
      : undefined;

    const updated = await this.prisma.workOrder.update({
      where: { id },
      data: {
        status: mapped,
        description: data.description,
        cost: data.cost,
        closedAt: mapped === WorkOrderStatus.DONE ? new Date() : wo.closedAt,
      },
      include: { vehicle: true },
    });

    if (mapped === WorkOrderStatus.DONE) {
      await this.prisma.vehicle.update({
        where: { id: wo.vehicleId },
        data: { status: VehicleStatus.AVAILABLE },
      });
    } else if (
      mapped === WorkOrderStatus.IN_PROGRESS ||
      mapped === WorkOrderStatus.WAITING_PARTS
    ) {
      await this.prisma.vehicle.update({
        where: { id: wo.vehicleId },
        data: { status: VehicleStatus.MAINTENANCE },
      });
    }

    return updated;
  }
}
