export const PESV_WEIGHTS = {
  riskMatrix: 0.3,
  trainings: 0.25,
  drills: 0.2,
  preops: 0.25,
} as const;

export type PesvScorecardInput = {
  riskControlsTotal: number;
  riskControlsCompliant: number;
  driversTotal: number;
  driversWithValidTraining: number;
  drillsScheduled: number;
  drillsCompleted: number;
  preopsTotal: number;
  preopsApproved: number;
};

export type PesvPillarScore = {
  key: keyof typeof PESV_WEIGHTS;
  label: string;
  weight: number;
  ratio: number;
  score: number;
  numerator: number;
  denominator: number;
};

export type PesvScorecardResult = {
  overallScore: number;
  systemStatus: "NOMINAL" | "ALERT" | "CRITICAL";
  pillars: PesvPillarScore[];
  regulatorLabel: string;
};

function ratio(num: number, den: number): number {
  if (den <= 0) return den === 0 && num === 0 ? 1 : 0;
  return Math.min(1, Math.max(0, num / den));
}

/**
 * Scorecard PESV / ISO 39001 — cumplimiento para Supertransporte / Mintransporte.
 */
export function calculatePesvScorecard(
  input: PesvScorecardInput,
): PesvScorecardResult {
  const pillars: PesvPillarScore[] = [
    {
      key: "riskMatrix",
      label: "Matriz de riesgos PESV",
      weight: PESV_WEIGHTS.riskMatrix,
      numerator: input.riskControlsCompliant,
      denominator: input.riskControlsTotal,
      ratio: ratio(input.riskControlsCompliant, input.riskControlsTotal),
      score: 0,
    },
    {
      key: "trainings",
      label: "Capacitaciones conductores",
      weight: PESV_WEIGHTS.trainings,
      numerator: input.driversWithValidTraining,
      denominator: input.driversTotal,
      ratio: ratio(input.driversWithValidTraining, input.driversTotal),
      score: 0,
    },
    {
      key: "drills",
      label: "Simulacros de seguridad vial",
      weight: PESV_WEIGHTS.drills,
      numerator: input.drillsCompleted,
      denominator: input.drillsScheduled,
      ratio: ratio(input.drillsCompleted, input.drillsScheduled),
      score: 0,
    },
    {
      key: "preops",
      label: "Revisiones preoperacionales",
      weight: PESV_WEIGHTS.preops,
      numerator: input.preopsApproved,
      denominator: input.preopsTotal,
      ratio: ratio(input.preopsApproved, input.preopsTotal),
      score: 0,
    },
  ];

  for (const p of pillars) {
    p.score = Math.round(p.ratio * 1000) / 10;
  }

  const overall =
    Math.round(
      pillars.reduce((acc, p) => acc + p.ratio * p.weight, 0) * 1000,
    ) / 10;

  let systemStatus: PesvScorecardResult["systemStatus"] = "NOMINAL";
  if (overall < 70) systemStatus = "CRITICAL";
  else if (overall < 85) systemStatus = "ALERT";

  return {
    overallScore: overall,
    systemStatus,
    pillars,
    regulatorLabel:
      "PESV / ISO 39001 — reporte de cumplimiento seguridad vial (Supertransporte / Mintransporte)",
  };
}

export const HQSE_AUTO_BLOCK_SEVERITIES = new Set(["SEVERE", "CRITICAL"]);
export const HQSE_DRIVER_BLOCK_REASON = "HQSE_REEVALUATION_REQUIRED";
export const HQSE_VEHICLE_BLOCK_REASON = "HQSE_INCIDENT_SEVERE";
