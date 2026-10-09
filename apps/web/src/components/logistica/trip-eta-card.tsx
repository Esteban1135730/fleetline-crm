"use client";

import { Clock, Loader2 } from "lucide-react";
import type { TripEta } from "@/components/logistica/logistica-shared";

const UNAVAILABLE_DETAIL: Record<
  Extract<TripEta, { available: false }>["reason"],
  string
> = {
  NOT_IN_TRANSIT: "El ETA se calcula solo con el viaje en ruta.",
  NO_DESTINATION: "El servicio no tiene destino georreferenciado.",
  NO_RECENT_GPS: "Sin puntos GPS recientes del viaje.",
  INSUFFICIENT_GPS: "Puntos GPS insuficientes para estimar la velocidad.",
  VEHICLE_STOPPED: "Unidad detenida: velocidad media cercana a 0 km/h.",
  CALC_ERROR: "No se pudo calcular el ETA.",
};

function formatClock(iso: string) {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return sameDay
    ? time
    : `${d.toLocaleDateString("es-CO", { day: "2-digit", month: "short" })} ${time}`;
}

function formatDuration(totalMin: number) {
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d) return `${d} d ${h} h`;
  if (h) return `${h} h ${m} min`;
  return `${m} min`;
}

export function delayLabel(delayMinutes: number | null): string {
  if (delayMinutes == null) return "Sin hora prevista";
  if (delayMinutes === 0) return "A tiempo";
  const abs = Math.abs(delayMinutes);
  const detail = abs >= 60 ? ` (${formatDuration(abs)})` : "";
  return `${abs.toLocaleString("es-CO")} min de ${delayMinutes > 0 ? "atraso" : "adelanto"}${detail}`;
}

/** Texto corto para el HUD del mapa. */
export function etaShortLabel(eta: TripEta | null | undefined): string {
  if (!eta || !eta.available) return "Sin ETA disponible";
  return formatClock(eta.etaAt);
}

/** ETA dinámico del viaje en ruta (informativo para la torre). */
export function TripEtaCard({
  eta,
  loading,
}: {
  eta: TripEta | null | undefined;
  loading?: boolean;
}) {
  if (loading && !eta) {
    return (
      <section className="rounded-lg border border-[var(--brand-border)] p-3" data-testid="trip-eta">
        <p className="flex items-center gap-2 text-xs text-[var(--brand-text-secondary)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Calculando ETA…
        </p>
      </section>
    );
  }

  const late = eta?.available && eta.delayMinutes != null && eta.delayMinutes > 0;

  return (
    <section className="rounded-lg border border-[var(--brand-border)] p-3" data-testid="trip-eta">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--brand-text-secondary)]">
        <Clock className="h-3 w-3" />
        Llegada estimada
      </p>
      {!eta || !eta.available ? (
        <div className="space-y-1">
          <p className="text-sm font-semibold text-[var(--brand-text-primary)]">Sin ETA disponible</p>
          <p className="text-[11px] text-[var(--brand-text-secondary)]">
            {eta ? UNAVAILABLE_DETAIL[eta.reason] : UNAVAILABLE_DETAIL.CALC_ERROR}
            {eta?.lastFixAt ? ` Último punto: ${formatClock(eta.lastFixAt)}.` : ""}
          </p>
          {eta?.scheduledArriveAt ? (
            <p className="text-[11px] text-[var(--brand-text-secondary)]">
              Prevista: {formatClock(eta.scheduledArriveAt)}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-data text-xl font-semibold tabular-nums text-[var(--brand-text-primary)]">
              {formatClock(eta.etaAt)}
            </span>
            <span
              className={`text-xs font-semibold ${
                late ? "text-[var(--brand-danger)]" : "text-brand-primary"
              }`}
              data-testid="trip-eta-delay"
            >
              {delayLabel(eta.delayMinutes)}
            </span>
          </div>
          <p className="text-[11px] text-[var(--brand-text-secondary)]">
            {eta.scheduledArriveAt ? `Prevista ${formatClock(eta.scheduledArriveAt)} · ` : ""}
            {eta.remainingKm.toLocaleString("es-CO")} km restantes
            {eta.distanceBasis === "STRAIGHT_LINE" ? " (línea recta)" : ""} · media{" "}
            {eta.avgSpeedKph.toLocaleString("es-CO")} km/h
          </p>
          <p className="font-data text-[10px] text-[var(--brand-text-secondary)]">
            Último punto GPS {formatClock(eta.lastFixAt)} · {eta.sampleCount} muestras
          </p>
        </div>
      )}
    </section>
  );
}
