import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "fsg_access_token";

function resolveApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (Platform.OS === "android") return "http://10.0.2.2:4000";
  return "http://localhost:4000";
}

export const API_URL = resolveApiUrl();

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string;
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
};

export type MyTripsResponse = {
  driver: { id: string; name: string } | null;
  trips: Trip[];
};

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

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
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
  await setToken(data.accessToken);
  return data;
}

export function fetchMyTrips() {
  return apiRequest<MyTripsResponse>("/logistics/my-trips");
}

export function updateTripStatus(tripId: string, status: string) {
  return apiRequest<Trip>(`/logistics/trips/${tripId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function reportIncident(tripId: string, notes: string) {
  return apiRequest<Trip>(`/logistics/trips/${tripId}/incident`, {
    method: "PATCH",
    body: JSON.stringify({ notes }),
  });
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
