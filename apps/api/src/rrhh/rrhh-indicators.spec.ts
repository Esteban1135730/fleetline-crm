import {
  absenteeismIndicator,
  healthIndicator,
  medicalExamIndicator,
} from "./rrhh-indicators";

const NOW = new Date("2026-10-13T12:00:00Z");
const day = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);

describe("medicalExamIndicator", () => {
  const doc = (expiresAt: Date | null) => ({ expiresAt, createdAt: day(-100) });

  it("vigente cuando vence en más de 30 días", () => {
    const r = medicalExamIndicator({ required: true, document: doc(day(90)), now: NOW });
    expect(r).toMatchObject({ state: "VIGENTE", level: "GREEN" });
  });

  it("próximo a vencer dentro de 30 días", () => {
    const r = medicalExamIndicator({ required: true, document: doc(day(10)), now: NOW });
    expect(r).toMatchObject({ state: "POR_VENCER", level: "AMBER" });
  });

  it("vencido cuando la fecha ya pasó", () => {
    const r = medicalExamIndicator({ required: true, document: doc(day(-1)), now: NOW });
    expect(r).toMatchObject({ state: "VENCIDO", level: "RED" });
  });

  it("sin fecha cuando el soporte no registra vencimiento", () => {
    const r = medicalExamIndicator({ required: true, document: doc(null), now: NOW });
    expect(r).toMatchObject({ state: "SIN_FECHA", level: "N_A" });
  });

  it("sin examen cuando el cargo lo exige y no hay soporte", () => {
    const r = medicalExamIndicator({ required: true, document: null, now: NOW });
    expect(r).toMatchObject({ state: "SIN_EXAMEN", level: "RED" });
  });

  it("no requerido cuando el cargo no lo exige", () => {
    const r = medicalExamIndicator({ required: false, document: null, now: NOW });
    expect(r).toMatchObject({ state: "NO_REQUERIDO", level: "N_A" });
  });
});

describe("healthIndicator", () => {
  it("incapacidad por novedad vigente", () => {
    const r = healthIndicator({
      employeeStatus: "ACTIVE",
      activeIncapacity: { dateTo: day(2) },
    });
    expect(r).toMatchObject({ state: "INCAPACIDAD", level: "RED", source: "NOVEDAD" });
  });

  it("incapacidad por estado MEDICAL del expediente", () => {
    const r = healthIndicator({ employeeStatus: "MEDICAL", activeIncapacity: null });
    expect(r).toMatchObject({ state: "INCAPACIDAD", source: "ESTADO_EXPEDIENTE" });
  });

  it("sin novedad", () => {
    const r = healthIndicator({ employeeStatus: "ACTIVE", activeIncapacity: null });
    expect(r).toMatchObject({ state: "SIN_NOVEDAD", level: "GREEN" });
  });

  it("inactivo sin semáforo", () => {
    const r = healthIndicator({ employeeStatus: "INACTIVE", activeIncapacity: null });
    expect(r).toMatchObject({ state: "INACTIVO", level: "N_A" });
  });
});

describe("absenteeismIndicator", () => {
  const periodStart = day(-10);
  const periodEnd = NOW;

  it("fusiona novedades solapadas y recorta al periodo", () => {
    const r = absenteeismIndicator({
      population: 2,
      periodStart,
      periodEnd,
      novelties: [
        { driverId: "a", dateFrom: day(-15), dateTo: day(-8) },
        { driverId: "a", dateFrom: day(-9), dateTo: day(-7) },
        { driverId: "b", dateFrom: day(-2), dateTo: day(5) },
      ],
    });
    expect(r.absenceDays).toBe(5);
    expect(r.plannedDays).toBe(20);
    expect(r.ratePct).toBe(25);
  });

  it("tasa nula sin población", () => {
    const r = absenteeismIndicator({ population: 0, periodStart, periodEnd, novelties: [] });
    expect(r.ratePct).toBeNull();
  });
});
