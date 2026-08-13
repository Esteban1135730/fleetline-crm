import { HARD_RULES } from "@fsg/shared";
import {
  evaluateDispatchFatigue,
  evaluateLegalRestHours,
} from "./dto/despacho.dto";

describe("Hard-Stop descanso legal PESV (Micro-Dispatch)", () => {
  const departAt = new Date("2026-08-12T14:00:00.000Z");

  it("rebota si el descanso es menor a 8 horas reglamentarias", () => {
    const lastDutyEndedAt = new Date("2026-08-12T08:00:00.000Z"); // 6h rest
    const result = evaluateLegalRestHours({ lastDutyEndedAt, departAt });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("DRIVER_LEGAL_REST_VIOLATION");
    expect(result.restHours).toBeLessThan(HARD_RULES.MIN_LEGAL_REST_HOURS);
    expect(result.message).toMatch(/Hard-Stop PESV/);
  });

  it("permite asignación con ≥ 8h de descanso", () => {
    const lastDutyEndedAt = new Date("2026-08-12T05:00:00.000Z"); // 9h rest
    const result = evaluateLegalRestHours({ lastDutyEndedAt, departAt });
    expect(result.ok).toBe(true);
    expect(result.restHours).toBeGreaterThanOrEqual(
      HARD_RULES.MIN_LEGAL_REST_HOURS,
    );
  });

  it("permite si no hay turno previo (sin historial)", () => {
    const result = evaluateLegalRestHours({
      lastDutyEndedAt: null,
      departAt,
    });
    expect(result.ok).toBe(true);
  });
});

describe("Hard-Stop fatiga Micro-Dispatch (< 30 pts)", () => {
  it("bloquea fatiga ≥ DISPATCH_FATIGUE_MAX", () => {
    const r = evaluateDispatchFatigue(30);
    expect(r.ok).toBe(false);
    expect(r.code).toBe("DRIVER_FATIGUE_DISPATCH");
  });

  it("permite fatiga bajo el umbral de despacho", () => {
    expect(evaluateDispatchFatigue(29).ok).toBe(true);
  });
});
