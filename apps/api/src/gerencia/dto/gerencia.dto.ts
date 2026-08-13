import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { z } from "zod";
import { HARD_RULES } from "@fsg/shared";

export const EXECUTIVE_PIN_REQUIRED = "EXECUTIVE_PIN_REQUIRED";
export const EXECUTIVE_PIN_INVALID = "EXECUTIVE_PIN_INVALID";

/**
 * Exige PIN de 6 dígitos para firma ejecutiva.
 * Extraído para unit tests.
 */
export function assertExecutivePinProvided(pin: unknown): string {
  const digits = HARD_RULES.GERENTE_EXECUTIVE_PIN_DIGITS;
  if (typeof pin !== "string" || !new RegExp(`^\\d{${digits}}$`).test(pin)) {
    throw new BadRequestException({
      error: EXECUTIVE_PIN_REQUIRED,
      message: `PIN de seguridad de ${digits} dígitos requerido para firma ejecutiva`,
      statusCode: 400,
    });
  }
  return pin;
}

export function assertExecutivePinValid(
  pin: string | undefined | null,
  pinHash: string | null | undefined,
  verify: (plain: string, hash: string) => boolean,
): void {
  const validPin = assertExecutivePinProvided(pin);
  if (!pinHash || !verify(validPin, pinHash)) {
    throw new UnauthorizedException({
      error: EXECUTIVE_PIN_INVALID,
      message: "PIN de seguridad inválido",
      statusCode: 401,
    });
  }
}

export type OverrideScenario = {
  id: string;
  label: string;
  penaltyCostCop: number;
  vipNetGainCop: number;
  itineraryPatch?: Record<string, unknown>;
};

/**
 * Selecciona escenario óptimo: maximiza ganancia neta − penalidad.
 */
export function pickOptimalOverrideScenario(
  scenarios: OverrideScenario[],
): OverrideScenario | null {
  if (!scenarios.length) return null;
  let best = scenarios[0]!;
  let bestScore = best.vipNetGainCop - best.penaltyCostCop;
  for (let i = 1; i < scenarios.length; i++) {
    const s = scenarios[i]!;
    const score = s.vipNetGainCop - s.penaltyCostCop;
    if (score > bestScore) {
      best = s;
      bestScore = score;
    }
  }
  return best;
}

export const ResolverOverrideSchema = z.object({
  overrideId: z.string().min(1).optional(),
  title: z.string().min(3).optional(),
  tripId: z.string().optional(),
  dealId: z.string().optional(),
  /** Si omitido, se elige el óptimo automáticamente */
  selectedScenarioId: z.string().optional(),
  autoPickOptimal: z.boolean().default(true),
  scenarios: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        penaltyCostCop: z.number().nonnegative(),
        vipNetGainCop: z.number(),
        itineraryPatch: z.record(z.unknown()).optional(),
      }),
    )
    .min(2)
    .optional(),
  resolutionNotes: z.string().optional(),
  reject: z.boolean().default(false),
});
export type ResolverOverrideDto = z.infer<typeof ResolverOverrideSchema>;

export const FirmarPinSchema = z.object({
  approvalId: z.string().min(1),
  /** PIN de 6 dígitos — obligatorio */
  pin: z.string().optional(),
  approve: z.boolean().default(true),
  rejectReason: z.string().optional(),
});
export type FirmarPinDto = z.infer<typeof FirmarPinSchema>;

export const CreateApprovalSchema = z.object({
  kind: z.enum([
    "NOMINA",
    "COMPRA_PESADA",
    "CONTRATO",
    "PAGO",
    "EXCEPCION",
    "OVERRIDE",
  ]),
  title: z.string().min(3),
  amountCop: z.number().nonnegative().default(0),
  cashflowImpactCop: z.number().default(0),
  payload: z.record(z.unknown()).optional(),
});
export type CreateApprovalDto = z.infer<typeof CreateApprovalSchema>;
