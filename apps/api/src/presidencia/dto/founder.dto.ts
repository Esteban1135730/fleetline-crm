import { z } from "zod";

export const JarvisVoiceQuerySchema = z.object({
  utterance: z.string().min(3),
  /** Disparar alertas de voz a directores */
  alertDirectors: z.boolean().optional().default(true),
  locale: z.string().optional().default("es-CO"),
});
export type JarvisVoiceQueryDto = z.infer<typeof JarvisVoiceQuerySchema>;

export const CapexSimularSchema = z.object({
  unitsToAcquire: z.coerce.number().int().min(1).max(200),
  unitCostCop: z.coerce.number().positive(),
  /** Horizonte de payback en meses (opcional, default 36) */
  horizonMonths: z.coerce.number().int().min(6).max(120).optional().default(36),
  notes: z.string().optional(),
});
export type CapexSimularDto = z.infer<typeof CapexSimularSchema>;

export const DefconActivarSchema = z.object({
  defconLevel: z.coerce.number().int().min(1).max(5).optional().default(2),
  conflictZones: z.array(z.string().min(1)).min(1),
  notes: z.string().optional(),
  notifyDrivers: z.boolean().optional().default(true),
  notifyCustomers: z.boolean().optional().default(true),
  notifyParents: z.boolean().optional().default(true),
  openWarRoom: z.boolean().optional().default(true),
});
export type DefconActivarDto = z.infer<typeof DefconActivarSchema>;

export type DefconCascadeStep = {
  channel: "APP_DRIVER_SIREN" | "WHATSAPP" | "SMS" | "VOICE_DIRECTOR" | "WAR_ROOM";
  audience: "DRIVERS" | "CUSTOMERS" | "PARENTS" | "DIRECTORS" | "PRESIDENCY";
  count: number;
  message: string;
};

/**
 * Pure cascade planner — DEFCON protocol notifications.
 */
export function planDefconCascade(input: {
  defconLevel: number;
  conflictZones: string[];
  driversInZones: number;
  customersActive: number;
  parentsActive: number;
  notifyDrivers: boolean;
  notifyCustomers: boolean;
  notifyParents: boolean;
  openWarRoom: boolean;
}): {
  steps: DefconCascadeStep[];
  driversNotified: number;
  customersNotified: number;
  parentsNotified: number;
  warRoomOpen: boolean;
} {
  const zones = input.conflictZones.join(", ");
  const steps: DefconCascadeStep[] = [];

  if (input.notifyDrivers) {
    steps.push({
      channel: "APP_DRIVER_SIREN",
      audience: "DRIVERS",
      count: input.driversInZones,
      message: `DEFCON ${input.defconLevel} · sirena · zonas: ${zones}`,
    });
  }
  if (input.notifyCustomers) {
    steps.push({
      channel: "WHATSAPP",
      audience: "CUSTOMERS",
      count: input.customersActive,
      message: `Comunicado masivo clientes — crisis operativa DEFCON ${input.defconLevel}`,
    });
    steps.push({
      channel: "SMS",
      audience: "CUSTOMERS",
      count: input.customersActive,
      message: `SMS clientes — DEFCON ${input.defconLevel} · ${zones}`,
    });
  }
  if (input.notifyParents) {
    steps.push({
      channel: "WHATSAPP",
      audience: "PARENTS",
      count: input.parentsActive,
      message: `Comunicado padres/acudientes — DEFCON ${input.defconLevel}`,
    });
  }
  steps.push({
    channel: "VOICE_DIRECTOR",
    audience: "DIRECTORS",
    count: 1,
    message: `Alerta vocal a Dirección Operativa / Financiera — DEFCON ${input.defconLevel}`,
  });
  if (input.openWarRoom) {
    steps.push({
      channel: "WAR_ROOM",
      audience: "PRESIDENCY",
      count: 1,
      message: "War Room de Presidencia abierto",
    });
  }

  return {
    steps,
    driversNotified: input.notifyDrivers ? input.driversInZones : 0,
    customersNotified: input.notifyCustomers ? input.customersActive : 0,
    parentsNotified: input.notifyParents ? input.parentsActive : 0,
    warRoomOpen: input.openWarRoom,
  };
}

/** CapEx recommendation from utilization vs acquisition */
export function recommendCapex(input: {
  currentUtilizationPct: number;
  unitsToAcquire: number;
  fleetSize: number;
  totalCapexCop: number;
  horizonMonths: number;
  monthlyMarginEstimate: number;
}): {
  projectedUtilizationPct: number;
  paybackMonths: number | null;
  recommendation: "PROCEED" | "HOLD" | "REVIEW";
  rationale: string;
} {
  const fleetAfter = Math.max(1, input.fleetSize + input.unitsToAcquire);
  const projectedUtilizationPct = Number(
    Math.min(
      100,
      (input.currentUtilizationPct * input.fleetSize) / fleetAfter,
    ).toFixed(1),
  );
  const paybackMonths =
    input.monthlyMarginEstimate > 0
      ? Number(
          (input.totalCapexCop / input.monthlyMarginEstimate).toFixed(1),
        )
      : null;

  let recommendation: "PROCEED" | "HOLD" | "REVIEW" = "REVIEW";
  let rationale = "Requiere análisis de junta";

  if (input.currentUtilizationPct >= 85 && projectedUtilizationPct >= 70) {
    recommendation = "PROCEED";
    rationale =
      "Utilización saturada — adquisición diluye calor operativo sin ociosidad crítica";
  } else if (input.currentUtilizationPct < 60) {
    recommendation = "HOLD";
    rationale =
      "Utilización baja — optimizar flota actual antes de CapEx";
  } else if (paybackMonths != null && paybackMonths > input.horizonMonths) {
    recommendation = "HOLD";
    rationale = `Payback ${paybackMonths}m supera horizonte ${input.horizonMonths}m`;
  } else if (paybackMonths != null && paybackMonths <= input.horizonMonths) {
    recommendation = "PROCEED";
    rationale = `Payback estimado ${paybackMonths}m dentro de horizonte`;
  }

  return { projectedUtilizationPct, paybackMonths, recommendation, rationale };
}
