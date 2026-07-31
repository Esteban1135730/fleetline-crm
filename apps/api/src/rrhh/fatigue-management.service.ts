import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { ShiftStatus } from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";
import { KafkaEventsService } from "../logistics/kafka-events.service";
import {
  evaluateFatigue,
  hoursBetween,
  type FatigueEvaluation,
} from "./fatigue.types";
import type { ShiftCheckInDto, ShiftCheckOutDto } from "./dto/rrhh.dto";

/**
 * Control de fatiga de conductores — bloquea despacho vía Driver.dispatchBlocked.
 * (SSOT: equivalente operativo a complianceBlocked del conductor).
 */
@Injectable()
export class FatigueManagementService {
  constructor(
    private prisma: PrismaService,
    private kafka: KafkaEventsService,
  ) {}

  async checkIn(organizationId: string, dto: ShiftCheckInDto) {
    const driver = await this.requireDriver(organizationId, dto.driverId);

    const open = await this.prisma.driverShift.findFirst({
      where: {
        organizationId,
        driverId: driver.id,
        status: ShiftStatus.OPEN,
      },
    });
    if (open) {
      throw new BadRequestException({
        error: "SHIFT_ALREADY_OPEN",
        message: "El conductor ya tiene un turno OPEN — haga check-out primero",
        shiftId: open.id,
      });
    }

    const checkInAt = dto.checkInAt ? new Date(dto.checkInAt) : new Date();
    const shift = await this.prisma.driverShift.create({
      data: {
        organizationId,
        driverId: driver.id,
        checkInAt,
        status: ShiftStatus.OPEN,
        notes: dto.notes,
      },
    });

    return { shift, driverId: driver.id };
  }

  async checkOut(organizationId: string, dto: ShiftCheckOutDto) {
    const driver = await this.requireDriver(organizationId, dto.driverId);
    const checkOutAt = dto.checkOutAt ? new Date(dto.checkOutAt) : new Date();

    const shift = await this.prisma.driverShift.findFirst({
      where: {
        organizationId,
        driverId: driver.id,
        status: ShiftStatus.OPEN,
        ...(dto.shiftId ? { id: dto.shiftId } : {}),
      },
      orderBy: { checkInAt: "desc" },
    });
    if (!shift) {
      throw new NotFoundException("No hay turno OPEN para este conductor");
    }
    if (checkOutAt.getTime() < shift.checkInAt.getTime()) {
      throw new BadRequestException("checkOutAt anterior a checkInAt");
    }

    const continuousHours = hoursBetween(shift.checkInAt, checkOutAt);
    const dailyHours = await this.sumDailyHours(
      organizationId,
      driver.id,
      checkOutAt,
      continuousHours,
    );
    const fatigue = evaluateFatigue({ continuousHours, dailyHours });

    const closed = await this.prisma.driverShift.update({
      where: { id: shift.id },
      data: {
        checkOutAt,
        continuousHours,
        status: ShiftStatus.CLOSED,
        notes: dto.notes ?? shift.notes,
        meta: {
          fatigue,
        },
      },
    });

    const blocked = await this.applyFatigueBlock(
      organizationId,
      driver.id,
      fatigue,
    );

    return {
      shift: closed,
      fatigue,
      dispatchBlocked: blocked.dispatchBlocked,
      blockReason: blocked.blockReason,
    };
  }

  async fatigueStatus(
    organizationId: string,
    driverId: string,
  ): Promise<{
    driverId: string;
    name: string;
    dispatchBlocked: boolean;
    blockReason: string | null;
    fatigueScore: number;
    openShift: { id: string; checkInAt: Date; continuousHoursSoFar: number } | null;
    evaluation: FatigueEvaluation;
  }> {
    const driver = await this.requireDriver(organizationId, driverId);
    const now = new Date();

    const openShift = await this.prisma.driverShift.findFirst({
      where: { organizationId, driverId, status: ShiftStatus.OPEN },
      orderBy: { checkInAt: "desc" },
    });

    const continuousSoFar = openShift
      ? hoursBetween(openShift.checkInAt, now)
      : 0;
    const dailyHours = await this.sumDailyHours(
      organizationId,
      driverId,
      now,
      continuousSoFar,
    );

    const evaluation = evaluateFatigue({
      continuousHours: continuousSoFar,
      dailyHours,
    });

    // Re-evalúa bloqueo en vivo si el turno abierto ya excedió
    if (evaluation.fatigueExceeded && !driver.dispatchBlocked) {
      await this.applyFatigueBlock(organizationId, driverId, evaluation);
      driver.dispatchBlocked = true;
      driver.blockReason = "DRIVER_FATIGUE";
      driver.fatigueScore = evaluation.fatigueScore;
    }

    return {
      driverId: driver.id,
      name: driver.name,
      dispatchBlocked: driver.dispatchBlocked,
      blockReason: driver.blockReason,
      fatigueScore: Math.max(driver.fatigueScore, evaluation.fatigueScore),
      openShift: openShift
        ? {
            id: openShift.id,
            checkInAt: openShift.checkInAt,
            continuousHoursSoFar: continuousSoFar,
          }
        : null,
      evaluation,
    };
  }

  /**
   * Setea dispatchBlocked + fatigueScore cuando se supera umbral legal.
   */
  async applyFatigueBlock(
    organizationId: string,
    driverId: string,
    fatigue: FatigueEvaluation,
  ) {
    if (!fatigue.fatigueExceeded) {
      return this.prisma.driver.update({
        where: { id: driverId },
        data: { fatigueScore: fatigue.fatigueScore },
      });
    }

    const updated = await this.prisma.driver.update({
      where: { id: driverId },
      data: {
        dispatchBlocked: true,
        blockReason: "DRIVER_FATIGUE",
        fatigueScore: fatigue.fatigueScore,
      },
    });

    await this.kafka.emit("driver.fatigue.blocked", {
      organizationId,
      driverId,
      reason: "DRIVER_FATIGUE",
      continuousHours: fatigue.continuousHours,
      dailyHours: fatigue.dailyHours,
    });

    return updated;
  }

  private async sumDailyHours(
    organizationId: string,
    driverId: string,
    anchor: Date,
    currentSegmentHours: number,
  ): Promise<number> {
    const windowStart = new Date(anchor.getTime() - 24 * 60 * 60 * 1000);
    const closed = await this.prisma.driverShift.findMany({
      where: {
        organizationId,
        driverId,
        status: ShiftStatus.CLOSED,
        checkOutAt: { gte: windowStart, lte: anchor },
      },
      select: { continuousHours: true, checkInAt: true, checkOutAt: true },
    });

    const closedSum = closed.reduce((s, sh) => {
      if (sh.continuousHours != null) return s + sh.continuousHours;
      if (sh.checkOutAt) return s + hoursBetween(sh.checkInAt, sh.checkOutAt);
      return s;
    }, 0);

    return closedSum + currentSegmentHours;
  }

  private async requireDriver(organizationId: string, driverId: string) {
    const driver = await this.prisma.driver.findFirst({
      where: { id: driverId, organizationId },
    });
    if (!driver) throw new NotFoundException("Conductor no encontrado");
    return driver;
  }
}
