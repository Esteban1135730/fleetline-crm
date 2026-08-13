import { z } from "zod";
import { HARD_RULES } from "@fsg/shared";

export type LeadSlaEval = {
  breached: boolean;
  reassign: boolean;
  status: "OK" | "WARNING" | "RED";
  hoursElapsed: number;
  slaHours: number;
};

/**
 * Evalúa SLA de primer contacto. Si vence sin atención → RED + reasignar.
 */
export function evaluateLeadSla(
  input: {
    assignedAt: Date | string | null | undefined;
    firstContactAt: Date | string | null | undefined;
    slaHours?: number;
  },
  now: Date = new Date(),
): LeadSlaEval {
  const slaHours = input.slaHours ?? HARD_RULES.COMERCIAL_LEAD_SLA_HOURS;
  if (input.firstContactAt) {
    return {
      breached: false,
      reassign: false,
      status: "OK",
      hoursElapsed: 0,
      slaHours,
    };
  }
  if (!input.assignedAt) {
    return {
      breached: false,
      reassign: false,
      status: "OK",
      hoursElapsed: 0,
      slaHours,
    };
  }
  const assigned = new Date(input.assignedAt).getTime();
  const hoursElapsed = (now.getTime() - assigned) / 3_600_000;
  if (hoursElapsed >= slaHours) {
    return {
      breached: true,
      reassign: true,
      status: "RED",
      hoursElapsed: Number(hoursElapsed.toFixed(2)),
      slaHours,
    };
  }
  if (hoursElapsed >= slaHours * 0.75) {
    return {
      breached: false,
      reassign: false,
      status: "WARNING",
      hoursElapsed: Number(hoursElapsed.toFixed(2)),
      slaHours,
    };
  }
  return {
    breached: false,
    reassign: false,
    status: "OK",
    hoursElapsed: Number(hoursElapsed.toFixed(2)),
    slaHours,
  };
}

export type RoundRobinAgent = {
  userId: string;
  name?: string;
  openLoad: number;
  conversionRate: number;
  available: boolean;
  sectorAffinity: number;
};

/**
 * Selección round-robin ponderada: conversión × afinidad sector − carga.
 */
export function pickRoundRobinAgent(
  agents: RoundRobinAgent[],
): RoundRobinAgent | null {
  const pool = agents.filter((a) => a.available);
  if (!pool.length) return null;
  let best = pool[0]!;
  let bestScore =
    best.conversionRate * (1 + best.sectorAffinity) - best.openLoad * 0.15;
  for (let i = 1; i < pool.length; i++) {
    const a = pool[i]!;
    const score =
      a.conversionRate * (1 + a.sectorAffinity) - a.openLoad * 0.15;
    if (score > bestScore) {
      best = a;
      bestScore = score;
    }
  }
  return best;
}

export function coordinatorCanApproveDiscount(discountPct: number): boolean {
  return discountPct <= HARD_RULES.COORDINADOR_COMERCIAL_MAX_DISCOUNT_PCT;
}

/** Impacto EBITDA simplificado: descuento × peso margen */
export function estimateEbitdaImpactPct(
  discountPct: number,
  marginPct: number,
): number {
  const impact = discountPct * (marginPct / 100) * 1.2;
  return Number((-impact).toFixed(2));
}

export const AprobarDescuentoSchema = z.object({
  quoteId: z.string().min(1),
  approve: z.boolean().default(true),
  /** Condiciones (ej. exigir contrato a 2 años) */
  requireContractYears: z.number().int().min(1).max(10).optional(),
  notes: z.string().optional(),
});
export type AprobarDescuentoDto = z.infer<typeof AprobarDescuentoSchema>;

export const CrearLicitacionSchema = z.object({
  title: z.string().min(3),
  entityName: z.string().min(2),
  processId: z.string().optional(),
  modality: z.string().default("Licitación pública"),
  category: z.enum(["ESCOLAR", "ESPECIAL", "PUBLICO", "TURISMO"]).default("ESPECIAL"),
  estimatedValue: z.number().positive().optional(),
  closeAt: z.coerce.date(),
  secopOpportunityId: z.string().optional(),
  notes: z.string().optional(),
  tasks: z
    .array(
      z.object({
        department: z.enum([
          "JURIDICO",
          "ARCHIVO",
          "FINANZAS",
          "COMERCIAL",
          "OPERACIONES",
        ]),
        title: z.string().min(2),
        dueAt: z.coerce.date(),
        assigneeHint: z.string().optional(),
      }),
    )
    .min(1)
    .optional(),
});
export type CrearLicitacionDto = z.infer<typeof CrearLicitacionSchema>;

export const DistribuirRoundRobinSchema = z.object({
  dealIds: z.array(z.string().min(1)).min(1).optional(),
  /** Si true, crea leads demo desde pool sin asignar */
  includeUnassigned: z.boolean().default(true),
  sector: z.string().optional(),
  /** Forzar reevaluación SLA y reasignar vencidos */
  reassignSlaBreached: z.boolean().default(true),
  agentUserIds: z.array(z.string().min(1)).optional(),
});
export type DistribuirRoundRobinDto = z.infer<typeof DistribuirRoundRobinSchema>;
