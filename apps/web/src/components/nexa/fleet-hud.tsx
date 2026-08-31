"use client";

import type { ReactNode } from "react";
import { AlertOctagon, Fuel, Gauge, MapPin, User } from "lucide-react";
import { StatusPulseBadge } from "@/components/audit/KpiCard";

type FleetHudProps = {
  plate?: string | null;
  driverName?: string | null;
  speedKph?: number | null;
  fuelLabel?: string;
  fatigueScore?: number | null;
  lat?: number | null;
  lng?: number | null;
  uplink?: string;
  alerts?: string[];
  statusLabel?: string;
  statusTone?: "active" | "fatiga" | "danger" | "neutral";
  className?: string;
};

/** HUD flotante — telemetría en JetBrains Mono, semáforo operativo. */
export function FleetHud({
  plate,
  driverName,
  speedKph,
  fuelLabel = "N/A",
  fatigueScore,
  lat,
  lng,
  uplink = "OFFLINE",
  alerts = [],
  statusLabel,
  statusTone = "neutral",
  className = "",
}: FleetHudProps) {
  return (
    <aside
      className={`pointer-events-auto z-20 w-[min(100%,240px)] rounded-xl border border-brand-border bg-brand-surface-glass p-3 shadow-lg backdrop-blur-md transition-colors hover:border-brand-border-active ${className}`}
      data-testid="fleet-hud"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-data text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-primary">
          {plate ?? "Sin placa"}
        </p>
        {statusLabel ? (
          <StatusPulseBadge tone={statusTone} pulse={statusTone === "active"}>
            {statusLabel}
          </StatusPulseBadge>
        ) : null}
      </div>

      <div className="mt-3 space-y-2.5">
        <HudRow icon={<Gauge className="h-3 w-3" />} label="Velocidad">
          {speedKph != null ? `${Math.round(speedKph)} km/h` : "—"}
        </HudRow>
        <HudRow icon={<Fuel className="h-3 w-3" />} label="Combustible">
          {fuelLabel}
        </HudRow>
        <HudRow icon={<User className="h-3 w-3" />} label="Conductor">
          {driverName ?? "Sin asignar"}
        </HudRow>
        <HudRow label="Fatiga">
          {fatigueScore != null ? String(fatigueScore) : "—"}
        </HudRow>
        {lat != null && lng != null ? (
          <HudRow icon={<MapPin className="h-3 w-3" />} label="Coords">
            {lat.toFixed(5)}, {lng.toFixed(5)}
          </HudRow>
        ) : null}
        <HudRow label="Uplink">
          <span className="text-brand-primary">{uplink}</span>
        </HudRow>
      </div>

      {alerts.length > 0 ? (
        <ul className="mt-3 space-y-1 border-t border-brand-border pt-2">
          {alerts.map((a) => (
            <li
              key={a}
              className="flex items-start gap-1.5 font-data text-[10px] text-brand-danger"
            >
              <AlertOctagon className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
              {a}
            </li>
          ))}
        </ul>
      ) : null}
    </aside>
  );
}

function HudRow({
  icon,
  label,
  children,
}: {
  icon?: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1 font-data text-[10px] uppercase tracking-wider text-brand-text-secondary">
        {icon}
        {label}
      </span>
      <span className="font-data text-sm tabular-nums text-brand-text-primary">
        {children}
      </span>
    </div>
  );
}
