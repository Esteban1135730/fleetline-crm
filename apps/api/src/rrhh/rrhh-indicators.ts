export type IndicatorLevel = "GREEN" | "AMBER" | "RED" | "N_A";

export const MEDICAL_EXAM_SLOT_KEY = "EXAMEN_MEDICO";
export const MEDICAL_EXAM_ALERT_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export type MedicalExamState =
  | "VIGENTE"
  | "POR_VENCER"
  | "VENCIDO"
  | "SIN_FECHA"
  | "SIN_EXAMEN"
  | "NO_REQUERIDO";

export type MedicalExamIndicator = {
  state: MedicalExamState;
  level: IndicatorLevel;
  expiresAt: Date | null;
  uploadedAt: Date | null;
  required: boolean;
};

/** Vigencia del certificado de aptitud médica (slot EXAMEN_MEDICO del expediente). */
export function medicalExamIndicator(input: {
  required: boolean;
  document: { expiresAt: Date | null; createdAt: Date } | null;
  now?: Date;
}): MedicalExamIndicator {
  const { required, document } = input;
  const now = input.now ?? new Date();
  const base = {
    required,
    expiresAt: document?.expiresAt ?? null,
    uploadedAt: document?.createdAt ?? null,
  };
  if (!document) {
    return required
      ? { ...base, state: "SIN_EXAMEN", level: "RED" }
      : { ...base, state: "NO_REQUERIDO", level: "N_A" };
  }
  if (!document.expiresAt) return { ...base, state: "SIN_FECHA", level: "N_A" };
  const days = (document.expiresAt.getTime() - now.getTime()) / DAY_MS;
  if (days <= 0) return { ...base, state: "VENCIDO", level: "RED" };
  if (days <= MEDICAL_EXAM_ALERT_DAYS) {
    return { ...base, state: "POR_VENCER", level: "AMBER" };
  }
  return { ...base, state: "VIGENTE", level: "GREEN" };
}

export type HealthState = "INCAPACIDAD" | "SIN_NOVEDAD" | "INACTIVO";

export type HealthIndicator = {
  state: HealthState;
  level: IndicatorLevel;
  source: "NOVEDAD" | "ESTADO_EXPEDIENTE" | null;
  until: Date | null;
};

/**
 * Estado de salud registrado: novedad de incapacidad vigente del conductor
 * vinculado o estado MEDICAL del expediente.
 */
export function healthIndicator(input: {
  employeeStatus: string;
  activeIncapacity: { dateTo: Date } | null;
}): HealthIndicator {
  if (input.employeeStatus === "INACTIVE") {
    return { state: "INACTIVO", level: "N_A", source: null, until: null };
  }
  if (input.activeIncapacity) {
    return {
      state: "INCAPACIDAD",
      level: "RED",
      source: "NOVEDAD",
      until: input.activeIncapacity.dateTo,
    };
  }
  if (input.employeeStatus === "MEDICAL") {
    return {
      state: "INCAPACIDAD",
      level: "RED",
      source: "ESTADO_EXPEDIENTE",
      until: null,
    };
  }
  return { state: "SIN_NOVEDAD", level: "GREEN", source: null, until: null };
}

export type AbsenteeismIndicator = {
  ratePct: number | null;
  absenceDays: number;
  plannedDays: number;
  population: number;
  periodStart: Date;
  periodEnd: Date;
};

/**
 * Tasa de ausentismo = días de ausencia no programada (intervalos fusionados
 * por conductor, recortados al periodo) / (población × días del periodo).
 */
export function absenteeismIndicator(input: {
  novelties: Array<{ driverId: string; dateFrom: Date; dateTo: Date }>;
  population: number;
  periodStart: Date;
  periodEnd: Date;
}): AbsenteeismIndicator {
  const { population, periodStart, periodEnd } = input;
  const periodDays = Math.max(
    0,
    (periodEnd.getTime() - periodStart.getTime()) / DAY_MS,
  );
  const plannedDays = population * periodDays;

  const byDriver = new Map<string, Array<[number, number]>>();
  for (const n of input.novelties) {
    const from = Math.max(n.dateFrom.getTime(), periodStart.getTime());
    const to = Math.min(n.dateTo.getTime(), periodEnd.getTime());
    if (to <= from) continue;
    const list = byDriver.get(n.driverId) ?? [];
    list.push([from, to]);
    byDriver.set(n.driverId, list);
  }

  let absentMs = 0;
  for (const intervals of byDriver.values()) {
    intervals.sort((a, b) => a[0] - b[0]);
    let [curFrom, curTo] = intervals[0];
    for (const [from, to] of intervals.slice(1)) {
      if (from <= curTo) {
        curTo = Math.max(curTo, to);
      } else {
        absentMs += curTo - curFrom;
        [curFrom, curTo] = [from, to];
      }
    }
    absentMs += curTo - curFrom;
  }

  const absenceDays = Math.round((absentMs / DAY_MS) * 10) / 10;
  const ratePct =
    plannedDays > 0
      ? Math.round(((absentMs / DAY_MS) / plannedDays) * 1000) / 10
      : null;

  return {
    ratePct,
    absenceDays,
    plannedDays: Math.round(plannedDays * 10) / 10,
    population,
    periodStart,
    periodEnd,
  };
}
