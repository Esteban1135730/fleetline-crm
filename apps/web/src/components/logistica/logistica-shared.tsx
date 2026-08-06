"use client";

import { useMemo } from "react";

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
  auditLogs?: Array<{ id: string; message: string; serverTime: string }>;
  _count?: { trackPoints: number };
};

export type Tracking = {
  mode: "SUGGESTED" | "LIVE_GPS" | "HISTORY";
  suggestedRoute: Array<{ lat: number; lng: number }>;
  live: { lat: number; lng: number } | null;
  history: Array<{ lat: number; lng: number; recordedAt: string }>;
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

export function RouteMap({
  mode,
  modeLabel,
  suggested,
  history,
  live,
}: {
  mode: string;
  modeLabel?: string;
  suggested: Array<{ lat: number; lng: number }>;
  history: Array<{ lat: number; lng: number }>;
  live: { lat: number; lng: number } | null;
}) {
  const pts =
    mode === "LIVE_GPS" || mode === "HISTORY"
      ? history.length
        ? history
        : live
          ? [live]
          : suggested
      : suggested;

  const bounds = useMemo(() => {
    const all = [...pts, ...(live ? [live] : [])];
    if (!all.length) {
      return { minLat: 4.55, maxLat: 4.75, minLng: -74.15, maxLng: -74.02 };
    }
    const lats = all.map((p) => p.lat);
    const lngs = all.map((p) => p.lng);
    return {
      minLat: Math.min(...lats) - 0.01,
      maxLat: Math.max(...lats) + 0.01,
      minLng: Math.min(...lngs) - 0.01,
      maxLng: Math.max(...lngs) + 0.01,
    };
  }, [pts, live]);

  const w = 640;
  const h = 320;
  const project = (lat: number, lng: number) => {
    const x =
      ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng || 1)) * (w - 24) +
      12;
    const y =
      (1 - (lat - bounds.minLat) / (bounds.maxLat - bounds.minLat || 1)) *
        (h - 24) +
      12;
    return { x, y };
  };

  const path = pts
    .map((p, i) => {
      const { x, y } = project(p.lat, p.lng);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const livePt = live ? project(live.lat, live.lng) : null;
  const label =
    modeLabel ??
    ({
      SUGGESTED: "Ruta sugerida",
      LIVE_GPS: "GPS en vivo",
      HISTORY: "Histórico de ruta",
    }[mode] ?? mode);

  return (
    <div className="fsg-panel overflow-hidden p-0" data-testid="route-map">
      <div className="flex items-center justify-between border-b border-[var(--brand-line)] px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--brand-muted)]">
          Ruta · {label}
        </span>
        <span className="font-data text-[10px] text-[var(--brand-muted)]">
          {pts.length} puntos
        </span>
      </div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-[280px] w-full bg-[var(--brand-canvas,#0A0D14)]"
      >
        <rect width={w} height={h} fill="transparent" />
        {path ? (
          <path
            d={path}
            fill="none"
            stroke="var(--brand-primary)"
            strokeWidth="2.5"
            strokeOpacity="0.85"
          />
        ) : null}
        {pts[0] ? (
          <circle
            cx={project(pts[0].lat, pts[0].lng).x}
            cy={project(pts[0].lat, pts[0].lng).y}
            r="5"
            fill="var(--brand-amber)"
          />
        ) : null}
        {pts.length > 1 ? (
          <circle
            cx={project(pts[pts.length - 1].lat, pts[pts.length - 1].lng).x}
            cy={project(pts[pts.length - 1].lat, pts[pts.length - 1].lng).y}
            r="5"
            fill="var(--brand-signal)"
          />
        ) : null}
        {livePt ? (
          <circle
            cx={livePt.x}
            cy={livePt.y}
            r="7"
            fill="var(--brand-primary)"
            stroke="#fff"
            strokeWidth="1.5"
          >
            <animate
              attributeName="r"
              values="5;9;5"
              dur="1.6s"
              repeatCount="indefinite"
            />
          </circle>
        ) : null}
      </svg>
    </div>
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
