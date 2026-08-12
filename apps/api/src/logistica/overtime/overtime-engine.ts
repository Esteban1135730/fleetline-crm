/**
 * Motor de liquidación horas extras — `Modulo_Horas_extras_Proyecto_CRM.csv`
 * (origen: hoja "Modulo Horas extras" / Proyecto CRM.xlsx)
 *
 * Salario base default $1.423.500
 * Hora base = salario / 30 / 7.666… = salario / 230 ≈ $6.189,13/hr
 * Jornada ordinaria: 42h semanales (Ley colombiana)
 * Franjas: diurna 06:00–21:00 | nocturna 21:00–06:00
 */

export type OvertimeFactors = {
  baseSalary: number;
  monthlyHoursDivisor: number;
  weeklyOrdinaryHours: number;
  /** Horas ordinarias diarias de referencia (42/5 ≈ 8.4; tests pueden usar 4 u 8) */
  ordinaryDayHours: number;
  rnFactor: number;
  hedFactor: number;
  henFactor: number;
  rodFestFactor: number;
  hedfFactor: number;
  henfFactor: number;
  rnfFactor: number;
};

export const DEFAULT_OVERTIME_FACTORS: OvertimeFactors = {
  baseSalary: 1_423_500,
  monthlyHoursDivisor: 230,
  weeklyOrdinaryHours: 42,
  ordinaryDayHours: 8,
  rnFactor: 0.35,
  hedFactor: 1.25,
  henFactor: 1.75,
  rodFestFactor: 1.75,
  hedfFactor: 2.0,
  henfFactor: 2.5,
  rnfFactor: 1.1,
};

export function hourlyRateFromBase(
  baseSalary: number,
  divisor = 230,
): number {
  return baseSalary / divisor;
}

/** Filas del tarifario de recargos (tabla liquidación CO) */
export type TarifarioConcepto = {
  sigla: string;
  concepto: string;
  factor: number;
  valor: number;
};

export function buildTarifarioRows(
  hourlyRate: number,
  factors: Pick<
    OvertimeFactors,
    | "rnFactor"
    | "hedFactor"
    | "henFactor"
    | "rodFestFactor"
    | "hedfFactor"
    | "henfFactor"
    | "rnfFactor"
  > = DEFAULT_OVERTIME_FACTORS,
): TarifarioConcepto[] {
  const row = (sigla: string, concepto: string, factor: number) => ({
    sigla,
    concepto,
    factor,
    valor: Math.round(hourlyRate * factor),
  });
  return [
    row("RN", "Recargo Nocturno", factors.rnFactor),
    row("HED", "Hora Extra Diurna", factors.hedFactor),
    row("HEN", "Hora Extra Nocturna", factors.henFactor),
    row("ROD FEST", "Recargo Ordinario Dominical / Festivo", factors.rodFestFactor),
    row("HEDF", "Hora Extra Diurna Dominical / Festiva", factors.hedfFactor),
    row("HENF", "Hora Extra Nocturna Dominical / Festiva", factors.henfFactor),
    row("RNF", "Recargo Nocturno Festivo", factors.rnfFactor),
  ];
}

/** Festivos Colombia 2026 (fijos + puente típicos usados en liquidación demo) */
const CO_HOLIDAYS_2026 = new Set([
  "2026-01-01",
  "2026-01-12",
  "2026-03-23",
  "2026-04-02",
  "2026-04-03",
  "2026-05-01",
  "2026-05-18",
  "2026-06-08",
  "2026-06-15",
  "2026-06-29",
  "2026-07-20",
  "2026-08-07",
  "2026-08-17",
  "2026-10-12",
  "2026-11-02",
  "2026-11-16",
  "2026-12-08",
  "2026-12-25",
]);

export function isColombianHoliday(d: Date): boolean {
  const key = toDateKey(d);
  if (CO_HOLIDAYS_2026.has(key)) return true;
  // Domingos también se tratan como festivos para ROD/HEDF/HENF
  return d.getDay() === 0;
}

export function isSunday(d: Date): boolean {
  return d.getDay() === 0;
}

export function isNightInstant(d: Date): boolean {
  const h = d.getHours();
  return h >= 21 || h < 6;
}

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export type MinuteBucket = {
  at: Date;
  night: boolean;
  festivo: boolean;
};

/** Clasifica minuto a minuto el intervalo [start, end). */
export function classifyMinutes(start: Date, end: Date): MinuteBucket[] {
  const out: MinuteBucket[] = [];
  if (end <= start) return out;
  const step = 60_000;
  for (let t = start.getTime(); t < end.getTime(); t += step) {
    const at = new Date(t);
    out.push({
      at,
      night: isNightInstant(at),
      festivo: isColombianHoliday(at),
    });
  }
  return out;
}

