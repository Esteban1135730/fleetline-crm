import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { WorkOrderStatus } from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";
import type { FindingDto, TimeTrackingDto } from "./dto/taller-v4.dto";

/**
 * Módulo 20 — Mecánico / FSG Tech App (Pedro).
 */
@Injectable()
export class MechanicService {
  constructor(private prisma: PrismaService) {}

  async myOrders(organizationId: string, mechanicId: string) {
    return this.prisma.workOrder.findMany({
      where: {
        organizationId,
        assignedToId: mechanicId,
        status: {
          in: [
            WorkOrderStatus.OPEN,
            WorkOrderStatus.IN_PROGRESS,
            WorkOrderStatus.WAITING_PARTS,
          ],
        },
      },
      include: {
        vehicle: {
          select: { id: true, plate: true, status: true, odometerKm: true },
        },
        timeEntries: {
          where: { mechanicId, active: true },
          take: 1,
        },
        findings: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
      orderBy: { openedAt: "desc" },
    });
  }

  async timeTracking(
    organizationId: string,
    mechanicId: string,
    dto: TimeTrackingDto,
  ) {
    const wo = await this.prisma.workOrder.findFirst({
      where: { id: dto.workOrderId, organizationId },
    });
    if (!wo) throw new NotFoundException("OT no encontrada");
    if (wo.assignedToId && wo.assignedToId !== mechanicId) {
      throw new ForbiddenException("OT no asignada a este mecánico");
    }

    if (dto.action === "START") {
      await this.prisma.mechanicTimeEntry.updateMany({
        where: { organizationId, mechanicId, active: true },
        data: { active: false, endedAt: new Date() },
      });

      const entry = await this.prisma.mechanicTimeEntry.create({
        data: {
          organizationId,
          workOrderId: wo.id,
          mechanicId,
          taskLabel: dto.taskLabel,
          active: true,
        },
      });

      if (wo.status === WorkOrderStatus.OPEN) {
        await this.prisma.workOrder.update({
          where: { id: wo.id },
          data: { status: WorkOrderStatus.IN_PROGRESS },
        });
      }

      return {
        entryId: entry.id,
        action: "START",
        startedAt: entry.startedAt.toISOString(),
        message: "Cronómetro iniciado",
      };
    }

    const active = dto.entryId
      ? await this.prisma.mechanicTimeEntry.findFirst({
          where: {
            id: dto.entryId,
            organizationId,
            mechanicId,
            active: true,
          },
        })
      : await this.prisma.mechanicTimeEntry.findFirst({
          where: {
            organizationId,
            mechanicId,
            workOrderId: wo.id,
            active: true,
          },
          orderBy: { startedAt: "desc" },
        });

    if (!active) {
      throw new BadRequestException("No hay cronómetro activo en esta OT");
    }

    const endedAt = new Date();
    const durationSec = Math.max(
      1,
      Math.round((endedAt.getTime() - active.startedAt.getTime()) / 1000),
    );
    const updated = await this.prisma.mechanicTimeEntry.update({
      where: { id: active.id },
      data: { active: false, endedAt, durationSec },
    });

    return {
      entryId: updated.id,
      action: "STOP",
      durationSec,
      endedAt: endedAt.toISOString(),
      message: `Tiempo registrado: ${durationSec}s`,
    };
  }

  async reportFinding(
    organizationId: string,
    mechanicId: string,
    dto: FindingDto,
  ) {
    const wo = await this.prisma.workOrder.findFirst({
      where: { id: dto.workOrderId, organizationId },
    });
    if (!wo) throw new NotFoundException("OT no encontrada");
    if (wo.assignedToId && wo.assignedToId !== mechanicId) {
      throw new ForbiddenException("OT no asignada a este mecánico");
    }
    if (!dto.photoRef && !dto.voiceRef && !dto.transcript && !dto.notes) {
      throw new BadRequestException("Indique foto, voz, transcript o notas");
    }

    /** Mock IA voz→texto si hay voiceRef sin transcript */
    const transcript =
      dto.transcript ||
      (dto.voiceRef
        ? `[IA] Hallazgo detectado en audio ${dto.voiceRef.split("/").pop()}`
        : undefined);

    const finding = await this.prisma.mechanicFinding.create({
      data: {
        organizationId,
        workOrderId: wo.id,
        mechanicId,
        photoRef: dto.photoRef,
        voiceRef: dto.voiceRef,
        transcript,
        notes: dto.notes,
        status: "PENDING",
      },
    });

    return {
      id: finding.id,
      status: finding.status,
      transcript: finding.transcript,
      message: "Hallazgo enviado a Coordinador para aprobación",
    };
  }
}
