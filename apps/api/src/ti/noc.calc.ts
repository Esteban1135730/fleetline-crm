export type ProbeResult = {
  name: string;
  status: "UP" | "DOWN" | "DEGRADED";
  latencyMs: number;
  detail?: string;
};

export type NocHealthReport = {
  overall: "UP" | "DOWN" | "DEGRADED";
  checkedAt: string;
  uptimeSec: number;
  services: ProbeResult[];
  dlq: {
    pending: number;
    alert: boolean;
  };
};

const CRITICAL_SERVICES = new Set(["postgres", "api"]);

/**
 * Agrega salud NOC: DOWN si un servicio crítico cae; DEGRADED si hay fallas/DLQ.
 */
export function aggregateNocHealth(
  probes: ProbeResult[],
  dlqPending: number,
  opts?: { dlqAlertThreshold?: number; uptimeSec?: number; now?: Date },
): NocHealthReport {
  const threshold = opts?.dlqAlertThreshold ?? 10;
  const dlqAlert = dlqPending >= threshold;
  const criticalDown = probes.some(
    (p) => CRITICAL_SERVICES.has(p.name) && p.status === "DOWN",
  );
  const anyDown = probes.some((p) => p.status === "DOWN");
  const anyDegraded = probes.some((p) => p.status === "DEGRADED");

  let overall: NocHealthReport["overall"] = "UP";
  if (criticalDown) overall = "DOWN";
  else if (anyDown || anyDegraded || dlqAlert) overall = "DEGRADED";

  return {
    overall,
    checkedAt: (opts?.now ?? new Date()).toISOString(),
    uptimeSec: opts?.uptimeSec ?? Math.floor(process.uptime()),
    services: probes,
    dlq: { pending: dlqPending, alert: dlqAlert },
  };
}

/** Mock Gemini STT — texto estructurado de radio/despacho. */
export function mockTranscribeAudio(input: {
  audioRef?: string;
  audioBase64?: string;
  speakerRole?: string;
  hint?: string;
}): {
  text: string;
  structured: {
    intent: string;
    entities: Record<string, string>;
    speakerRole: string;
  };
  confidence: number;
  durationMs: number;
} {
  const role = input.speakerRole || "DRIVER";
  const hint = (input.hint || "").toLowerCase();
  let text =
    "Unidad en ruta, señal nominal. Solicito confirmación de despacho.";
  let intent = "STATUS_REPORT";
  const entities: Record<string, string> = {};

  if (hint.includes("soat") || hint.includes("bloqueado")) {
    text =
      "Alerta: vehículo bloqueado por SOAT vencido. No autorizar salida de patio.";
    intent = "COMPLIANCE_ALERT";
    entities.reason = "SOAT_EXPIRED";
  } else if (hint.includes("llegada") || role === "DISPATCHER") {
    text =
      "Despacho a unidad: confirmar llegada a punto de recojo y reportar pasajeros a bordo.";
    intent = "DISPATCH_INSTRUCTION";
  } else if (
    input.audioRef?.includes("emergency") ||
    hint.includes("emergencia")
  ) {
    text = "Emergencia en vía. Requiero apoyo y notificación a HQSE.";
    intent = "EMERGENCY";
    entities.severity = "CRITICAL";
  }

  const bytes = input.audioBase64?.length ?? 2400;
  return {
    text,
    structured: { intent, entities, speakerRole: role },
    confidence: 0.91,
    durationMs: Math.min(60_000, Math.max(800, Math.floor(bytes / 32))),
  };
}

/** Mock Gemini TTS — referencia de audio sintético para apps de campo. */
export function mockSynthesizeSpeech(input: {
  text: string;
  voice?: string;
  format?: string;
}): {
  audioRef: string;
  mimeType: string;
  durationMs: number;
  sampleBase64: string;
} {
  const format = input.format || "mp3";
  const voice = input.voice || "NOC_ALERT";
  const hash = Buffer.from(input.text).toString("base64url").slice(0, 16);
  const audioRef = `stts://gemini-mock/${voice}/${hash}.${format}`;
  const mime =
    format === "wav"
      ? "audio/wav"
      : format === "ogg"
        ? "audio/ogg"
        : "audio/mpeg";
  const sampleBase64 = Buffer.from(
    `FLEETLINE-STTS-MOCK:${input.text.slice(0, 120)}`,
    "utf8",
  ).toString("base64");

  return {
    audioRef,
    mimeType: mime,
    durationMs: Math.min(45_000, 600 + input.text.length * 45),
    sampleBase64,
  };
}
