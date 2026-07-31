export type ShiftSegment = {
  checkInAt: Date;
  checkOutAt: Date;
};

export type PayrollLineCalcInput = {
  employeeId: string;
  driverId?: string | null;
  baseSalary: number;
  hourlyRate: number;
  shifts: ShiftSegment[];
  completedTrips: number;
  commissionPerTrip: number;
  overtimeMultiplier: number;
  nightMultiplier: number;
  ordinaryDayHours: number;
};

export type PayrollLineBreakdown = {
  employeeId: string;
  driverId: string | null;
  baseSalary: number;
  ordinaryHours: number;
  overtimeHours: number;
  overtimeAmount: number;
  nightHours: number;
  nightAmount: number;
  completedTrips: number;
  tripCommissions: number;
  grossTotal: number;
};

const NIGHT_START = 21; // 21:00
const NIGHT_END = 6; // 06:00

function isNightHour(date: Date): boolean {
  const h = date.getHours();
  return h >= NIGHT_START || h < NIGHT_END;
}

/** Desglosa un segmento en horas nocturnas vs diurnas (pasos de 15 min). */
export function splitNightHours(from: Date, to: Date): {
  totalHours: number;
  nightHours: number;
} {
  if (to <= from) return { totalHours: 0, nightHours: 0 };
  const stepMs = 15 * 60 * 1000;
  let total = 0;
  let night = 0;
  for (let t = from.getTime(); t < to.getTime(); t += stepMs) {
    const slice = Math.min(stepMs, to.getTime() - t) / (1000 * 60 * 60);
    total += slice;
    if (isNightHour(new Date(t))) night += slice;
  }
  return { totalHours: total, nightHours: night };
}

/**
 * Liquidación pura: base + overtime + nocturno + comisión por viaje.
 */
export function calculatePayrollLine(
  input: PayrollLineCalcInput,
): PayrollLineBreakdown {
  let totalHours = 0;
  let nightHours = 0;

  for (const s of input.shifts) {
    const split = splitNightHours(s.checkInAt, s.checkOutAt);
    totalHours += split.totalHours;
    nightHours += split.nightHours;
  }

  const dayBuckets = new Map<string, number>();
  for (const s of input.shifts) {
    const key = s.checkInAt.toISOString().slice(0, 10);
    const hrs = (s.checkOutAt.getTime() - s.checkInAt.getTime()) / 3_600_000;
    dayBuckets.set(key, (dayBuckets.get(key) || 0) + Math.max(0, hrs));
  }

  let overtimeHours = 0;
  let ordinaryHours = 0;
  for (const hrs of dayBuckets.values()) {
    ordinaryHours += Math.min(hrs, input.ordinaryDayHours);
    overtimeHours += Math.max(0, hrs - input.ordinaryDayHours);
  }

  // Ajuste: nocturno no se resta de overtime; se paga como recargo adicional
  const hourly = Number(input.hourlyRate) || 0;
  const overtimeAmount = overtimeHours * hourly * input.overtimeMultiplier;
  const nightAmount = nightHours * hourly * (input.nightMultiplier - 1);
  const tripCommissions =
    (Number(input.completedTrips) || 0) * input.commissionPerTrip;
  const baseSalary = Number(input.baseSalary) || 0;
  const grossTotal =
    baseSalary + overtimeAmount + nightAmount + tripCommissions;

  return {
    employeeId: input.employeeId,
    driverId: input.driverId ?? null,
    baseSalary,
    ordinaryHours: Math.round(ordinaryHours * 100) / 100,
    overtimeHours: Math.round(overtimeHours * 100) / 100,
    overtimeAmount: Math.round(overtimeAmount * 100) / 100,
    nightHours: Math.round(nightHours * 100) / 100,
    nightAmount: Math.round(nightAmount * 100) / 100,
    completedTrips: input.completedTrips,
    tripCommissions: Math.round(tripCommissions * 100) / 100,
    grossTotal: Math.round(grossTotal * 100) / 100,
  };
}
