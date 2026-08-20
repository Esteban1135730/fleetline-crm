"use client";

import dynamic from "next/dynamic";

const FleetMap = dynamic(
  () =>
    import("@/components/logistica/fleet-map").then((m) => m.FleetMap),
  {
    ssr: false,
    loading: () => (
      <div
        className="fsg-panel flex h-[320px] items-center justify-center text-sm text-[var(--brand-muted)]"
        data-testid="route-map"
      >
        Cargando mapa…
      </div>
    ),
  },
);

export type Driver = {
  id: string;
  name: string;
  document: string;
  fatigueScore: number;
  dispatchBlocked: boolean;
  active?: boolean;
};

export type Vehicle = {
  id: string;
  plate: string;
  lat?: number;
  lng?: number;
};

export type Servicio = {
  id: string;
  code: string;
  origin: string;
  destination: string;
  departAt: string;
  arriveAt?: string | null;
  status: string;
  officerName?: string | null;
  officerDocument?: string | null;
  suggestedPolyline?: string | null;
  originLat?: number | null;
  originLng?: number | null;
  destLat?: number | null;
  destLng?: number | null;
  driver?: Driver | null;
  vehicle?: Vehicle | null;
  customer?: { id: string; name: string } | null;
  meta?: {
    source?: string;
    quoteCode?: string | null;
    notes?: string | null;
  } | null;
  auditLogs?: Array<{ id: string; message: string; serverTime: string }>;
  _count?: { trackPoints: number };
};

export type Tracking = {
  mode: "SUGGESTED" | "LIVE_GPS" | "HISTORY";
  suggestedRoute: Array<{ lat: number; lng: number }>;
  live: { lat: number; lng: number } | null;
  history: Array<{
    lat: number;
    lng: number;
    recordedAt: string;
    speedKph?: number | null;
  }>;
  audit: Array<{
    id: string;
    message: string;
    serverTime: string;
    action: string;
  }>;
  serverClock: { iso: string; epochMs: number };
  trip: Servicio & {
    startedAt?: string | null;
    completedAt?: string | null;
  };
};

export type CalendarPayload = {
  year: number;
  month: number;
  drivers: Driver[];
  novelties: Array<{
    id: string;
    driverId: string;
    kind: string;
    dateFrom: string;
    dateTo: string;
  }>;
  trips: Array<{
    id: string;
    driverId: string | null;
    departAt: string;
    arriveAt?: string | null;
    status: string;
    code: string;
    origin?: string;
    destination?: string;
    officerName?: string | null;
    vehicle?: { plate: string } | null;
  }>;
};

export type Substitute = {
  id: string;
  name: string;
  document: string;
  fatigueScore: number;
  fatigueWarning: boolean;
  pesvMessage?: string | null;
};

export const NOVELTY_KINDS = [
  { value: "INCAPACITY", label: "Incapacidad" },
  { value: "VACATION_PAID", label: "Vacaciones pagas" },
  { value: "REST", label: "Descanso" },
  { value: "AVAILABLE_NO_CONTRACT", label: "Disponible sin contrato" },
  { value: "UNJUSTIFIED_ABSENCE", label: "Falta injustificada" },
  { value: "AVAILABLE", label: "Disponible" },
  { value: "ASSIGNED", label: "Asignado" },
] as const;

export function noveltyColor(kind: string) {
  switch (kind) {
    case "INCAPACITY":
      return "bg-[var(--brand-signal)]/20 text-[var(--brand-signal)]";
    case "VACATION_PAID":
      return "bg-[var(--brand-amber)]/20 text-[var(--brand-amber)]";
    case "REST":
      return "bg-slate-500/20 text-[var(--brand-muted)]";
    case "UNJUSTIFIED_ABSENCE":
      return "bg-red-900/40 text-[var(--brand-signal)]";
    case "AVAILABLE_NO_CONTRACT":
      return "bg-cyan-500/15 text-cyan-400";
    case "ASSIGNED":
      return "bg-[var(--brand-primary)]/20 text-[var(--brand-primary)]";
    default:
      return "bg-emerald-500/15 text-[var(--brand-primary)]";
  }
}

export function RouteMap(props: {
  mode: string;
  modeLabel?: string;
  suggested: Array<{ lat: number; lng: number }>;
  history: Array<{ lat: number; lng: number }>;
  live: { lat: number; lng: number } | null;
  fillHeight?: boolean;
  height?: number;
}) {
  return (
    <FleetMap
      mode={props.mode}
      modeLabel={props.modeLabel}
      suggested={props.suggested}
      history={props.history}
      live={props.live}
      height={props.height ?? 320}
      fillHeight={props.fillHeight}
    />
  );
}

export function ServerClockBadge({ clock }: { clock: string }) {
  return (
    <div className="font-data text-right text-xs text-[var(--brand-muted)]">
      <div>RELOJ SERVIDOR</div>
      <div
        className="text-lg text-[var(--brand-primary)]"
        data-testid="server-clock"
      >
        {clock}
      </div>
    </div>
  );
}
