import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  TripAuditAction,
  TripDeviationAction,
  TripDeviationStatus,
  TripIncidentCategory,
  TripStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { LogisticsGateway } from "../logistics/logistics.gateway";
import { LogisticaOpsService } from "../logistica/logistica-ops.service";
import { evaluateTripControl } from "./geofence";

@Injectable()
export class MobileTripControlService {
  constructor(
    private prisma: PrismaService,
    private gateway: LogisticsGateway,
    private ops: LogisticaOpsService,
  ) {}

  private async appendAudit(
    organizationId: string,
    tripId: string,
    action: TripAuditAction,
    message: string,
    actorUserId?: string,
    meta?: object,
  ) {
    return this.prisma.tripAuditLog.create({
      data: {
        organizationId,
        tripId,
        action,
        message,
        actorUserId,
        meta: meta ?? undefined,
        serverTime: new Date(),
      },
    });
  }

  async serverClock() {
    const now = new Date();
    return {
      iso: now.toISOString(),
      epochMs: now.getTime(),
      timezone: "America/Bogota",
    };
  }

  async iniciar(
    organizationId: string,
    tripId: string,
    actor: { userId: string; role: string },
    gps: { lat: number; lng: number },
  ) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, organizationId },
      include: { preoperational: true },
    });
    if (!trip) throw new NotFoundException("Servicio no encontrado");
    if (trip.status === TripStatus.PENDING_SUPERVISOR_APPROVAL) {
      throw new UnprocessableEntityException(
        "Ya hay una desviación pendiente de aprobación del supervisor",
      );
    }
    if (
      trip.status !== TripStatus.ASSIGNED &&
      trip.status !== TripStatus.PENDING &&
      trip.status !== TripStatus.AWAITING_PREOP
    ) {
      throw new BadRequestException(
        `No se puede iniciar desde estado ${trip.status}`,
      );
    }

    const gate = evaluateTripControl({
      gps,
      target:
        trip.originLat != null && trip.originLng != null
          ? { lat: trip.originLat, lng: trip.originLng }
          : null,
      scheduledAt: trip.departAt,
    });

    if (gate.ok) {
      const updated = await this.ops.markStarted(
        organizationId,
        tripId,
        actor.userId,
      );
      return {
        status: "INICIADO" as const,
        tripStatus: updated.status,
        serverTime: gate.serverTime.toISOString(),
        trip: updated,
        gate,
      };
    }

    return this.openDeviation({
      organizationId,
      trip,
      action: TripDeviationAction.START,
      actorUserId: actor.userId,
      gps,
      gate,
    });
  }

  async finalizar(
    organizationId: string,
    tripId: string,
    actor: { userId: string; role: string },
    gps: { lat: number; lng: number },
  ) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, organizationId },
    });
    if (!trip) throw new NotFoundException("Servicio no encontrado");
    if (trip.status === TripStatus.PENDING_SUPERVISOR_APPROVAL) {
      throw new UnprocessableEntityException(
        "Ya hay una desviación pendiente de aprobación del supervisor",
      );
    }
    if (trip.status !== TripStatus.IN_TRANSIT) {
      throw new BadRequestException(
        `No se puede finalizar desde estado ${trip.status}`,
      );
    }

    const gate = evaluateTripControl({
      gps,
      target:
        trip.destLat != null && trip.destLng != null
          ? { lat: trip.destLat, lng: trip.destLng }
          : null,
      scheduledAt: trip.arriveAt ?? trip.departAt,
    });

    if (gate.ok) {
      const updated = await this.ops.markCompleted(
        organizationId,
        tripId,
        actor.userId,
      );
      return {
        status: "FINALIZADO" as const,
        tripStatus: updated.status,
        serverTime: gate.serverTime.toISOString(),
        trip: updated,
        gate,
      };
    }

    return this.openDeviation({
      organizationId,
      trip,
      action: TripDeviationAction.END,
      actorUserId: actor.userId,
      gps,
      gate,
    });
  }

  private async openDeviation(input: {
    organizationId: string;
    trip: { id: string; status: TripStatus; code: string };
    action: TripDeviationAction;
    actorUserId: string;
    gps: { lat: number; lng: number };
    gate: ReturnType<typeof evaluateTripControl>;
  }) {
    const reasonCodes = input.gate.violations.map((v) => v.code);
    const reasonDetail = input.gate.violations.map((v) => v.detail).join(" · ");

    const [deviation] = await this.prisma.$transaction([
      this.prisma.tripDeviationRequest.create({
        data: {
          organizationId: input.organizationId,
          tripId: input.trip.id,
          action: input.action,
          status: TripDeviationStatus.PENDING,
          previousStatus: input.trip.status,
          reasonCodes,
          reasonDetail,
          lat: input.gps.lat,
          lng: input.gps.lng,
          distanceM: input.gate.distanceM ?? undefined,
          serverTime: input.gate.serverTime,
          scheduledAt:
            input.action === TripDeviationAction.START ? undefined : undefined,
          requestedById: input.actorUserId,
        },
      }),
      this.prisma.trip.update({
        where: { id: input.trip.id },
        data: { status: TripStatus.PENDING_SUPERVISOR_APPROVAL },
      }),
    ]);

    await this.appendAudit(
      input.organizationId,
      input.trip.id,
      TripAuditAction.DEVIATION_REQUESTED,
      `Desviación ${input.action} — pendiente supervisor: ${reasonDetail}`,
      input.actorUserId,
      {
        deviationId: deviation.id,
        action: input.action,
        reasonCodes,
        gate: {
          distanceM: input.gate.distanceM,
          deltaMin: input.gate.deltaMin,
        },
      },
    );

    this.gateway.emitDeviationAlert(input.organizationId, {
      deviationId: deviation.id,
      tripId: input.trip.id,
      code: input.trip.code,
      action: input.action,
      reasonDetail,
      reasonCodes,
      lat: input.gps.lat,
      lng: input.gps.lng,
      serverTime: input.gate.serverTime.toISOString(),
    });
    this.gateway.emitUpdate(input.organizationId);

    return {
      status: "PENDIENTE_APROBACION_SUPERVISOR" as const,
      tripStatus: TripStatus.PENDING_SUPERVISOR_APPROVAL,
      serverTime: input.gate.serverTime.toISOString(),
      deviation,
      gate: input.gate,
    };
  }

  async aprobarDesviacion(
    organizationId: string,
    tripId: string,
    actor: { userId: string; role: string },
    input: { decision: "ACEPTAR" | "CANCELAR"; note?: string },
  ) {
    const role = actor.role.toLowerCase();
    if (
      !["supervisor", "despacho", "gerencia", "presidencia", "sistemas"].includes(
        role,
      )
    ) {
      throw new ForbiddenException(
        "Solo supervisor/despacho puede resolver desviaciones",
      );
    }

    const pending = await this.prisma.tripDeviationRequest.findFirst({
      where: {
        tripId,
        organizationId,
        status: TripDeviationStatus.PENDING,
      },
      orderBy: { createdAt: "desc" },
      include: { trip: true },
    });
    if (!pending) {
      throw new NotFoundException("No hay desviación pendiente");
    }

    if (input.decision === "CANCELAR") {
      const [updatedDev, trip] = await this.prisma.$transaction([
        this.prisma.tripDeviationRequest.update({
          where: { id: pending.id },
          data: {
            status: TripDeviationStatus.REJECTED,
            resolvedById: actor.userId,
            resolvedAt: new Date(),
            resolveNote: input.note,
          },
        }),
        this.prisma.trip.update({
          where: { id: tripId },
          data: { status: pending.previousStatus },
        }),
      ]);
      await this.appendAudit(
        organizationId,
        tripId,
        TripAuditAction.DEVIATION_REJECTED,
        `Desviación ${pending.action} rechazada`,
        actor.userId,
        { deviationId: pending.id, note: input.note },
      );
      this.gateway.emitUpdate(organizationId);
      this.gateway.emitDeviationResolved(organizationId, {
        deviationId: pending.id,
        tripId,
        decision: "CANCELAR",
        action: pending.action,
      });
      return { decision: "CANCELAR" as const, deviation: updatedDev, trip };
    }

    await this.prisma.tripDeviationRequest.update({
      where: { id: pending.id },
      data: {
        status: TripDeviationStatus.APPROVED,
        resolvedById: actor.userId,
        resolvedAt: new Date(),
        resolveNote: input.note,
      },
    });

    // Restaurar estado previo momentáneamente para que markStarted/Completed validen
    await this.prisma.trip.update({
      where: { id: tripId },
      data: { status: pending.previousStatus },
    });

    let trip;
    if (pending.action === TripDeviationAction.START) {
      trip = await this.ops.markStarted(organizationId, tripId, actor.userId);
    } else {
      trip = await this.ops.markCompleted(organizationId, tripId, actor.userId);
    }

    await this.appendAudit(
      organizationId,
      tripId,
      TripAuditAction.DEVIATION_APPROVED,
      `Desviación ${pending.action} aceptada — tracking autorizado`,
      actor.userId,
      { deviationId: pending.id, note: input.note },
    );

    this.gateway.emitDeviationResolved(organizationId, {
      deviationId: pending.id,
      tripId,
      decision: "ACEPTAR",
      action: pending.action,
    });

    return {
      decision: "ACEPTAR" as const,
      deviation: pending,
      trip,
    };
  }

  async listPendingDeviations(organizationId: string) {
    return this.prisma.tripDeviationRequest.findMany({
      where: { organizationId, status: TripDeviationStatus.PENDING },
      include: {
        trip: {
          select: {
            id: true,
            code: true,
            origin: true,
            destination: true,
            departAt: true,
            driver: { select: { id: true, name: true, document: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async reportIncident(
    organizationId: string,
    tripId: string,
    actor: { userId: string },
    input: {
      category: TripIncidentCategory;
      notes?: string;
      photoUrl?: string;
      lat?: number;
      lng?: number;
    },
  ) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, organizationId },
    });
    if (!trip) throw new NotFoundException("Servicio no encontrado");

    const incident = await this.prisma.tripFieldIncident.create({
      data: {
        organizationId,
        tripId,
        category: input.category,
        notes: input.notes,
        photoUrl: input.photoUrl,
        lat: input.lat,
        lng: input.lng,
        reportedById: actor.userId,
        serverTime: new Date(),
      },
    });

    // NO cambia status del viaje — solo auditoría + alerta
    await this.appendAudit(
      organizationId,
      tripId,
      TripAuditAction.INCIDENT,
      `Incidente campo ${input.category}${input.notes ? `: ${input.notes}` : ""}`,
      actor.userId,
      {
        incidentId: incident.id,
        category: input.category,
        nonBlocking: true,
      },
    );

    this.gateway.emitFieldIncident(organizationId, {
      incidentId: incident.id,
      tripId,
      code: trip.code,
      category: input.category,
      notes: input.notes ?? null,
      serverTime: incident.serverTime.toISOString(),
    });

    return {
      incident,
      tripStatus: trip.status,
      blocked: false,
      message: "Incidente registrado — viaje y GPS continúan",
    };
  }
}
