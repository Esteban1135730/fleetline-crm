import { DlqMessageStatus } from "@fsg/db";
import {
  aggregateNocHealth,
  mockSynthesizeSpeech,
  mockTranscribeAudio,
} from "./noc.calc";
import { KafkaDlqMonitor } from "./kafka-dlq.monitor";
import { SttsEngineService } from "./stts-engine.service";
import { NocMonitoringService } from "./noc-monitoring.service";

describe("aggregateNocHealth — NOC arriba/abajo", () => {
  it("marca UP cuando todos los servicios están UP y DLQ baja", () => {
    const r = aggregateNocHealth(
      [
        { name: "api", status: "UP", latencyMs: 1 },
        { name: "postgres", status: "UP", latencyMs: 5 },
        { name: "redis", status: "UP", latencyMs: 2 },
        { name: "kafka", status: "UP", latencyMs: 3 },
      ],
      0,
      { uptimeSec: 120, now: new Date("2026-07-31T12:00:00.000Z") },
    );
    expect(r.overall).toBe("UP");
    expect(r.dlq.alert).toBe(false);
    expect(r.services).toHaveLength(4);
  });

  it("marca DOWN si postgres está caído", () => {
    const r = aggregateNocHealth(
      [
        { name: "api", status: "UP", latencyMs: 1 },
        { name: "postgres", status: "DOWN", latencyMs: 2000, detail: "ECONNREFUSED" },
        { name: "kafka", status: "UP", latencyMs: 3 },
      ],
      0,
    );
    expect(r.overall).toBe("DOWN");
  });

  it("marca DEGRADED si redis cae o DLQ supera umbral", () => {
    const byRedis = aggregateNocHealth(
      [
        { name: "api", status: "UP", latencyMs: 1 },
        { name: "postgres", status: "UP", latencyMs: 4 },
        { name: "redis", status: "DOWN", latencyMs: 1500 },
      ],
      0,
    );
    expect(byRedis.overall).toBe("DEGRADED");

    const byDlq = aggregateNocHealth(
      [
        { name: "api", status: "UP", latencyMs: 1 },
        { name: "postgres", status: "UP", latencyMs: 4 },
      ],
      25,
      { dlqAlertThreshold: 10 },
    );
    expect(byDlq.overall).toBe("DEGRADED");
    expect(byDlq.dlq.alert).toBe(true);
  });
});

describe("STTS mock — transcribe / synthesize", () => {
  it("transcribe alerta SOAT a texto estructurado", () => {
    const r = mockTranscribeAudio({
      audioRef: "radio://unit-1.webm",
      hint: "vehículo bloqueado por SOAT",
      speakerRole: "DISPATCHER",
    });
    expect(r.text).toMatch(/SOAT/i);
    expect(r.structured.intent).toBe("COMPLIANCE_ALERT");
    expect(r.structured.entities.reason).toBe("SOAT_EXPIRED");
    expect(r.confidence).toBeGreaterThan(0.8);
  });

  it("sintetiza alerta de sistema a audioRef mock", () => {
    const r = mockSynthesizeSpeech({
      text: "Vehículo bloqueado por SOAT",
      voice: "NOC_ALERT",
      format: "mp3",
    });
    expect(r.audioRef).toContain("stts://gemini-mock/NOC_ALERT/");
    expect(r.mimeType).toBe("audio/mpeg");
    expect(r.sampleBase64.length).toBeGreaterThan(10);
    expect(r.durationMs).toBeGreaterThan(600);
  });
});

describe("SttsEngineService — persistencia mock", () => {
  it("transcribe persiste job DONE", async () => {
    const create = jest.fn().mockResolvedValue({
      id: "job-1",
      status: "DONE",
    });
    const prisma = { sttsJob: { create } };
    const svc = new SttsEngineService(prisma as never);
    const out = await svc.transcribe("org-1", {
      audioRef: "uploads/voice.webm",
      hint: "emergencia",
      speakerRole: "DRIVER",
    });
    expect(out.structured.intent).toBe("EMERGENCY");
    expect(out.jobId).toBe("job-1");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mode: "TRANSCRIBE",
          status: "DONE",
          provider: "GEMINI_STTS_MOCK",
        }),
      }),
    );
  });

  it("synthesize persiste audioRef", async () => {
    const create = jest.fn().mockResolvedValue({
      id: "job-2",
      status: "DONE",
    });
    const prisma = { sttsJob: { create } };
    const svc = new SttsEngineService(prisma as never);
    const out = await svc.synthesize("org-1", {
      text: "Vehículo bloqueado por SOAT",
      voice: "NOC_ALERT",
    });
    expect(out.audioRef).toContain("NOC_ALERT");
    expect(out.audioBase64).toBeTruthy();
    expect(create).toHaveBeenCalled();
  });
});

describe("KafkaDlqMonitor — replay", () => {
  it("reejecuta mensajes PENDING vía Kafka emit", async () => {
    const emit = jest.fn().mockResolvedValue(undefined);
    const update = jest.fn().mockResolvedValue({});
    const prisma = {
      kafkaDlqMessage: {
        findFirst: jest.fn().mockResolvedValue({
          id: "dlq-1",
          topic: "trip.completed.dlq",
          originalTopic: "trip.completed",
          payload: { tripId: "t-1" },
          status: DlqMessageStatus.PENDING,
        }),
        update,
      },
    };
    const monitor = new KafkaDlqMonitor(prisma as never, { emit } as never);
    const out = await monitor.replay("org-1", { messageIds: ["dlq-1"] });
    expect(out.replayed).toBe(1);
    expect(emit).toHaveBeenCalledWith("trip.completed", { tripId: "t-1" });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: DlqMessageStatus.REPLAYED }),
      }),
    );
  });
});

describe("NocMonitoringService — health report", () => {
  it("identifica postgres DOWN en el reporte", async () => {
    const prisma = {
      $queryRaw: jest.fn().mockRejectedValue(new Error("ECONNREFUSED")),
      systemLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const dlq = { countPending: jest.fn().mockResolvedValue(0) };
    const svc = new NocMonitoringService(prisma as never, dlq as never);

    // Sin REDIS/KAFKA en env → DEGRADED/UP en opcionales; postgres DOWN → overall DOWN
    const prevRedis = process.env.REDIS_URL;
    const prevKafka = process.env.KAFKA_BROKERS;
    delete process.env.REDIS_URL;
    delete process.env.KAFKA_BROKERS;
    try {
      const report = await svc.health("org-1");
      expect(report.services.find((s) => s.name === "postgres")?.status).toBe(
        "DOWN",
      );
      expect(report.overall).toBe("DOWN");
      expect(prisma.systemLog.create).toHaveBeenCalled();
    } finally {
      if (prevRedis) process.env.REDIS_URL = prevRedis;
      if (prevKafka) process.env.KAFKA_BROKERS = prevKafka;
    }
  });
});
