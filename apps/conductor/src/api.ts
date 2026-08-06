import { Platform } from "react-native";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import * as Location from "expo-location";

const TOKEN_KEY = "fsg_access_token";
const USER_KEY = "fsg_user_json";

/** Caché en memoria: SecureStore a veces falla o tarda en Expo Go. */
let memoryToken: string | null = null;
let memoryUser: AuthUser | null = null;

/** Host LAN del Metro (ej. 192.168.1.10:8081) — sirve para celular físico. */
function lanHostFromExpo(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants as { manifest2?: { extra?: { expoClient?: { hostUri?: string } } } })
      .manifest2?.extra?.expoClient?.hostUri ??
    (
      Constants as { manifest?: { debuggerHost?: string; hostUri?: string } }
    ).manifest?.debuggerHost ??
    (
      Constants as { manifest?: { hostUri?: string } }
    ).manifest?.hostUri ??
    Constants.linkingUri?.replace(/^[a-z]+:\/\//i, "") ??
    null;
  if (!hostUri) return null;
  const host = String(hostUri).split("/")[0]?.split(":")[0];
  if (!host || host === "localhost" || host === "127.0.0.1") return null;
  return host;
}

export function getApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const lan = lanHostFromExpo();
  if (lan) return `http://${lan}:4000`;
  if (Platform.OS === "android") return "http://10.0.2.2:4000";
  return "http://localhost:4000";
}

export const API_URL = getApiUrl();

export async function getToken(): Promise<string | null> {
  if (memoryToken) return memoryToken;
  try {
    memoryToken = await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    memoryToken = null;
  }
  return memoryToken;
}

export async function setToken(token: string): Promise<void> {
  memoryToken = token;
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } catch {
    /* memoria basta */
  }
}

export async function clearToken(): Promise<void> {
  memoryToken = null;
  memoryUser = null;
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
  } catch {
    /* ignore */
  }
}

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string;
};

export type PreoperationalPayload = {
  frenos: boolean;
  luces: boolean;
  llantas: boolean;
  kitCarretera: boolean;
  nivelAceite: boolean;
  observaciones?: string;
};

export type Trip = {
  id: string;
  code: string;
  origin: string;
  destination: string;
  status: string;
  vehicleId?: string | null;
  vehicle?: { id: string; plate: string } | null;
  driver?: { id: string; name: string } | null;
  notes?: string | null;
  preoperationalAt?: string | null;
  preoperationalJson?: PreoperationalPayload | Record<string, unknown> | null;
  originLat?: number | null;
  originLng?: number | null;
  destLat?: number | null;
  destLng?: number | null;
  departAt?: string;
  suggestedPolyline?: string | null;
};

export type MyTripsResponse = {
  driver: { id: string; name: string } | null;
  trips: Trip[];
};

export type AppRole =
  | "conductor"
  | "monitora"
  | "pasajero"
  | "padre"
  | "supervisor"
  | "despacho"
  | string;

export function normalizeRole(role: string): AppRole {
  return String(role).toLowerCase() as AppRole;
}

export function homeTitleForRole(role: AppRole) {
  switch (normalizeRole(role)) {
    case "conductor":
      return "Operación · Conductor";
    case "monitora":
      return "Escolar · Monitora";
    case "padre":
      return "Familia · Acudiente";
    case "pasajero":
      return "Pasajero";
    case "supervisor":
    case "despacho":
      return "Supervisor de flota";
    default:
      return "INRETRANS OS";
  }
}

export async function setSession(token: string, user: AuthUser) {
  await setToken(token);
  memoryUser = user;
  try {
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
  } catch {
    /* memoria */
  }
}

