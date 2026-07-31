import { Injectable, Logger } from "@nestjs/common";
import { createConnection } from "net";
import { PrismaService } from "../prisma/prisma.service";
import { KafkaDlqMonitor } from "./kafka-dlq.monitor";
import {
  aggregateNocHealth,
  type ProbeResult,
} from "./noc.calc";
import type { SystemLogsQuery } from "./dto/ti.dto";
import { SystemLogLevel } from "@fsg/db";

/**
 * Centro de Operaciones de Red (NOC) — salud DB / Redis / Kafka / microservicios.
 */
@Injectable()
export class NocMonitoringService {
  private readonly logger = new Logger(NocMonitoringService.name);

  constructor(
    private prisma: PrismaService,
    private dlq: KafkaDlqMonitor,
  ) {}

  async health(organizationId: string) {
    const probes: ProbeResult[] = [];

    probes.push(await this.probeApi());
    probes.push(await this.probePostgres());
    probes.push(await this.probeRedis());
    probes.push(await this.probeKafka());
    probes.push(...(await this.probeMicroservices()));

    const dlqPending = await this.dlq.countPending(organizationId);
    const report = aggregateNocHealth(probes, dlqPending, {
      uptimeSec: Math.floor(process.uptime()),
    });

    await this.prisma.systemLog.create({
      data: {
        organizationId,
        level:
          report.overall === "UP"
            ? SystemLogLevel.INFO
            : report.overall === "DEGRADED"
              ? SystemLogLevel.WARN
              : SystemLogLevel.ERROR,
        source: "NOC",
        message: `Health check overall=${report.overall} dlqPending=${dlqPending}`,
        meta: {
          overall: report.overall,
          services: probes.map((p) => ({
            name: p.name,
            status: p.status,
            latencyMs: p.latencyMs,
          })),
        },
      },
    });

    this.logger.log(
      `[NOC] overall=${report.overall} services=${probes.length} dlq=${dlqPending}`,
    );

    return report;
  }

  async listSystemLogs(organizationId: string, query: SystemLogsQuery) {
    const limit = query.limit ?? 50;
    return this.prisma.systemLog.findMany({
      where: {
        OR: [{ organizationId }, { organizationId: null }],
        ...(query.level ? { level: query.level as SystemLogLevel } : {}),
        ...(query.source
          ? { source: { contains: query.source, mode: "insensitive" } }
          : {}),
        ...(query.q
          ? { message: { contains: query.q, mode: "insensitive" } }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  private async probeApi(): Promise<ProbeResult> {
    const t0 = Date.now();
    return {
      name: "api",
      status: "UP",
      latencyMs: Date.now() - t0,
      detail: "fleetline-api process",
    };
  }

  private async probePostgres(): Promise<ProbeResult> {
    const t0 = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        name: "postgres",
        status: "UP",
        latencyMs: Date.now() - t0,
        detail: "prisma SELECT 1",
      };
    } catch (err) {
      return {
        name: "postgres",
        status: "DOWN",
        latencyMs: Date.now() - t0,
        detail: (err as Error).message,
      };
    }
  }

  private async probeRedis(): Promise<ProbeResult> {
    const t0 = Date.now();
    const url = process.env.REDIS_URL || process.env.REDIS_HOST;
    if (!url) {
      return {
        name: "redis",
        status: "DEGRADED",
        latencyMs: Date.now() - t0,
        detail: "REDIS_URL no configurado — modo sin caché",
      };
    }
    try {
      const host =
        process.env.REDIS_HOST ||
        (url.includes("://") ? new URL(url).hostname : url.split(":")[0]);
      const port = Number(
        process.env.REDIS_PORT ||
          (url.includes("://") ? new URL(url).port || 6379 : 6379),
      );
      await this.tcpProbe(host, port, 1500);
      return {
        name: "redis",
        status: "UP",
        latencyMs: Date.now() - t0,
        detail: `${host}:${port}`,
      };
    } catch (err) {
      return {
        name: "redis",
        status: "DOWN",
        latencyMs: Date.now() - t0,
        detail: (err as Error).message,
      };
    }
  }

  private async probeKafka(): Promise<ProbeResult> {
    const t0 = Date.now();
    const brokers = (process.env.KAFKA_BROKERS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (!brokers.length) {
      return {
        name: "kafka",
        status: "DEGRADED",
        latencyMs: Date.now() - t0,
        detail: "KAFKA_BROKERS vacío — EventEmitter in-process (dev)",
      };
    }

    try {
      const [host, portStr] = brokers[0].split(":");
      await this.tcpProbe(host, Number(portStr || 9092), 2000);
      return {
        name: "kafka",
        status: "UP",
        latencyMs: Date.now() - t0,
        detail: brokers.join(","),
      };
    } catch (err) {
      return {
        name: "kafka",
        status: "DOWN",
        latencyMs: Date.now() - t0,
        detail: (err as Error).message,
      };
    }
  }

  private async probeMicroservices(): Promise<ProbeResult[]> {
    const raw = process.env.TI_MICROSERVICES || "";
    const list = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (!list.length) {
      return [
        {
          name: "ms-logistics",
          status: "UP",
          latencyMs: 1,
          detail: "in-process Nest module",
        },
        {
          name: "ms-tramites",
          status: "UP",
          latencyMs: 1,
          detail: "in-process Nest module",
        },
        {
          name: "ms-stts",
          status: "UP",
          latencyMs: 1,
          detail: "Gemini STTS mock engine",
        },
      ];
    }

    const out: ProbeResult[] = [];
    for (const entry of list) {
      const t0 = Date.now();
      const [name, hostPort] = entry.includes("=")
        ? entry.split("=")
        : [`ms-${out.length + 1}`, entry];
      try {
        const [host, portStr] = hostPort.split(":");
        await this.tcpProbe(host, Number(portStr || 80), 1500);
        out.push({
          name,
          status: "UP",
          latencyMs: Date.now() - t0,
          detail: hostPort,
        });
      } catch (err) {
        out.push({
          name,
          status: "DOWN",
          latencyMs: Date.now() - t0,
          detail: (err as Error).message,
        });
      }
    }
    return out;
  }

  private tcpProbe(host: string, port: number, timeoutMs: number) {
    return new Promise<void>((resolve, reject) => {
      const socket = createConnection({ host, port }, () => {
        socket.end();
        resolve();
      });
      socket.setTimeout(timeoutMs);
      socket.on("timeout", () => {
        socket.destroy();
        reject(new Error(`timeout ${host}:${port}`));
      });
      socket.on("error", (err) => reject(err));
    });
  }
}
