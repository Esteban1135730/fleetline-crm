/** Festivos Colombia con nombre (Ley Emiliani / puentes). Domingos = festivo laboral. */

export type CoHoliday = { date: string; name: string };

const NAMED: Record<string, string> = {
  "2026-01-01": "Año Nuevo",
  "2026-01-12": "Reyes Magos",
  "2026-03-23": "San José",
  "2026-04-02": "Jueves Santo",
  "2026-04-03": "Viernes Santo",
  "2026-05-01": "Día del Trabajo",
  "2026-05-18": "Ascensión del Señor",
  "2026-06-08": "Corpus Christi",
  "2026-06-15": "Sagrado Corazón",
  "2026-06-29": "San Pedro y San Pablo",
  "2026-07-20": "Independencia de Colombia",
  "2026-08-07": "Batalla de Boyacá",
  "2026-08-15": "La Asunción de la Virgen",
  "2026-08-17": "La Asunción de la Virgen",
  "2026-10-12": "Día de la Raza",
  "2026-11-02": "Todos los Santos",
  "2026-11-16": "Independencia de Cartagena",
  "2026-12-08": "Inmaculada Concepción",
  "2026-12-25": "Navidad",
};

function dateKey(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function colombianHolidayName(
  year: number,
  month: number,
  day: number,
): string | null {
  const key = dateKey(year, month, day);
  if (NAMED[key]) return NAMED[key];
  const dt = new Date(year, month - 1, day);
  if (dt.getDay() === 0) return "Domingo";
  return null;
}

export function isColombianHolidayDay(
  year: number,
  month: number,
  day: number,
): boolean {
  return colombianHolidayName(year, month, day) != null;
}
