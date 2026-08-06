import {
  calculateServiceOvertime,
  DEFAULT_OVERTIME_FACTORS,
  hourlyRateFromBase,
  isNightInstant,
} from "./overtime-engine";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

function loadCsvFactors() {
  const candidates = [
    join(process.cwd(), "Modulo_Horas_extras_Proyecto_CRM.csv"),
    join(process.cwd(), "..", "..", "Modulo_Horas_extras_Proyecto_CRM.csv"),
    join(
      __dirname,
      "..",
      "..",
      "..",
      "..",
      "..",
      "Modulo_Horas_extras_Proyecto_CRM.csv",
    ),
  ];
  const csvPath = candidates.find((p) => existsSync(p));
  if (!csvPath) throw new Error("CSV Modulo_Horas_extras no encontrado");
  const raw = readFileSync(csvPath, "utf8");
  const map = new Map<string, number>();
  for (const line of raw.split(/\r?\n/)) {
    const [k, v] = line.split(",");
    if (!k || v == null || v.startsWith("=")) continue;
    const n = Number(v);
    if (!Number.isNaN(n)) map.set(k.trim(), n);
  }
  return map;
}

describe("overtime-engine (Modulo_Horas_extras_Proyecto_CRM.csv)", () => {
  const hourly = hourlyRateFromBase(1_423_500, 230);
  const csv = loadCsvFactors();

  it("CSV: salario base 1.423.500 y factores RN/HED/HEN/…", () => {
    expect(csv.get("Salario base")).toBe(1_423_500);
    expect(csv.get("RN")).toBe(0.35);
    expect(csv.get("HED")).toBe(1.25);
    expect(csv.get("HEN")).toBe(1.75);
    expect(csv.get("ROD FEST")).toBe(1.75);
    expect(csv.get("HEDF")).toBe(2);
    expect(csv.get("HENF")).toBe(2.5);
    expect(csv.get("RNF")).toBe(1.1);
    expect(csv.get("Jornada semanal ley")).toBe(42);
    expect(csv.get("Divisor mensual horas")).toBe(230);
  });

  it("hora salario base Excel C53/30/7.666… ≈ 6189.13", () => {
    const excelHourly = 1_423_500 / 30 / 7.66666666666666;
    expect(hourly).toBeCloseTo(excelHourly, 5);
    expect(hourly).toBeCloseTo(6189.130434782614, 5);
  });

  it("factores motor = CSV", () => {
    expect(DEFAULT_OVERTIME_FACTORS.rnFactor).toBe(csv.get("RN"));
    expect(DEFAULT_OVERTIME_FACTORS.hedFactor).toBe(csv.get("HED"));
    expect(DEFAULT_OVERTIME_FACTORS.henFactor).toBe(csv.get("HEN"));
    expect(DEFAULT_OVERTIME_FACTORS.hedfFactor).toBe(csv.get("HEDF"));
    expect(DEFAULT_OVERTIME_FACTORS.henfFactor).toBe(csv.get("HENF"));
    expect(DEFAULT_OVERTIME_FACTORS.rnfFactor).toBe(csv.get("RNF"));
    expect(DEFAULT_OVERTIME_FACTORS.rodFestFactor).toBe(csv.get("ROD FEST"));
  });

  it("turno 8am–9pm con ordinaryDayHours=4: 4h ordinarias + HED + RN desde 21:00", () => {
    const start = new Date("2026-07-08T08:00:00");
    const end = new Date("2026-07-08T21:30:00");
    const r = calculateServiceOvertime(start, end, { ordinaryDayHours: 4 });

    expect(r.ordinaryHours).toBeCloseTo(4, 2);
    expect(r.hedHours).toBeGreaterThan(8);
    expect(r.rnHours + r.henHours).toBeGreaterThan(0.4);
    expect(isNightInstant(new Date("2026-07-08T21:00:00"))).toBe(true);
    expect(r.hourlyRate).toBeCloseTo(6189.13, 1);
    expect(r.totalAmount).toBeGreaterThan(0);
  });

  it("turno 8am–9pm (fin 21:00) weekday: 8h ordinarias + extras diurnas", () => {
    const start = new Date("2026-07-08T08:00:00");
    const end = new Date("2026-07-08T21:00:00");
    const r = calculateServiceOvertime(start, end, { ordinaryDayHours: 8 });
    expect(r.totalHours).toBeCloseTo(13, 2);
    expect(r.ordinaryHours).toBeCloseTo(8, 2);
    expect(r.hedHours).toBeCloseTo(5, 2);
    expect(r.rnHours).toBeCloseTo(0, 2);
    expect(r.hedAmount).toBeCloseTo(5 * hourly * 1.25, 0);
  });

  it("dominical nocturno aplica HENF", () => {
    const start = new Date("2026-07-05T22:00:00");
    const end = new Date("2026-07-05T23:00:00");
    const r = calculateServiceOvertime(start, end, { ordinaryDayHours: 0 });
    expect(r.henfHours).toBeCloseTo(1, 2);
    expect(r.henfAmount).toBeCloseTo(1 * hourly * 2.5, 0);
  });
});
