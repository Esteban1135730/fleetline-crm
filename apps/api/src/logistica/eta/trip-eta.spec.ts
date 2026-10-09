import { computeTripEta, type EtaTrackPoint } from "./trip-eta.calc";

const NOW = new Date("2026-10-09T15:00:00.000Z");
const ARRIVE = new Date("2026-10-09T15:30:00.000Z");
/** Ruta recta norte→sur ~11 km (0.1° lat). */
const ROUTE = Array.from({ length: 11 }, (_, i) => ({
  lat: 4.7 - i * 0.01,
  lng: -74.07,
}));
const DEST = ROUTE[ROUTE.length - 1];

function pointsAt(speedKph: number, count: number, endMinAgo = 0): EtaTrackPoint[] {
  return Array.from({ length: count }, (_, i) => ({
    lat: 4.7,
    lng: -74.07,
    speedKph,
    recordedAt: new Date(NOW.getTime() - (endMinAgo + (count - 1 - i)) * 60_000),
  }));
}

const base = {
  now: NOW,
  status: "IN_TRANSIT",
  scheduledArriveAt: ARRIVE,
  destination: DEST,
  suggestedRoute: ROUTE,
};

describe("computeTripEta", () => {
  it("calcula ETA por ruta con la velocidad media reciente", () => {
    const eta = computeTripEta({ ...base, points: pointsAt(60, 3) });
    expect(eta.available).toBe(true);
    if (!eta.available) return;
    expect(eta.distanceBasis).toBe("ROUTE");
    expect(eta.avgSpeedKph).toBe(60);
    expect(eta.remainingKm).toBeGreaterThan(10);
    expect(eta.delayMinutes).toBeLessThan(0);
  });

  it("al bajar de 60 a 10 km/h el ETA y el atraso aumentan", () => {
    const fast = computeTripEta({ ...base, points: pointsAt(60, 6) });
    const slow = computeTripEta({ ...base, points: [...pointsAt(60, 6, 6), ...pointsAt(10, 6)] });
    expect(fast.available && slow.available).toBe(true);
    if (!fast.available || !slow.available) return;
    expect(slow.avgSpeedKph).toBe(10);
    expect(new Date(slow.etaAt).getTime()).toBeGreaterThan(new Date(fast.etaAt).getTime());
    expect(slow.delayMinutes!).toBeGreaterThan(fast.delayMinutes!);
  });

  it("sin puntos o con puntos viejos no hay ETA", () => {
    expect(computeTripEta({ ...base, points: [] })).toMatchObject({
      available: false,
      reason: "NO_RECENT_GPS",
    });
    expect(computeTripEta({ ...base, points: pointsAt(60, 3, 30) })).toMatchObject({
      available: false,
      reason: "NO_RECENT_GPS",
    });
  });

  it("descarta coordenadas inválidas y exige muestras de velocidad", () => {
    const invalid = [{ lat: 0, lng: 0, speedKph: 60, recordedAt: NOW }];
    expect(computeTripEta({ ...base, points: invalid })).toMatchObject({ reason: "NO_RECENT_GPS" });
    const single = [{ lat: 4.7, lng: -74.07, speedKph: null, recordedAt: NOW }];
    expect(computeTripEta({ ...base, points: single })).toMatchObject({ reason: "INSUFFICIENT_GPS" });
  });

  it("unidad detenida, sin destino o fuera de ruta", () => {
    expect(computeTripEta({ ...base, points: pointsAt(0, 3) })).toMatchObject({
      reason: "VEHICLE_STOPPED",
    });
    expect(
      computeTripEta({ ...base, destination: null, suggestedRoute: [], points: pointsAt(60, 3) }),
    ).toMatchObject({ reason: "NO_DESTINATION" });
    const far = pointsAt(60, 3).map((p) => ({ ...p, lat: 5.2 }));
    const eta = computeTripEta({ ...base, points: far });
    expect(eta.available && eta.distanceBasis).toBe("STRAIGHT_LINE");
  });

  it("solo aplica a viajes en ruta; sin hora prevista no hay atraso", () => {
    expect(computeTripEta({ ...base, status: "ASSIGNED", points: pointsAt(60, 3) })).toMatchObject({
      reason: "NOT_IN_TRANSIT",
    });
    const eta = computeTripEta({ ...base, scheduledArriveAt: null, points: pointsAt(60, 3) });
    expect(eta.available && eta.delayMinutes).toBeNull();
  });
});