export async function getStoredUser(): Promise<AuthUser | null> {
  if (memoryUser) return memoryUser;
  try {
    const raw = await SecureStore.getItemAsync(USER_KEY);
    if (!raw) return null;
    memoryUser = JSON.parse(raw) as AuthUser;
    return memoryUser;
  } catch {
    return null;
  }
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  const base = getApiUrl();
  try {
    res = await fetch(`${base}${path}`, { ...options, headers });
  } catch {
    throw new Error(
      `Sin uplink a la API (${base}). Arranca pnpm --filter @fsg/api dev y usa la misma Wi‑Fi.`,
    );
  }
  if (!res.ok) {
    let message = `Error ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (body.message) {
        message = Array.isArray(body.message)
          ? body.message.join(", ")
          : body.message;
      }
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function login(
  email: string,
  password: string,
): Promise<{ accessToken: string; user: AuthUser }> {
  const data = await apiRequest<{ accessToken: string; user: AuthUser }>(
    "/auth/login",
    {
      method: "POST",
      body: JSON.stringify({ email, password }),
    },
  );
  if (!data?.accessToken) {
    throw new Error("Uplink de autenticación incompleto — sin token");
  }
  await setSession(data.accessToken, data.user);
  return data;
}

export async function fetchMyTrips(): Promise<MyTripsResponse> {
  const raw = await apiRequest<MyTripsResponse & { trips?: Trip[] }>(
    "/logistics/my-trips",
  );
  const trips = (raw.trips ?? []).map((t) => {
    const pre = (
      t as Trip & { preoperational?: { signedAt?: string } | null }
    ).preoperational;
    return {
      ...t,
      preoperationalAt: t.preoperationalAt ?? pre?.signedAt ?? null,
      vehicleId: t.vehicleId ?? t.vehicle?.id ?? null,
    };
  });
  return { driver: raw.driver ?? null, trips };
}

export async function getCurrentGps() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    throw new Error("Permiso de ubicación denegado");
  }
  const pos = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
}

export type ControlResult = {
  status: "INICIADO" | "FINALIZADO" | "PENDIENTE_APROBACION_SUPERVISOR";
  tripStatus: string;
  serverTime: string;
  gate?: {
    violations: Array<{ code: string; detail: string }>;
    distanceM: number | null;
  };
  deviation?: { id: string; reasonDetail: string };
};

export function iniciarServicio(tripId: string, gps: { lat: number; lng: number }) {
  return apiRequest<ControlResult>(`/api/v1/servicios/${tripId}/iniciar`, {
    method: "POST",
    body: JSON.stringify(gps),
  });
}

export function finalizarServicio(
  tripId: string,
  gps: { lat: number; lng: number },
) {
  return apiRequest<ControlResult>(`/api/v1/servicios/${tripId}/finalizar`, {
    method: "POST",
    body: JSON.stringify(gps),
  });
}

export function reportarIncidente(
  tripId: string,
  payload: {
    category: string;
    notes?: string;
    lat?: number;
    lng?: number;
    photoUrl?: string;
  },
) {
  return apiRequest(`/api/v1/servicios/${tripId}/incidentes`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchTripChat(tripId: string) {
  return apiRequest<
    Array<{
      id: string;
      authorName: string;
      authorRole: string;
      body: string;
      serverTime: string;
    }>
  >(`/api/v1/chat/viaje/${tripId}`);
}

export function postTripChat(tripId: string, body: string) {
  return apiRequest(`/api/v1/chat/viaje/${tripId}`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export function fetchSupportChat() {
  return apiRequest<
    Array<{
      id: string;
      authorName: string;
      authorRole: string;
      body: string;
      serverTime: string;
    }>
  >(`/api/v1/chat/soporte-general`);
}

export function postSupportChat(body: string) {
  return apiRequest(`/api/v1/chat/soporte-general`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export function fetchPendingDeviations() {
  return apiRequest<
    Array<{
      id: string;
      tripId: string;
      action: string;
      reasonDetail: string;
      trip: { code: string; origin: string; destination: string };
    }>
  >(`/api/v1/servicios/desviaciones/pendientes`);
}

export function resolveDeviation(
  tripId: string,
  decision: "ACEPTAR" | "CANCELAR",
  note?: string,
) {
  return apiRequest(`/api/v1/servicios/${tripId}/aprobar-desviacion`, {
    method: "POST",
    body: JSON.stringify({ decision, note }),
  });
}

/** @deprecated preferir iniciarServicio con GPS */
export function updateTripStatus(
  tripId: string,
  status: string,
  distanceKm?: number,
) {
  return apiRequest<Trip>(`/logistics/trips/${tripId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status, distanceKm }),
  });
}

export function submitPreoperational(
  tripId: string,
  checklist: PreoperationalPayload,
) {
  return apiRequest<Trip>(`/logistics/trips/${tripId}/preoperational`, {
    method: "POST",
    body: JSON.stringify(checklist),
  });
}

export function reportIncident(tripId: string, notes: string) {
  return reportarIncidente(tripId, { category: "OTHER", notes });
}

export function updateVehicleGps(
  vehicleId: string,
  lat: number,
  lng: number,
) {
  return apiRequest(`/logistics/gps/${vehicleId}`, {
    method: "PATCH",
    body: JSON.stringify({ lat, lng }),
  });
}