export type OvertimeBreakdown = {
  totalHours: number;
  ordinaryHours: number;
  /** Recargo nocturno ordinario (RN) — horas nocturnas dentro de jornada */
  rnHours: number;
  hedHours: number;
  henHours: number;
  rodFestHours: number;
  hedfHours: number;
  henfHours: number;
  rnfHours: number;
  hourlyRate: number;
  rnAmount: number;
  hedAmount: number;
  henAmount: number;
  rodFestAmount: number;
  hedfAmount: number;
  henfAmount: number;
  rnfAmount: number;
  totalAmount: number;
  factors: OvertimeFactors;
};

/**
 * Calcula extras de un servicio (inicio/fin reales).
 * Primero asigna hasta `ordinaryDayHours` como ordinarias (con RN/RNF si aplica);
 * el remanente se clasifica como HED/HEN/HEDF/HENF/ROD.
 */
export function calculateServiceOvertime(
  start: Date,
  end: Date,
  factors: Partial<OvertimeFactors> = {},
  /** Horas ordinarias ya consumidas en la semana (para tope 42h) */
  weeklyOrdinaryAlready = 0,
): OvertimeBreakdown {
  const f: OvertimeFactors = { ...DEFAULT_OVERTIME_FACTORS, ...factors };
  const hourly = hourlyRateFromBase(f.baseSalary, f.monthlyHoursDivisor);
  const minutes = classifyMinutes(start, end);
  const totalHours = minutes.length / 60;

  const weeklyRoom = Math.max(0, f.weeklyOrdinaryHours - weeklyOrdinaryAlready);
  const ordinaryCap = Math.min(f.ordinaryDayHours, weeklyRoom);

  let ordinaryMinutes = 0;
  let rnMin = 0;
  let rnfMin = 0;
  let hedMin = 0;
  let henMin = 0;
  let rodMin = 0;
  let hedfMin = 0;
  let henfMin = 0;

  for (const m of minutes) {
    const stillOrdinary = ordinaryMinutes / 60 < ordinaryCap;
    if (stillOrdinary) {
      ordinaryMinutes += 1;
      if (m.night && m.festivo) rnfMin += 1;
      else if (m.night) rnMin += 1;
      else if (m.festivo) rodMin += 1; // recargo dominical sobre jornada
      continue;
    }
    // Extra
    if (m.festivo && m.night) henfMin += 1;
    else if (m.festivo && !m.night) hedfMin += 1;
    else if (!m.festivo && m.night) henMin += 1;
    else hedMin += 1;
  }

  const toH = (min: number) => Math.round((min / 60) * 1000) / 1000;
  const rnHours = toH(rnMin);
  const rnfHours = toH(rnfMin);
  const hedHours = toH(hedMin);
  const henHours = toH(henMin);
  const rodFestHours = toH(rodMin);
  const hedfHours = toH(hedfMin);
  const henfHours = toH(henfMin);
  const ordinaryHours = toH(ordinaryMinutes);

  const rnAmount = round2(rnHours * hourly * f.rnFactor);
  const rnfAmount = round2(rnfHours * hourly * f.rnfFactor);
  const hedAmount = round2(hedHours * hourly * f.hedFactor);
  const henAmount = round2(henHours * hourly * f.henFactor);
  const rodFestAmount = round2(rodFestHours * hourly * f.rodFestFactor);
  const hedfAmount = round2(hedfHours * hourly * f.hedfFactor);
  const henfAmount = round2(henfHours * hourly * f.henfFactor);
  const totalAmount = round2(
    rnAmount +
      rnfAmount +
      hedAmount +
      henAmount +
      rodFestAmount +
      hedfAmount +
      henfAmount,
  );

  return {
    totalHours: Math.round(totalHours * 1000) / 1000,
    ordinaryHours,
    rnHours,
    hedHours,
    henHours,
    rodFestHours,
    hedfHours,
    henfHours,
    rnfHours,
    hourlyRate: hourly,
    rnAmount,
    hedAmount,
    henAmount,
    rodFestAmount,
    hedfAmount,
    henfAmount,
    rnfAmount,
    totalAmount,
    factors: f,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Geometría simple Bogotá para ruta sugerida (fallback si OSRM no responde).
 * @deprecated Preferir fetchDrivingRoute en routing/osrm.route.ts
 */
export function suggestedRoutePolyline(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
): Array<{ lat: number; lng: number }> {
  const midLat = (originLat + destLat) / 2 + 0.01;
  const midLng = (originLng + destLng) / 2 - 0.008;
  return [
    { lat: originLat, lng: originLng },
    { lat: midLat, lng: midLng },
    { lat: destLat, lng: destLng },
  ];
}
