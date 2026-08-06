/**
 * Ruteo punto-a-punto vía OSRM (Open Source Routing Machine).
 * Demo pública: router.project-osrm.org (rate-limit; para prod usar instancia propia o Google Directions).
 * Geocodificación: Nominatim (OpenStreetMap) acotada a Colombia.
 */

export type LatLng = { lat: number; lng: number };

const OSRM_BASE =
  process.env.OSRM_URL?.replace(/\/$/, "") ||
  "https://router.project-osrm.org";

const NOMINATIM_UA =
  process.env.NOMINATIM_USER_AGENT || "InretransOS/1.0 (logistica@fsg.co)";

/** Fallback geométrico si OSRM no responde */
export function straightRouteFallback(
  origin: LatLng,
  dest: LatLng,
): LatLng[] {
  const midLat = (origin.lat + dest.lat) / 2 + 0.008;
  const midLng = (origin.lng + dest.lng) / 2 - 0.006;
  return [origin, { lat: midLat, lng: midLng }, dest];
}

export async function fetchDrivingRoute(
  origin: LatLng,
  dest: LatLng,
): Promise<{ points: LatLng[]; distanceM: number; durationS: number }> {
  const coords = `${origin.lng},${origin.lat};${dest.lng},${dest.lat}`;
  const url = `${OSRM_BASE}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8_000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
    const data = (await res.json()) as {
      code?: string;
      routes?: Array<{
        distance: number;
        duration: number;
        geometry?: { coordinates: Array<[number, number]> };
      }>;
    };
    const route = data.routes?.[0];
    if (!route?.geometry?.coordinates?.length) {
      throw new Error("OSRM sin geometría");
    }
    const points = route.geometry.coordinates.map(([lng, lat]) => ({
      lat,
      lng,
    }));
    return {
      points,
      distanceM: route.distance,
      durationS: route.duration,
    };
  } catch {
    return {
      points: straightRouteFallback(origin, dest),
      distanceM: 0,
      durationS: 0,
    };
  }
}

export async function geocodeColombia(
  query: string,
): Promise<(LatLng & { label: string }) | null> {
  const q = query.trim();
  if (q.length < 3) return null;
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", `${q}, Colombia`);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "5");
  url.searchParams.set("countrycodes", "co");
  url.searchParams.set("addressdetails", "0");

  try {
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(6_000),
      headers: {
        Accept: "application/json",
        "User-Agent": NOMINATIM_UA,
      },
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{
      lat: string;
      lon: string;
      display_name: string;
    }>;
    const hit = rows[0];
    if (!hit) return null;
    return {
      lat: Number(hit.lat),
      lng: Number(hit.lon),
      label: hit.display_name,
    };
  } catch {
    return null;
  }
}

export async function searchPlacesColombia(
  query: string,
): Promise<Array<LatLng & { label: string }>> {
  const q = query.trim();
  if (q.length < 3) return [];
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", `${q}, Colombia`);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "6");
  url.searchParams.set("countrycodes", "co");

  try {
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(6_000),
      headers: {
        Accept: "application/json",
        "User-Agent": NOMINATIM_UA,
      },
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as Array<{
      lat: string;
      lon: string;
      display_name: string;
    }>;
    return rows.map((r) => ({
      lat: Number(r.lat),
      lng: Number(r.lon),
      label: r.display_name,
    }));
  } catch {
    return [];
  }
}

export async function reverseGeocodeColombia(
  lat: number,
  lng: number,
): Promise<(LatLng & { label: string }) | null> {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("format", "json");
  url.searchParams.set("zoom", "18");

  try {
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(6_000),
      headers: {
        Accept: "application/json",
        "User-Agent": NOMINATIM_UA,
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { display_name?: string };
    if (!data.display_name) {
      return {
        lat,
        lng,
        label: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      };
    }
    return { lat, lng, label: data.display_name };
  } catch {
    return {
      lat,
      lng,
      label: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    };
  }
}

/** Resuelve coords explícitas o geocodifica texto de origen/destino. */
export async function resolveServiceEndpoints(input: {
  origin: string;
  destination: string;
  originLat?: number;
  originLng?: number;
  destLat?: number;
  destLng?: number;
}): Promise<{ origin: LatLng; dest: LatLng }> {
  const bogota = { lat: 4.711, lng: -74.072 };
  let origin: LatLng =
    input.originLat != null && input.originLng != null
      ? { lat: input.originLat, lng: input.originLng }
      : bogota;
  let dest: LatLng =
    input.destLat != null && input.destLng != null
      ? { lat: input.destLat, lng: input.destLng }
      : { lat: 4.65, lng: -74.1 };

  if (input.originLat == null || input.originLng == null) {
    const g = await geocodeColombia(input.origin);
    if (g) origin = { lat: g.lat, lng: g.lng };
  }
  if (input.destLat == null || input.destLng == null) {
    const g = await geocodeColombia(input.destination);
    if (g) dest = { lat: g.lat, lng: g.lng };
  }

  return { origin, dest };
}
