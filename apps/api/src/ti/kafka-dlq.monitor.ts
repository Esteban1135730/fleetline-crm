import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { DlqMessageStatus } from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";
import { KafkaEventsService } from "../logistics/kafka-events.service";
import type { DlqReplayDto } from "./dto/ti.dto";

/**
 * Monitor de Dead-Letter Queue Kafka — reintentos y alertas de eventos fallidos.
 */
@Injectable()
export class KafkaDlqMonitor {
  private readonly logger = new Logger(KafkaDlqMonitor.name);

  constructor(
    private prisma: PrismaService,
    private kafka: KafkaEventsService,
  ) {}

  countPending(organizationId?: string) {
    return this.prisma.kafkaDlqMessage.count({
      where: {
        status: DlqMessageStatus.PENDING,
        ...(organizationId ? { organizationId } : {}),
      },
    });
  }

  listPending(organizationId: string, take = 50) {
    return this.prisma.kafkaDlqMessage.findMany({
      where: {
        organizationId,
        status: DlqMessageStatus.PENDING,
      },
      orderBy: { lastErrorAt: "desc" },
      take,
    });
  }

  /**
   * Registra fallo de consumo en DLQ (Event Mesh).
   */
  async enqueueFailure(input: {
    organizationId?: string;
    topic: string;
    originalTopic?: string;
    payload: unknown;
    errorMessage: string;
    partition?: number;
    offset?: string;
  }) {
    const row = await this.prisma.kafkaDlqMessage.create({
      data: {
        organizationId: input.organizationId,
        topic: input.topic.endsWith(".dlq")
          ? input.topic
          : `${input.topic}.dlq`,
        originalTopic: input.originalTopic || input.topic,
        partition: input.partition ?? 0,
        offset: input.offset,
        payload: input.payload as object,
        errorMessage: input.errorMessage,
        attempts: 1,
        status: DlqMessageStatus.PENDING,
        lastErrorAt: new Date(),
      },
    });
    this.logger.warn(
      `[DLQ] topic=${row.topic} id=${row.id} err=${input.errorMessage.slice(0, 120)}`,
    );
    return row;
  }

  async replay(organizationId: string, dto: DlqReplayDto) {
    const results: Array<{
      id: string;
      status: "REPLAYED" | "SKIPPED" | "FAILED";
      topic?: string;
      error?: string;
    }> = [];

    for (const id of dto.messageIds) {
      const msg = await this.prisma.kafkaDlqMessage.findFirst({
        where: { id, organizationId },
      });
      if (!msg) {
        results.push({ id, status: "FAILED", error: "NOT_FOUND" });
        continue;
      }
      if (msg.status === DlqMessageStatus.REPLAYED && !dto.force) {
        results.push({ id, status: "SKIPPED", topic: msg.originalTopic || msg.topic });
        continue;
      }

      const targetTopic =
        msg.originalTopic || msg.topic.replace(/\.dlq$/, "");
      try {
        await this.kafka.emit(targetTopic, msg.payload);
        await this.prisma.kafkaDlqMessage.update({
          where: { id: msg.id },
          data: {
            status: DlqMessageStatus.REPLAYED,
            replayedAt: new Date(),
            attempts: { increment: 1 },
          },
        });
        results.push({ id, status: "REPLAYED", topic: targetTopic });
      } catch (err) {
        await this.prisma.kafkaDlqMessage.update({
          where: { id: msg.id },
          data: {
            attempts: { increment: 1 },
            lastErrorAt: new Date(),
            errorMessage: (err as Error).message,
          },
        });
        results.push({
          id,
          status: "FAILED",
          topic: targetTopic,
          error: (err as Error).message,
        });
      }
    }

    return {
      replayed: results.filter((r) => r.status === "REPLAYED").length,
      failed: results.filter((r) => r.status === "FAILED").length,
      skipped: results.filter((r) => r.status === "SKIPPED").length,
      results,
    };
  }

  async getOrThrow(organizationId: string, id: string) {
    const msg = await this.prisma.kafkaDlqMessage.findFirst({
      where: { id, organizationId },
    });
    if (!msg) throw new NotFoundException("Mensaje DLQ no encontrado");
    return msg;
  }
}
