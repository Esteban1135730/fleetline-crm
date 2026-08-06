import {
  evaluateTripControl,
  haversineMeters,
  isWithinGeofence,
  isWithinTimeWindow,
} from "./geofence";

describe("geofence / control estricto", () => {
  const origin = { lat: 4.701, lng: -74.146 }; // El Dorado approx

  it("haversine cerca de 0 para el mismo punto", () => {
    expect(haversineMeters(origin, origin)).toBeLessThan(1);
  });

  it("rechaza punto fuera del radio", () => {
    const far = { lat: 4.75, lng: -74.05 };
    const geo = isWithinGeofence(far, origin, 300);
    expect(geo.ok).toBe(false);
    expect(geo.distanceM).toBeGreaterThan(300);
  });

  it("acepta punto dentro del radio", () => {
    const near = { lat: 4.7012, lng: -74.1461 };
    const geo = isWithinGeofence(near, origin, 300);
    expect(geo.ok).toBe(true);
  });

  it("rechaza horario fuera de tolerancia", () => {
    const scheduled = new Date("2026-08-06T10:00:00.000Z");
    const now = new Date("2026-08-06T12:00:00.000Z");
    const t = isWithinTimeWindow(now, scheduled, 30);
    expect(t.ok).toBe(false);
  });

  it("evaluateTripControl marca OUT_OF_GEOFENCE y OUT_OF_TIME_WINDOW", () => {
    const gate = evaluateTripControl({
      serverNow: new Date("2026-08-06T12:00:00.000Z"),
      gps: { lat: 4.8, lng: -74.0 },
      target: origin,
      scheduledAt: new Date("2026-08-06T10:00:00.000Z"),
      geofenceRadiusM: 200,
      timeToleranceMin: 15,
    });
    expect(gate.ok).toBe(false);
    const codes = gate.violations.map((v) => v.code);
    expect(codes).toContain("OUT_OF_GEOFENCE");
    expect(codes).toContain("OUT_OF_TIME_WINDOW");
  });

  it("pasa cuando GPS y hora están en tolerancia", () => {
    const gate = evaluateTripControl({
      serverNow: new Date("2026-08-06T10:05:00.000Z"),
      gps: { lat: 4.7011, lng: -74.14605 },
      target: origin,
      scheduledAt: new Date("2026-08-06T10:00:00.000Z"),
      geofenceRadiusM: 300,
      timeToleranceMin: 30,
    });
    expect(gate.ok).toBe(true);
    expect(gate.violations).toHaveLength(0);
  });
});
