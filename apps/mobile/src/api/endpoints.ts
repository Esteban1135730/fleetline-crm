import { apiFetch } from "./client";
import { setSession } from "../auth/session";
import type { AuthUser, Trip, WorkOrder } from "../types";

export async function login(email: string, password: string) {
  const data = await apiFetch<{
    accessToken: string;
    refreshToken?: string;
    user: AuthUser;
  }>(
    "/auth/login",
    {
      method: "POST",
      body: JSON.stringify({ email: email.toLowerCase().trim(), password }),
    },
    { skipAuth: true },
  );
  await setSession(data.accessToken, data.user, data.refreshToken);
  return data;
}

export async function fetchMe() {
  return apiFetch<AuthUser>("/auth/me");
}

export async function fetchMyTrips() {
  const raw = await apiFetch<{
    driver: { id: string; name: string } | null;
    trips: Trip[];
  }>("/logistics/my-trips");
  const trips = (raw.trips ?? []).map((t) => ({
    ...t,
    vehicleId: t.vehicleId ?? t.vehicle?.id ?? null,
  }));
  return { driver: raw.driver ?? null, trips };
}

export function submitPreoperationalLogistics(
  tripId: string,
  checklist: {
    frenos: boolean;
    luces: boolean;
    llantas: boolean;
    kitCarretera: boolean;
    nivelAceite: boolean;
    observaciones?: string;
  },
) {
  return apiFetch(`/logistics/trips/${tripId}/preoperational`, {
    method: "POST",
    body: JSON.stringify(checklist),
  });
}

export function submitPreoperationalPilot(body: {
  tripId: string;
  brakesOk: boolean;
  lightsOk: boolean;
  tiresOk: boolean;
  kitOk: boolean;
  oilOk: boolean;
  observations?: string;
  photoRefs: string[];
}) {
  return apiFetch(`/api/v1/pilot/preoperacional`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function iniciarServicio(tripId: string, gps: { lat: number; lng: number }) {
  return apiFetch(`/api/v1/servicios/${tripId}/iniciar`, {
    method: "POST",
    body: JSON.stringify(gps),
  });
}

export function finalizarServicio(
  tripId: string,
  gps: { lat: number; lng: number },
) {
  return apiFetch(`/api/v1/servicios/${tripId}/finalizar`, {
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
  return apiFetch(`/api/v1/servicios/${tripId}/incidentes`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function pilotSos(body: Record<string, unknown>) {
  return apiFetch(`/api/v1/pilot/sos`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateVehicleGps(vehicleId: string, lat: number, lng: number) {
  return apiFetch(`/logistics/gps/${vehicleId}`, {
    method: "PATCH",
    body: JSON.stringify({ lat, lng }),
  });
}

export function fetchMechanicOrders() {
  return apiFetch<WorkOrder[] | { orders: WorkOrder[] }>(
    `/api/v1/taller/mecanico/mis-ordenes`,
  );
}

export function mechanicTimeTracking(body: {
  workOrderId: string;
  action: "START" | "STOP";
  taskLabel?: string;
  entryId?: string;
}) {
  return apiFetch(`/api/v1/taller/mecanico/time-tracking`, {
    method: "POST",
    body: JSON.stringify({ taskLabel: "TAREA", ...body }),
  });
}

export function mechanicFinding(body: {
  workOrderId: string;
  photoRef?: string;
  notes?: string;
}) {
  return apiFetch(`/api/v1/taller/mecanico/hallazgo`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function requestPartDispatch(body: {
  workOrderId: string;
  partQr?: string;
  quantity?: number;
  photoOldRef?: string;
  photoNewRef?: string;
}) {
  return apiFetch(`/api/v1/taller/almacen/despachar-qr`, {
    method: "POST",
    body: JSON.stringify({ quantity: 1, ...body }),
  });
}

export function fetchYardApp() {
  return apiFetch(`/api/v1/patio/auxiliar/yard-app`);
}

export function lprCheck(body: {
  plate?: string;
  qrPayload?: string;
  gateId?: string;
}) {
  return apiFetch(`/api/v1/patio/talanquera/lpr-check`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function yardAccessLog(body: Record<string, unknown>) {
  return apiFetch(`/api/v1/patio/access-log`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function yardInspection(body: Record<string, unknown>) {
  return apiFetch(`/api/v1/patio/inspections`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function washComplete(body: { washJobId: string; notes?: string }) {
  return apiFetch(`/api/v1/patio/lavado/completar`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function campoDashboard() {
  return apiFetch(`/api/v1/operaciones/campo/dashboard`);
}

export function fallaSitio(body: Record<string, unknown>) {
  return apiFetch(`/api/v1/operaciones/campo/falla-sitio`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function abordajeManual(body: Record<string, unknown>) {
  return apiFetch(`/api/v1/operaciones/campo/abordaje-manual`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function syncOfflineBoardings(events: Array<Record<string, unknown>>) {
  return apiFetch(`/api/v1/operaciones/campo/abordaje-manual/sync`, {
    method: "POST",
    body: JSON.stringify({ events }),
  });
}

export function postHqseAudit(body: Record<string, unknown>) {
  return apiFetch(`/hqse/audits`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
