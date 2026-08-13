import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { PrismaService } from "../prisma/prisma.service";
import { KafkaEventsService } from "../logistics/kafka-events.service";
import type { TelemetryRiskEventDto } from "./dto/qhse.dto";

/** Penalización Driver Score por tipo de evento telemetría. */
export const SPEED_SCORE_PENALTY = 8;
export const HARD_BRAKE_SCORE_PENALTY = 5;
export const MIN_SAFETY_SCORE = 0;

/**
 * Módulo 7 — consumo de eventos GPS/giroscopio → Ticket de Riesgo +
 * capacitación defensiva + afectación Driver Score.
 */
@Injectable()
export class QhseTelemetryService {
  private readonly logger = new Logger(QhseTelemetryService.name);

  constructor(
    private prisma: PrismaService,
    private kafka: KafkaEventsService,
  ) {}

  @OnEvent("telemetry.speed.exceeded")
  async onSpeedExceeded(payload: TelemetryRiskEventDto) {
    return this.processRiskEvent({ ...payload, kind: "SPEED_EXCESS" });
  }

  @OnEvent("telemetry.hard.brake")
  async onHardBrake(payload: TelemetryRiskEventDto) {
    return this.processRiskEvent({ ...payload, kind: "HARD_BRAKE" });
  }

  async processRiskEvent(dto: TelemetryRiskEventDto) {
    const driver = await this.prisma.driver.findFirst({
      where: { id: dto.driverId, organizationId: dto.organizationId },
    });
    if (!driver) {
      throw new NotFoundException("Conductor no encontrado para telemetría");
    }

    const penalty =
      dto.kind === "SPEED_EXCESS"
        ? SPEED_SCORE_PENALTY
        : HARD_BRAKE_SCORE_PENALTY;
    const prevScore = driver.safetyScore ?? 100;
    const nextScore = Math.max(MIN_SAFETY_SCORE, prevScore - penalty);

    const label =
      dto.kind === "SPEED_EXCESS"
        ? `Exceso de velocidad${dto.speedKmh != null ? ` ${dto.speedKmh} km/h` : ""}`
        : "Frenada brusca";

    const ticket = await this.prisma.qualityEvent.create({
      data: {
        organizationId: dto.organizationId,
        kind: "RISK_TICKET",
        title: `Ticket de Riesgo · ${label}`,
        status: "OPEN",
        npsScore: null,
      },
    });

    const training = await this.prisma.hqseTrainingRecord.create({
      data: {
        organizationId: dto.organizationId,
        driverId: dto.driverId,
        topic: "CONDUCCION_DEFENSIVA",
        completedAt: dto.occurredAt || new Date(),
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        provider: "APP_CONDUCTOR",
        certificateRef: `PENDING:${ticket.id}`,
      },
    });

    const updatedDriver = await this.prisma.driver.update({
      where: { id: dto.driverId },
      data: { safetyScore: nextScore },
      select: {
        id: true,
        name: true,
        safetyScore: true,
        document: true,
      },
    });

    await this.kafka.emit("qhse.risk.ticket.created", {
      organizationId: dto.organizationId,
      ticketId: ticket.id,
      driverId: dto.driverId,
      vehicleId: dto.vehicleId,
      kind: dto.kind,
      previousSafetyScore: prevScore,
      safetyScore: nextScore,
      trainingId: training.id,
      plate: dto.plate,
    });

    this.logger.log(
      `Ticket riesgo ${ticket.id} · driver ${dto.driverId} score ${prevScore}→${nextScore}`,
    );

    return {
      ticket: {
        id: ticket.id,
        kind: ticket.kind,
        title: ticket.title,
        status: ticket.status,
      },
      training: {
        id: training.id,
        topic: training.topic,
        channel: "APP_CONDUCTOR",
        status: "PROGRAMADA",
      },
      driver: updatedDriver,
      scoreDelta: -penalty,
      event: dto.kind,
    };
  }
}
