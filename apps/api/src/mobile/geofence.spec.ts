import {
  distanceToPolylineMeters,
  evaluateTripControl,
  haversineMeters,
  isWithinGeofence,
  isWithinTimeWindow,
  lateStartMinutes,
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

  it("mide la distancia al corredor y el atraso de salida", () => {
    const line = [
      { lat: 4.7, lng: -74.1 },
      { lat: 4.71, lng: -74.1 },
    ];
    const onLine = distanceToPolylineMeters({ lat: 4.705, lng: -74.1 }, line);
    expect(onLine).not.toBeNull();
    expect(onLine!).toBeLessThan(200);
    const off = distanceToPolylineMeters({ lat: 4.705, lng: -74.08 }, line);
    expect(off!).toBeGreaterThan(200);

    const depart = new Date("2026-10-09T12:00:00.000Z");
    expect(
      lateStartMinutes(depart, null, new Date("2026-10-09T12:20:00.000Z")),
    ).toBeNull();
    expect(
      lateStartMinutes(depart, null, new Date("2026-10-09T12:40:00.000Z")),
    ).toBeGreaterThan(30);
    expect(
      lateStartMinutes(
        depart,
        new Date("2026-10-09T12:10:00.000Z"),
        new Date("2026-10-09T13:00:00.000Z"),
      ),
    ).toBeNull();
  });
});
