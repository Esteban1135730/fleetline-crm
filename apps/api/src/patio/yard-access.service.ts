import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  FleetModule,
  VehicleStatus,
  YardAccessKind,
} from "@fsg/db";
import { HARD_RULES } from "@fsg/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { YardAccessLogDto } from "./dto/patio.dto";

export const GATE_CHECKOUT_DENIED = "GATE_CHECKOUT_DENIED_COMPLIANCE_BLOCK";

/**
 * Smart Gate / Talanquera — CHECK_IN / CHECK_OUT con kill-switch compliance.
 */
@Injectable()
export class YardAccessService {
  constructor(private prisma: PrismaService) {}

  async recordAccess(
    organizationId: string,
    dto: YardAccessLogDto,
    actorUserId?: string,
  ) {
    const vehicle = await this.resolveVehicle(organizationId, dto);
    const plate = (dto.plate || vehicle.plate).toUpperCase().trim();
    const kind =
      dto.kind === "CHECK_OUT"
        ? YardAccessKind.CHECK_OUT
        : YardAccessKind.CHECK_IN;

    let driver: {
      id: string;
      name: string;
      dispatchBlocked: boolean;
      blockReason: string | null;
      fatigueScore: number;
      active: boolean;
    } | null = null;
    if (dto.driverId) {
      driver = await this.loadDriver(organizationId, dto.driverId);
    }

    if (kind === YardAccessKind.CHECK_OUT) {
      const denial = this.evaluateCheckoutDenial(vehicle, driver);
      if (denial) {
        const deniedLog = await this.prisma.yardAccessLog.create({
          data: {
            organizationId,
            kind,
            plate,
            vehicleId: vehicle.id,
            driverId: driver?.id,
            odometerKm: dto.odometerKm,
            gateId: dto.gateId,
            cameraRef: dto.cameraRef,
            lprConfidence: dto.lprConfidence,
            gateOpened: false,
            denied: true,
            denyReason: denial.reason,
            meta: { blocks: denial.blocks, actorUserId },
          },
        });

        await this.prisma.yardEvent.create({
          data: {
            organizationId,
            vehicleId: vehicle.id,
            kind: "GATE_DENY",
            payload: {
              accessLogId: deniedLog.id,
              reason: denial.reason,
              blocks: denial.blocks,
            },
          },
        });

        await this.prisma.auditLog.create({
          data: {
            organizationId,
            action: GATE_CHECKOUT_DENIED,
            entity: "YardAccessLog",
            entityId: deniedLog.id,
            module: FleetModule.PARQUEADERO,
            userId: actorUserId,
            meta: { plate, vehicleId: vehicle.id, blocks: denial.blocks },
          },
        });

        throw new UnprocessableEntityException({
          statusCode: 422,
          error: GATE_CHECKOUT_DENIED,
          message:
            "Talanquera cerrada — unidad con Hard-Stop de compliance / fatiga / taller",
          blocks: denial.blocks,
          accessLogId: deniedLog.id,
          vehicleId: vehicle.id,
          plate,
        });
      }
    }

    if (kind === YardAccessKind.CHECK_IN) {
      return this.checkIn(organizationId, {
        vehicle,
        plate,
        driver,
        dto,
        actorUserId,
      });
    }

    return this.checkOut(organizationId, {
      vehicle,
      plate,
      driver,
      dto,
      actorUserId,
    });
  }

  async currentInventory(organizationId: string) {
    const open = await this.prisma.parkingLog.findMany({
      where: { organizationId, checkedOutAt: null },
      include: {
        vehicle: {
          select: {
            id: true,
            plate: true,
            brand: true,
            model: true,
            status: true,
            complianceBlocked: true,
            complianceReason: true,
            odometerKm: true,
          },
        },
        driver: {
          select: {
            id: true,
            name: true,
            dispatchBlocked: true,
            blockReason: true,
            fatigueScore: true,
          },
        },
      },
      orderBy: { checkedInAt: "desc" },
    });

    return {
      count: open.length,
      inYard: open.map((p) => ({
        parkingLogId: p.id,
        plate: p.plate,
        checkedInAt: p.checkedInAt,
        odometerInKm: p.odometerInKm,
        guardName: p.guardName,
        vehicle: p.vehicle,
        driver: p.driver,
      })),
    };
  }

