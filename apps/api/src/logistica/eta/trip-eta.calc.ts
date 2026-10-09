import { haversineMeters, type LatLng } from "../../mobile/geofence";

/** Ventana (desde el último punto) cuyos puntos alimentan la velocidad media. */
export const ETA_SPEED_WINDOW_MIN = 10;
/** Si el último punto es más viejo que esto, no hay ETA confiable. */
export const ETA_STALE_AFTER_MIN = 10;
/** Máximo de muestras recientes promediadas (prioriza la velocidad actual). */
export const ETA_MAX_SAMPLES = 6;
/** Bajo este promedio la unidad se considera detenida (ETA indeterminado). */
export const ETA_MIN_MOVING_KPH = 1;
/** A esta distancia del destino se considera llegada. */
export const ETA_ARRIVED_KM = 0.15;
/** Más lejos que esto de la ruta sugerida → distancia en línea recta al destino. */
export const ETA_OFF_ROUTE_KM = 3;
/** Intervalo mínimo para derivar velocidad entre dos puntos sin speedKph. */
const MIN_SEGMENT_SECONDS = 5;

export type EtaTrackPoint = {
  lat: number;
  lng: number;
  speedKph?: number | null;
  recordedAt: Date;
};

export type TripEtaUnavailableReason =
  | "NOT_IN_TRANSIT"
  | "NO_DESTINATION"
  | "NO_RECENT_GPS"
  | "INSUFFICIENT_GPS"
  | "VEHICLE_STOPPED"
  | "CALC_ERROR";

export type TripEta =
  | {
      available: true;
      etaAt: string;
      computedAt: string;
      lastFixAt: string;
      remainingKm: number;
      avgSpeedKph: number;
      sampleCount: number;
      distanceBasis: "ROUTE" | "STRAIGHT_LINE";
      scheduledArriveAt: string | null;
      /** Positivo = atraso, negativo = adelanto; null si el servicio no tiene hora prevista. */
      delayMinutes: number | null;
    }
  | {
      available: false;
      reason: TripEtaUnavailableReason;
      computedAt: string;
      lastFixAt: string | null;
      scheduledArriveAt: string | null;
    };

export type TripEtaInput = {
  now: Date;
  status: string;
  scheduledArriveAt: Date | null;
  destination: LatLng | null;
  suggestedRoute: LatLng[];
  points: EtaTrackPoint[];
};

const km = (a: LatLng, b: LatLng) => haversineMeters(a, b) / 1000;

function isValidCoord(p: { lat: number; lng: number } | null | undefined): p is LatLng {
  return (
    p != null &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180 &&
    !(p.lat === 0 && p.lng === 0)
  );
}

/** Velocidad media de los puntos recientes: speedKph reportado o derivado del desplazamiento. */
export function averageRecentSpeedKph(
  points: EtaTrackPoint[],
): { avgSpeedKph: number; sampleCount: number } | null {
  if (!points.length) return null;
  const last = points[points.length - 1];
  const windowStart = last.recordedAt.getTime() - ETA_SPEED_WINDOW_MIN * 60_000;
  const firstInWindow = points.findIndex(
    (p) => p.recordedAt.getTime() >= windowStart,
  );
  const fromIdx = Math.max(firstInWindow, points.length - ETA_MAX_SAMPLES);

  const samples: number[] = [];
  for (let i = fromIdx; i < points.length; i++) {
    const p = points[i];
    if (p.speedKph != null && Number.isFinite(p.speedKph) && p.speedKph >= 0) {
      samples.push(p.speedKph);
      continue;
    }
    const prev = points[i - 1];
    if (!prev) continue;
    const dtSec = (p.recordedAt.getTime() - prev.recordedAt.getTime()) / 1000;
    if (dtSec < MIN_SEGMENT_SECONDS) continue;
    samples.push(km(prev, p) / (dtSec / 3600));
  }
  if (!samples.length) return null;
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  return { avgSpeedKph: avg, sampleCount: samples.length };
}

/** Distancia restante por la ruta sugerida desde el vértice más cercano; null si está fuera de ruta. */
export function remainingRouteKm(position: LatLng, route: LatLng[]): number | null {
  if (route.length < 2) return null;
  let nearest = 0;
  let nearestKm = Infinity;
  route.forEach((p, i) => {
    const d = km(position, p);
    if (d < nearestKm) {
      nearestKm = d;
      nearest = i;
    }
  });
  if (nearestKm > ETA_OFF_ROUTE_KM) return null;

  // Si la unidad ya pasó el vértice más cercano, continúa desde el siguiente.
  let from = nearest;
  if (
    nearest < route.length - 1 &&
    km(position, route[nearest + 1]) < km(route[nearest], route[nearest + 1])
  ) {
    from = nearest + 1;
  }
  let total = km(position, route[from]);
  for (let i = from; i < route.length - 1; i++) {
    total += km(route[i], route[i + 1]);
  }
  return total;
}

export function computeTripEta(input: TripEtaInput): TripEta {
  const computedAt = input.now.toISOString();
  const scheduledArriveAt = input.scheduledArriveAt?.toISOString() ?? null;
  const points = input.points
    .filter(
      (p) =>
        isValidCoord(p) &&
        p.recordedAt instanceof Date &&
        !Number.isNaN(p.recordedAt.getTime()) &&
        p.recordedAt.getTime() <= input.now.getTime() + 60_000,
    )
    .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
  const last = points[points.length - 1];
  const lastFixAt = last?.recordedAt.toISOString() ?? null;
  const unavailable = (reason: TripEtaUnavailableReason): TripEta => ({
    available: false,
    reason,
    computedAt,
    lastFixAt,
    scheduledArriveAt,
  });

  if (input.status !== "IN_TRANSIT") return unavailable("NOT_IN_TRANSIT");
  if (!last) return unavailable("NO_RECENT_GPS");
  if (input.now.getTime() - last.recordedAt.getTime() > ETA_STALE_AFTER_MIN * 60_000) {
    return unavailable("NO_RECENT_GPS");
  }

  const route = input.suggestedRoute.filter(isValidCoord);
  const destination = isValidCoord(input.destination)
    ? input.destination
    : route[route.length - 1] ?? null;
  if (!destination) return unavailable("NO_DESTINATION");

  const speed = averageRecentSpeedKph(points);
  if (!speed) return unavailable("INSUFFICIENT_GPS");

  const byRoute = remainingRouteKm(last, route);
  const remainingKm = byRoute ?? km(last, destination);
  const distanceBasis = byRoute != null ? "ROUTE" : "STRAIGHT_LINE";
  const arrived = km(last, destination) <= ETA_ARRIVED_KM;

  if (!arrived && speed.avgSpeedKph < ETA_MIN_MOVING_KPH) {
    return unavailable("VEHICLE_STOPPED");
  }

  const travelMs = arrived ? 0 : (remainingKm / speed.avgSpeedKph) * 3_600_000;
  if (!Number.isFinite(travelMs)) return unavailable("CALC_ERROR");
  const etaAt = new Date(last.recordedAt.getTime() + travelMs);

  return {
    available: true,
    etaAt: etaAt.toISOString(),
    computedAt,
    lastFixAt: last.recordedAt.toISOString(),
    remainingKm: Math.round((arrived ? 0 : remainingKm) * 100) / 100,
    avgSpeedKph: Math.round(speed.avgSpeedKph * 10) / 10,
    sampleCount: speed.sampleCount,
    distanceBasis,
    scheduledArriveAt,
    delayMinutes: input.scheduledArriveAt
      ? Math.round((etaAt.getTime() - input.scheduledArriveAt.getTime()) / 60_000)
      : null,
  };
}
