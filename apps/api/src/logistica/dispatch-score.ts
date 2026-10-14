export const PROXIMITY_BONUS = 50;
export const FATIGUE_BONUS = 30;
export const PAPERS_BONUS = 20;
export const PROXIMITY_MAX_M = 5_000;

export type DispatchCandidateInput = {
  driverId: string;
  driverName: string;
  vehicleId: string;
  plate: string;
  /** Conductor sin fatiga de bloqueo y sin bloqueo de despacho. */
  fatigueOk: boolean;
  /** SOAT, tecnomecánica y licencia cubren la fecha del viaje. */
  papersOk: boolean;
  /** Null cuando no hay última posición GPS. */
  distanceM: number | null;
};

export type DispatchSuggestion = {
  driverId: string;
  driverName: string;
  vehicleId: string;
  plate: string;
  score: number;
  /** Cumple fatiga y papeles. Esos pasan delante aunque otro sume más por cercanía. */
  qualified: boolean;
  reasons: string[];
};

export function scoreDispatchCandidate(
  input: DispatchCandidateInput,
): DispatchSuggestion {
  const near =
    input.distanceM != null && input.distanceM <= PROXIMITY_MAX_M;
  const score =
    (near ? PROXIMITY_BONUS : 0) +
    (input.fatigueOk ? FATIGUE_BONUS : 0) +
    (input.papersOk ? PAPERS_BONUS : 0);

  const reasons: string[] = [];
  if (input.distanceM == null) {
    reasons.push("Sin posición GPS — cercanía en 0");
  } else if (near) {
    reasons.push(
      `A ${Math.round(input.distanceM)} m del origen (+${PROXIMITY_BONUS})`,
    );
  } else {
    reasons.push(
      `A ${(input.distanceM / 1000).toFixed(1)} km del origen — fuera de 5 km`,
    );
  }
  reasons.push(
    input.fatigueOk
      ? `Descanso en verde (+${FATIGUE_BONUS})`
      : "Fatiga o bloqueo de despacho",
  );
  reasons.push(
    input.papersOk
      ? `SOAT, tecnomecánica y licencia cubren la salida (+${PAPERS_BONUS})`
      : "Papeles no cubren la fecha del viaje",
  );

  return {
    driverId: input.driverId,
    driverName: input.driverName,
    vehicleId: input.vehicleId,
    plate: input.plate,
    score,
    qualified: input.fatigueOk && input.papersOk,
    reasons,
  };
}

/** Ganador y los dos siguientes. Quien no cumple fatiga o papeles no pasa delante de quien sí. */
export function rankDispatch(
  inputs: DispatchCandidateInput[],
  limit = 3,
): DispatchSuggestion[] {
  return inputs
    .map(scoreDispatchCandidate)
    .sort((a, b) => {
      if (a.qualified !== b.qualified) return a.qualified ? -1 : 1;
      if (b.score !== a.score) return b.score - a.score;
      return a.driverName.localeCompare(b.driverName, "es");
    })
    .slice(0, limit);
}
