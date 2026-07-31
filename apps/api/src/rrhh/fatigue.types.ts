import { HARD_RULES } from "@fsg/shared";

export type FatigueHoursInput = {
  /** Horas del turno continuo actual (o recién cerrado) */
  continuousHours: number;
  /** Horas acumuladas en ventana 24h (incluye el turno actual) */
  dailyHours: number;
};

export type FatigueEvaluation = FatigueHoursInput & {
  continuousLimit: number;
  dailyLimit: number;
  continuousExceeded: boolean;
  dailyExceeded: boolean;
  fatigueExceeded: boolean;
  blockReason: "DRIVER_FATIGUE" | null;
  /** Score 0–100 alineado a Compliance Gate */
  fatigueScore: number;
};

/**
 * Evalúa umbrales legales de fatiga (>8h continuas o >12h diarias).
 */
export function evaluateFatigue(
  input: FatigueHoursInput,
  limits = {
    continuous: HARD_RULES.FATIGUE_CONTINUOUS_HOURS,
    daily: HARD_RULES.FATIGUE_DAILY_HOURS,
    blockScore: HARD_RULES.FATIGUE_BLOCK_SCORE,
  },
): FatigueEvaluation {
  const continuousHours = Math.max(0, Number(input.continuousHours) || 0);
  const dailyHours = Math.max(0, Number(input.dailyHours) || 0);
  const continuousExceeded = continuousHours > limits.continuous;
  const dailyExceeded = dailyHours > limits.daily;
  const fatigueExceeded = continuousExceeded || dailyExceeded;

  let fatigueScore = Math.min(
    100,
    Math.round(
      Math.max(
        (continuousHours / limits.continuous) * 70,
        (dailyHours / limits.daily) * 70,
      ),
    ),
  );
  if (fatigueExceeded) {
    fatigueScore = Math.max(fatigueScore, limits.blockScore);
  }

  return {
    continuousHours,
    dailyHours,
    continuousLimit: limits.continuous,
    dailyLimit: limits.daily,
    continuousExceeded,
    dailyExceeded,
    fatigueExceeded,
    blockReason: fatigueExceeded ? "DRIVER_FATIGUE" : null,
    fatigueScore,
  };
}

export function hoursBetween(from: Date, to: Date): number {
  return Math.max(0, (to.getTime() - from.getTime()) / (1000 * 60 * 60));
}
