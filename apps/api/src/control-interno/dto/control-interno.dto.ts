import { z } from "zod";
import { HARD_RULES } from "@fsg/shared";

export const AuditLogQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  userId: z.string().optional(),
  action: z.string().optional(),
  entity: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional().default(200),
});
export type AuditLogQueryDto = z.infer<typeof AuditLogQuerySchema>;

export const CrearHallazgoSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  category: z
    .enum(["FINANCIERA", "OPERATIVA", "COMBUSTIBLE", "OVERRIDE"])
    .optional()
    .default("OPERATIVA"),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional().default("MEDIUM"),
  areaResponsible: z.string().optional(),
  evidenceRef: z.string().optional(),
  relatedEntity: z.string().optional(),
  relatedEntityId: z.string().optional(),
});
export type CrearHallazgoDto = z.infer<typeof CrearHallazgoSchema>;

export const SmartAuditQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  plate: z.string().optional(),
  persist: z.coerce.boolean().optional().default(true),
});
export type SmartAuditQueryDto = z.infer<typeof SmartAuditQuerySchema>;

export const BankAccountChangeSchema = z.object({
  supplierId: z.string().min(1),
  newAccount: z.string().min(4),
  newBank: z.string().optional(),
  ipAddress: z.string().optional(),
});
export type BankAccountChangeDto = z.infer<typeof BankAccountChangeSchema>;

/** Pure: heat level from deviation % */
export function fuelHeatLevel(deviationPct: number): "GREEN" | "AMBER" | "RED" {
  const thr = HARD_RULES.FUEL_AUDIT_DEVIATION_PCT;
  if (deviationPct >= thr * 2) return "RED";
  if (deviationPct >= thr) return "AMBER";
  return "GREEN";
}

/**
 * Pure Smart Audit: galones pagados vs km GPS vs rendimiento esperado.
 */
export function computeFuelSmartAudit(input: {
  gallonsPaid: number;
  kmGps: number;
  expectedKmPerGallon: number;
}): {
  actualKmPerGallon: number | null;
  expectedKm: number;
  deviationPct: number;
  anomalyScore: number;
  heatLevel: "GREEN" | "AMBER" | "RED";
} {
  const gallons = Math.max(0, input.gallonsPaid);
  const km = Math.max(0, input.kmGps);
  const expected = Math.max(0.1, input.expectedKmPerGallon);
  const expectedKm = gallons * expected;
  const actualKmPerGallon = gallons > 0 ? Number((km / gallons).toFixed(2)) : null;
  const deviationPct =
    expectedKm > 0
      ? Number((Math.abs(km - expectedKm) / expectedKm * 100).toFixed(1))
      : 0;
  const heatLevel = fuelHeatLevel(deviationPct);
  const anomalyScore = Number(
    Math.min(100, deviationPct * (heatLevel === "RED" ? 1.5 : 1)).toFixed(1),
  );
  return { actualKmPerGallon, expectedKm, deviationPct, anomalyScore, heatLevel };
}

/**
 * Controllers must never expose AuditLog UPDATE/DELETE — immutability contract.
 */
export function assertAuditLogApiImmutable(controllerProto: object): {
  ok: boolean;
  forbiddenMethods: string[];
} {
  const names = Object.getOwnPropertyNames(controllerProto).filter(
    (n) => n !== "constructor",
  );
  const forbidden = names.filter((n) =>
    /^(update|delete|remove|patch|put|destroy|mutate).*audit/i.test(n) ||
    /audit.*(update|delete|remove|patch|put|destroy)/i.test(n),
  );
  return { ok: forbidden.length === 0, forbiddenMethods: forbidden };
}
