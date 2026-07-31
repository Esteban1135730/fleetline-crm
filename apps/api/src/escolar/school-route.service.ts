import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  SchoolBoardingKind,
  SchoolBoardingMethod,
  SchoolNoveltyKind,
  SchoolRouteRunStatus,
  StudentTripStatus,
} from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";
import { KafkaEventsService } from "../logistics/kafka-events.service";
import type {
  BoardingCheckInDto,
  RouteEndDto,
  RouteStartDto,
  SchoolNoveltyDto,
} from "./dto/escolar.dto";
import {
  kafkaTopicForBoarding,
  resolveStudentStatusAfterBoarding,
} from "./escolar.calc";

/**
 * Monitora App (M18) — rutas escolares, abordaje QR/NFC, cierre de ruta.
 */
@Injectable()
export class SchoolRouteService {
  private readonly logger = new Logger(SchoolRouteService.name);

  constructor(
    private prisma: PrismaService,
    private kafka: KafkaEventsService,
  ) {}

  listRoutes(organizationId: string) {
    return this.prisma.schoolRoute.findMany({
      where: { organizationId, active: true },
      include: {
        stops: { orderBy: { sequence: "asc" } },
        assignments: {
          where: { active: true },
          include: {
            student: {
              select: {
                id: true,
                name: true,
                qrCode: true,
                currentStatus: true,
                grade: true,
              },
            },
            stop: true,
          },
        },
        vehicle: { select: { id: true, plate: true, lat: true, lng: true } },
        _count: { select: { runs: true } },
      },
      orderBy: { code: "asc" },
    });
  }

  async startRoute(
    organizationId: string,
    dto: RouteStartDto,
    actorUserId?: string,
  ) {
    const route = await this.prisma.schoolRoute.findFirst({
      where: { id: dto.routeId, organizationId },
      include: { assignments: { where: { active: true } } },
    });
    if (!route) throw new NotFoundException("Ruta escolar no encontrada");

    const open = await this.prisma.schoolRouteRun.findFirst({
      where: {
        schoolRouteId: route.id,
        status: SchoolRouteRunStatus.IN_PROGRESS,
      },
    });
    if (open) {
      throw new BadRequestException(
        `Ya hay una corrida activa (${open.id}) en esta ruta`,
      );
    }

    const run = await this.prisma.schoolRouteRun.create({
      data: {
        organizationId,
        schoolRouteId: route.id,
        status: SchoolRouteRunStatus.IN_PROGRESS,
        monitorId: dto.monitorId || route.monitorId,
        startedAt: new Date(),
        startLat: dto.lat,
        startLng: dto.lng,
      },
    });

    await this.prisma.schoolStudent.updateMany({
      where: {
        id: { in: route.assignments.map((a) => a.studentId) },
        currentStatus: {
          notIn: [StudentTripStatus.AUSENTE],
        },
      },
      data: { currentStatus: StudentTripStatus.BUS_EN_CAMINO },
    });

    if (dto.lat != null && dto.lng != null) {
      await this.prisma.schoolRoute.update({
        where: { id: route.id },
        data: {
          lastLat: dto.lat,
          lastLng: dto.lng,
          lastLocatedAt: new Date(),
        },
      });
    }

    await this.kafka.emit("school.route.started", {
      organizationId,
      routeId: route.id,
      runId: run.id,
      code: route.code,
      actorUserId,
      at: new Date().toISOString(),
      lat: dto.lat,
      lng: dto.lng,
    });

    this.logger.log(`[MONITORA] ruta ${route.code} iniciada run=${run.id}`);
    return { route, run };
  }

  async endRoute(organizationId: string, dto: RouteEndDto) {
    const route = await this.prisma.schoolRoute.findFirst({
      where: { id: dto.routeId, organizationId },
    });
    if (!route) throw new NotFoundException("Ruta escolar no encontrada");

    const run = dto.runId
      ? await this.prisma.schoolRouteRun.findFirst({
          where: { id: dto.runId, schoolRouteId: route.id, organizationId },
        })
      : await this.prisma.schoolRouteRun.findFirst({
          where: {
            schoolRouteId: route.id,
            status: SchoolRouteRunStatus.IN_PROGRESS,
          },
          orderBy: { startedAt: "desc" },
        });

    if (!run) throw new NotFoundException("Corrida activa no encontrada");

    const updated = await this.prisma.schoolRouteRun.update({
      where: { id: run.id },
      data: {
        status: SchoolRouteRunStatus.COMPLETED,
        endedAt: new Date(),
        endLat: dto.lat,
        endLng: dto.lng,
      },
    });

    if (dto.lat != null && dto.lng != null) {
      await this.prisma.schoolRoute.update({
        where: { id: route.id },
        data: {
          lastLat: dto.lat,
          lastLng: dto.lng,
          lastLocatedAt: new Date(),
        },
      });
    }

    await this.kafka.emit("school.route.ended", {
      organizationId,
      routeId: route.id,
      runId: run.id,
      code: route.code,
      at: new Date().toISOString(),
    });

    return updated;
  }