  /**
   * Evalúa bloqueos de salida (compliance vehículo, mantenimiento, fatiga conductor).
   */
  evaluateCheckoutDenial(
    vehicle: {
      id: string;
      complianceBlocked: boolean;
      complianceReason: string | null;
      status: VehicleStatus;
    },
    driver: {
      id: string;
      dispatchBlocked: boolean;
      blockReason: string | null;
      fatigueScore: number;
      active: boolean;
    } | null,
  ): { reason: string; blocks: string[] } | null {
    const blocks: string[] = [];

    if (vehicle.complianceBlocked) {
      blocks.push(
        vehicle.complianceReason || "VEHICLE_COMPLIANCE_BLOCKED",
      );
    }
    if (
      vehicle.status === VehicleStatus.MAINTENANCE ||
      vehicle.status === VehicleStatus.COMPLIANCE_BLOCKED ||
      vehicle.status === VehicleStatus.OUT_OF_SERVICE
    ) {
      blocks.push(`VEHICLE_STATUS_${vehicle.status}`);
    }
    if (driver) {
      if (!driver.active) blocks.push("DRIVER_INACTIVE");
      if (driver.dispatchBlocked) {
        blocks.push(driver.blockReason || "DRIVER_DISPATCH_BLOCKED");
      }
      if (driver.fatigueScore >= HARD_RULES.FATIGUE_BLOCK_SCORE) {
        blocks.push("DRIVER_FATIGUE");
      }
    }

    if (!blocks.length) return null;
    return {
      reason: GATE_CHECKOUT_DENIED,
      blocks,
    };
  }

  private async checkIn(
    organizationId: string,
    ctx: {
      vehicle: { id: string; plate: string; odometerKm: number };
      plate: string;
      driver: { id: string; name: string } | null;
      dto: YardAccessLogDto;
      actorUserId?: string;
    },
  ) {
    const existing = await this.prisma.parkingLog.findFirst({
      where: {
        organizationId,
        vehicleId: ctx.vehicle.id,
        checkedOutAt: null,
      },
    });
    if (existing) {
      throw new BadRequestException({
        error: "ALREADY_IN_YARD",
        message: "La unidad ya figura en patio — cierre el CHECK_IN previo",
        parkingLogId: existing.id,
      });
    }

    const odometerKm = ctx.dto.odometerKm ?? ctx.vehicle.odometerKm;
    const parking = await this.prisma.parkingLog.create({
      data: {
        organizationId,
        vehicleId: ctx.vehicle.id,
        plate: ctx.plate,
        driverId: ctx.driver?.id,
        driverName: ctx.dto.driverName || ctx.driver?.name,
        guardName: ctx.dto.guardName,
        odometerInKm: odometerKm,
        checkedInAt: new Date(),
      },
    });

    if (ctx.dto.odometerKm != null) {
      await this.prisma.vehicle.update({
        where: { id: ctx.vehicle.id },
        data: { odometerKm: ctx.dto.odometerKm },
      });
    }

    const access = await this.prisma.yardAccessLog.create({
      data: {
        organizationId,
        kind: YardAccessKind.CHECK_IN,
        plate: ctx.plate,
        vehicleId: ctx.vehicle.id,
        driverId: ctx.driver?.id,
        parkingLogId: parking.id,
        odometerKm,
        gateId: ctx.dto.gateId,
        cameraRef: ctx.dto.cameraRef,
        lprConfidence: ctx.dto.lprConfidence,
        gateOpened: true,
        denied: false,
        meta: { actorUserId: ctx.actorUserId },
      },
    });

    await this.prisma.yardEvent.create({
      data: {
        organizationId,
        vehicleId: ctx.vehicle.id,
        kind: "ENTRY",
        payload: { accessLogId: access.id, parkingLogId: parking.id, odometerKm },
      },
    });

    return {
      gateOpened: true,
      access,
      parking,
      odometerDelta: null as number | null,
    };
  }

