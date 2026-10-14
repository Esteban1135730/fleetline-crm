/**
 * Geofencing + tolerancia horaria (reloj servidor).
 * Distancia Haversine en metros.
 */

export type LatLng = { lat: number; lng: number };

export const DEFAULT_GEOFENCE_RADIUS_M = Number(
  process.env.GEOFENCE_RADIUS_M || 300,
);
export const DEFAULT_TIME_TOLERANCE_MIN = Number(
  process.env.TRIP_TIME_TOLERANCE_MIN || 30,
);

const EARTH_RADIUS_M = 6_371_000;

export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isWithinGeofence(
  point: LatLng,
  center: LatLng | null | undefined,
  radiusM = DEFAULT_GEOFENCE_RADIUS_M,
): { ok: boolean; distanceM: number | null; skipped: boolean } {
  if (
    center == null ||
    center.lat == null ||
    center.lng == null ||
    Number.isNaN(center.lat) ||
    Number.isNaN(center.lng)
  ) {
    return { ok: true, distanceM: null, skipped: true };
  }
  const distanceM = haversineMeters(point, center);
  return { ok: distanceM <= radiusM, distanceM, skipped: false };
}

/** Distancia de un punto al segmento A–B, en metros (proyección local). */
export function distancePointToSegmentMeters(
  point: LatLng,
  a: LatLng,
  b: LatLng,
): number {
  const ab = haversineMeters(a, b);
  if (ab < 1) return haversineMeters(point, a);
  const bx =
    haversineMeters({ lat: a.lat, lng: a.lng }, { lat: a.lat, lng: b.lng }) *
    (b.lng >= a.lng ? 1 : -1);
  const by =
    haversineMeters({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: a.lng }) *
    (b.lat >= a.lat ? 1 : -1);
  const px =
    haversineMeters({ lat: a.lat, lng: a.lng }, { lat: a.lat, lng: point.lng }) *
    (point.lng >= a.lng ? 1 : -1);
  const py =
    haversineMeters({ lat: a.lat, lng: a.lng }, { lat: point.lat, lng: a.lng }) *
    (point.lat >= a.lat ? 1 : -1);
  const ab2 = bx * bx + by * by;
  const t = Math.max(0, Math.min(1, (px * bx + py * by) / ab2));
  return Math.hypot(px - t * bx, py - t * by);
}

/** Menor distancia del punto al corredor (polilínea). Null si no hay tramo. */
export function distanceToPolylineMeters(
  point: LatLng,
  line: LatLng[],
): number | null {
  if (line.length < 2) return null;
  let min = Number.POSITIVE_INFINITY;
  for (let i = 1; i < line.length; i++) {
    min = Math.min(min, distancePointToSegmentMeters(point, line[i - 1], line[i]));
  }
  return min;
}

export const CORRIDOR_RADIUS_M = 200;
export const LATE_START_MIN = 30;

/**
 * Minutos de atraso del inicio. Null si salió a tiempo o aún está dentro de la tolerancia.
 * Sin `startedAt`, compara contra `now` (el viaje no ha arrancado).
 */
export function lateStartMinutes(
  departAt: Date,
  startedAt: Date | null,
  now: Date,
  toleranceMin = LATE_START_MIN,
): number | null {
  const ref = startedAt ?? now;
  const delta = (ref.getTime() - departAt.getTime()) / 60_000;
  if (delta <= toleranceMin) return null;
  return delta;
}

export function isWithinTimeWindow(
  serverNow: Date,
  scheduledAt: Date | null | undefined,
  toleranceMin = DEFAULT_TIME_TOLERANCE_MIN,
): { ok: boolean; deltaMin: number | null; skipped: boolean } {
  if (!scheduledAt) {
    return { ok: true, deltaMin: null, skipped: true };
  }
  const deltaMin = Math.abs(serverNow.getTime() - scheduledAt.getTime()) / 60_000;
  return { ok: deltaMin <= toleranceMin, deltaMin, skipped: false };
}

export type GateViolationCode =
  | "OUT_OF_GEOFENCE"
  | "OUT_OF_TIME_WINDOW"
  | "MISSING_COORDS";

export type ControlGateResult = {
  ok: boolean;
  serverTime: Date;
  violations: Array<{ code: GateViolationCode; detail: string }>;
  distanceM: number | null;
  deltaMin: number | null;
  geofenceRadiusM: number;
  timeToleranceMin: number;
};

export function evaluateTripControl(input: {
  serverNow?: Date;
  gps: LatLng;
  target: LatLng | null | undefined;
  scheduledAt: Date | null | undefined;
  geofenceRadiusM?: number;
  timeToleranceMin?: number;
}): ControlGateResult {
  const serverTime = input.serverNow ?? new Date();
  const radius = input.geofenceRadiusM ?? DEFAULT_GEOFENCE_RADIUS_M;
  const timeTol = input.timeToleranceMin ?? DEFAULT_TIME_TOLERANCE_MIN;
  const violations: ControlGateResult["violations"] = [];

  if (
    input.gps.lat == null ||
    input.gps.lng == null ||
    Number.isNaN(input.gps.lat) ||
    Number.isNaN(input.gps.lng)
  ) {
    violations.push({
      code: "MISSING_COORDS",
      detail: "GPS del conductor no disponible",
    });
  }

  const geo = isWithinGeofence(input.gps, input.target, radius);
  if (!geo.ok) {
    violations.push({
      code: "OUT_OF_GEOFENCE",
      detail: `Fuera de radio ${radius} m (distancia ${Math.round(geo.distanceM ?? 0)} m)`,
    });
  }

  const time = isWithinTimeWindow(serverTime, input.scheduledAt, timeTol);
  if (!time.ok) {
    violations.push({
      code: "OUT_OF_TIME_WINDOW",
      detail: `Fuera de ventana ±${timeTol} min (desfase ${Math.round(time.deltaMin ?? 0)} min)`,
    });
  }

  return {
    ok: violations.length === 0,
    serverTime,
    violations,
    distanceM: geo.distanceM,
    deltaMin: time.deltaMin,
    geofenceRadiusM: radius,
    timeToleranceMin: timeTol,
  };
}