  async boardingCheckIn(
    organizationId: string,
    dto: BoardingCheckInDto,
    monitorUserId?: string,
  ) {
    const route = await this.prisma.schoolRoute.findFirst({
      where: { id: dto.routeId, organizationId },
    });
    if (!route) throw new NotFoundException("Ruta escolar no encontrada");

    const student = await this.resolveStudent(organizationId, dto);
    const assignment = await this.prisma.schoolStudentAssignment.findFirst({
      where: {
        schoolRouteId: route.id,
        studentId: student.id,
        active: true,
      },
    });
    if (!assignment) {
      throw new BadRequestException(
        "Estudiante no asignado a esta ruta escolar",
      );
    }

    const kind = (dto.kind as SchoolBoardingKind) || SchoolBoardingKind.BOARD;
    const method =
      (dto.method as SchoolBoardingMethod) ||
      (dto.nfcUid
        ? SchoolBoardingMethod.NFC
        : dto.qrCode
          ? SchoolBoardingMethod.QR
          : SchoolBoardingMethod.MANUAL);

    const resultingStatus = resolveStudentStatusAfterBoarding({
      kind,
      direction: route.direction,
      previous: student.currentStatus,
    });

    let runId = dto.runId;
    if (!runId) {
      const open = await this.prisma.schoolRouteRun.findFirst({
        where: {
          schoolRouteId: route.id,
          status: SchoolRouteRunStatus.IN_PROGRESS,
        },
        orderBy: { startedAt: "desc" },
      });
      runId = open?.id;
    }

    const [event, updatedStudent] = await this.prisma.$transaction([
      this.prisma.schoolBoardingEvent.create({
        data: {
          organizationId,
          studentId: student.id,
          schoolRouteId: route.id,
          runId,
          kind,
          method,
          resultingStatus,
          lat: dto.lat,
          lng: dto.lng,
          monitorUserId,
        },
      }),
      this.prisma.schoolStudent.update({
        where: { id: student.id },
        data: { currentStatus: resultingStatus },
      }),
    ]);

    if (dto.lat != null && dto.lng != null) {
      await this.prisma.schoolRoute.update({
        where: { id: route.id },
        data: {
          lastLat: dto.lat,
          lastLng: dto.lng,
          lastLocatedAt: new Date(),
        },
      });
    }

    const topic = kafkaTopicForBoarding(kind);
    const payload = {
      organizationId,
      studentId: student.id,
      studentName: student.name,
      familyId: student.familyId,
      routeId: route.id,
      runId,
      kind,
      method,
      status: resultingStatus,
      lat: dto.lat ?? null,
      lng: dto.lng ?? null,
      at: event.createdAt.toISOString(),
      eventId: event.id,
    };
    await this.kafka.emit(topic, payload);

    this.logger.log(
      `[MONITORA] ${topic} student=${student.name} status=${resultingStatus}`,
    );

    return {
      event,
      student: updatedStudent,
      topic,
      geo: { lat: dto.lat, lng: dto.lng },
    };
  }

  async registerNovelty(
    organizationId: string,
    dto: SchoolNoveltyDto,
    reportedById?: string,
  ) {
    if (dto.kind === "STUDENT_ABSENT" && dto.studentId && dto.routeId) {
      await this.boardingCheckIn(
        organizationId,
        {
          studentId: dto.studentId,
          routeId: dto.routeId,
          runId: dto.runId,
          kind: "ABSENT",
          method: "MANUAL",
        },
        reportedById,
      );
    }

    return this.prisma.schoolNovelty.create({
      data: {
        organizationId,
        kind: dto.kind as SchoolNoveltyKind,
        notes: dto.notes,
        schoolRouteId: dto.routeId,
        runId: dto.runId,
        studentId: dto.studentId,
        reportedById,
      },
    });
  }

  private async resolveStudent(
    organizationId: string,
    dto: BoardingCheckInDto,
  ) {
    if (dto.studentId) {
      const s = await this.prisma.schoolStudent.findFirst({
        where: { id: dto.studentId, organizationId },
      });
      if (!s) throw new NotFoundException("Estudiante no encontrado");
      return s;
    }
    if (dto.qrCode) {
      const s = await this.prisma.schoolStudent.findFirst({
        where: { organizationId, qrCode: dto.qrCode },
      });
      if (!s) throw new NotFoundException("QR de estudiante no reconocido");
      return s;
    }
    if (dto.nfcUid) {
      const s = await this.prisma.schoolStudent.findFirst({
        where: { organizationId, nfcUid: dto.nfcUid },
      });
      if (!s) throw new NotFoundException("NFC de estudiante no reconocido");
      return s;
    }
    throw new BadRequestException("Identificador de estudiante requerido");
  }
}
