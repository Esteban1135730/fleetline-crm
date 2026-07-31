import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { SchoolRouteRunStatus } from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";
import { EscolarGateway } from "./escolar.gateway";
import { parentNotificationCopy } from "./escolar.calc";

type BoardingPayload = {
  organizationId: string;
  studentId: string;
  studentName: string;
  familyId?: string | null;
  routeId: string;
  runId?: string | null;
  kind: string;
  method?: string;
  status: string;
  lat?: number | null;
  lng?: number | null;
  at: string;
  eventId: string;
};

/**
 * Padres App (M19) — consume abordaje/descenso → Push / WebSocket.
 */
@Injectable()
export class ParentsTrackingService {
  private readonly logger = new Logger(ParentsTrackingService.name);

  constructor(
    private prisma: PrismaService,
    private gateway: EscolarGateway,
  ) {}

  @OnEvent("student.boarded")
  async onStudentBoarded(payload: BoardingPayload) {
    return this.notifyGuardians(payload);
  }

  @OnEvent("student.alighted")
  async onStudentAlighted(payload: BoardingPayload) {
    return this.notifyGuardians(payload);
  }

  @OnEvent("student.absent")
  async onStudentAbsent(payload: BoardingPayload) {
    return this.notifyGuardians(payload);
  }

  async notifyGuardians(payload: BoardingPayload) {
    const copy = parentNotificationCopy({
      studentName: payload.studentName,
      kind: payload.kind,
      status: payload.status,
    });

    const notification = await this.prisma.parentNotification.create({
      data: {
        organizationId: payload.organizationId,
        familyId: payload.familyId || undefined,
        studentId: payload.studentId,
        title: copy.title,
        body: copy.body,
        channel: "PUSH",
        payload: payload as object,
      },
    });

    this.gateway.emitToOrg(payload.organizationId, "parent.student.update", {
      ...payload,
      notificationId: notification.id,
      title: copy.title,
      body: copy.body,
    });

    if (payload.familyId) {
      this.gateway.emitToFamily(payload.familyId, "parent.student.update", {
        ...payload,
        notificationId: notification.id,
        title: copy.title,
        body: copy.body,
      });
    }

    this.logger.log(
      `[PADRES] push student=${payload.studentId} status=${payload.status}`,
    );

    return notification;
  }

  async studentStatus(organizationId: string, studentId: string) {
    const student = await this.prisma.schoolStudent.findFirst({
      where: { id: studentId, organizationId },
      include: {
        assignments: {
          where: { active: true },
          include: {
            schoolRoute: {
              select: {
                id: true,
                code: true,
                name: true,
                direction: true,
                lastLat: true,
                lastLng: true,
                lastLocatedAt: true,
                vehicle: {
                  select: { id: true, plate: true, lat: true, lng: true },
                },
              },
            },
            stop: true,
          },
        },
        boardingEvents: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
    });
    if (!student) throw new NotFoundException("Estudiante no encontrado");

    const route = student.assignments[0]?.schoolRoute ?? null;
    return {
      studentId: student.id,
      name: student.name,
      status: student.currentStatus,
      schoolName: student.schoolName,
      grade: student.grade,
      route: route
        ? {
            id: route.id,
            code: route.code,
            name: route.name,
            direction: route.direction,
            location: {
              lat: route.lastLat ?? route.vehicle?.lat ?? null,
              lng: route.lastLng ?? route.vehicle?.lng ?? null,
              at: route.lastLocatedAt?.toISOString() ?? null,
              plate: route.vehicle?.plate ?? null,
            },
          }
        : null,
      recentEvents: student.boardingEvents,
    };
  }

  async busLocation(organizationId: string, routeId: string) {
    const route = await this.prisma.schoolRoute.findFirst({
      where: { id: routeId, organizationId },
      include: {
        vehicle: {
          select: {
            id: true,
            plate: true,
            lat: true,
            lng: true,
            status: true,
            updatedAt: true,
          },
        },
        runs: {
          where: { status: SchoolRouteRunStatus.IN_PROGRESS },
          take: 1,
          orderBy: { startedAt: "desc" },
        },
        assignments: {
          where: { active: true },
          include: {
            student: {
              select: { id: true, name: true, currentStatus: true },
            },
          },
        },
      },
    });
    if (!route) throw new NotFoundException("Ruta escolar no encontrada");

    const lat = route.lastLat ?? route.vehicle?.lat ?? null;
    const lng = route.lastLng ?? route.vehicle?.lng ?? null;

    return {
      routeId: route.id,
      code: route.code,
      name: route.name,
      direction: route.direction,
      runActive: route.runs[0] ?? null,
      location: {
        lat,
        lng,
        at: route.lastLocatedAt?.toISOString() ?? route.vehicle?.updatedAt?.toISOString() ?? null,
        source: route.lastLat != null ? "ROUTE_TELEMETRY" : "VEHICLE_GPS",
      },
      vehicle: route.vehicle,
      students: route.assignments.map((a) => a.student),
    };
  }
}