  private async checkOut(
    organizationId: string,
    ctx: {
      vehicle: { id: string; plate: string; odometerKm: number };
      plate: string;
      driver: { id: string; name: string } | null;
      dto: YardAccessLogDto;
      actorUserId?: string;
    },
  ) {
    const parking = await this.prisma.parkingLog.findFirst({
      where: {
        organizationId,
        vehicleId: ctx.vehicle.id,
        checkedOutAt: null,
      },
      orderBy: { checkedInAt: "desc" },
    });
    if (!parking) {
      throw new NotFoundException({
        error: "NOT_IN_YARD",
        message: "No hay CHECK_IN abierto para esta unidad",
      });
    }

    const odometerKm = ctx.dto.odometerKm ?? ctx.vehicle.odometerKm;
    const odometerDelta =
      parking.odometerInKm != null
        ? odometerKm - parking.odometerInKm
        : null;

    const closed = await this.prisma.parkingLog.update({
      where: { id: parking.id },
      data: {
        checkedOutAt: new Date(),
        odometerOutKm: odometerKm,
        driverId: ctx.driver?.id ?? parking.driverId,
        driverName:
          ctx.dto.driverName || ctx.driver?.name || parking.driverName,
      },
    });

    if (ctx.dto.odometerKm != null) {
      await this.prisma.vehicle.update({
        where: { id: ctx.vehicle.id },
        data: { odometerKm: ctx.dto.odometerKm },
      });
    }

    const access = await this.prisma.yardAccessLog.create({
      data: {
        organizationId,
        kind: YardAccessKind.CHECK_OUT,
        plate: ctx.plate,
        vehicleId: ctx.vehicle.id,
        driverId: ctx.driver?.id,
        parkingLogId: closed.id,
        odometerKm,
        gateId: ctx.dto.gateId,
        cameraRef: ctx.dto.cameraRef,
        lprConfidence: ctx.dto.lprConfidence,
        gateOpened: true,
        denied: false,
        meta: {
          actorUserId: ctx.actorUserId,
          odometerDelta,
          odometerInKm: parking.odometerInKm,
        },
      },
    });

    await this.prisma.yardEvent.create({
      data: {
        organizationId,
        vehicleId: ctx.vehicle.id,
        kind: "EXIT",
        payload: {
          accessLogId: access.id,
          parkingLogId: closed.id,
          odometerKm,
          odometerDelta,
        },
      },
    });

    return {
      gateOpened: true,
      access,
      parking: closed,
      odometerDelta,
    };
  }

  private async resolveVehicle(
    organizationId: string,
    dto: YardAccessLogDto,
  ) {
    if (dto.vehicleId) {
      const v = await this.prisma.vehicle.findFirst({
        where: { id: dto.vehicleId, organizationId },
      });
      if (!v) throw new NotFoundException("Vehículo no encontrado");
      return v;
    }
    if (!dto.plate) {
      throw new BadRequestException("Indique vehicleId o plate (LPR)");
    }
    const plate = dto.plate.toUpperCase().trim();
    const v = await this.prisma.vehicle.findFirst({
      where: { organizationId, plate },
    });
    if (!v) {
      throw new NotFoundException({
        error: "PLATE_NOT_IN_FLEET",
        message: `Placa ${plate} no registrada en flota`,
      });
    }
    return v;
  }

  private async loadDriver(organizationId: string, driverId: string) {
    const d = await this.prisma.driver.findFirst({
      where: { id: driverId, organizationId },
    });
    if (!d) throw new NotFoundException("Conductor no encontrado");
    return d;
  }
}
