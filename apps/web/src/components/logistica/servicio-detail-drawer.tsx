"use client";

import { useEffect, useState } from "react";
import { Button } from "@fsg/ui";
import { api } from "@/lib/api";
import {
  RouteMap,
  type Tracking,
} from "@/components/logistica/logistica-shared";

function fmt(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const ESTADO_ES: Record<string, string> = {
  PENDING: "Pendiente",
  ASSIGNED: "Asignado",
  AWAITING_PREOP: "Esperando preoperacional",
  AWAITING_FUEC: "Esperando FUEC",
  IN_TRANSIT: "En proceso",
  COMPLETED: "Completado",
  CANCELLED: "Cancelado",
  NOVEDAD: "Novedad",
};

const MODO_RUTA_ES: Record<string, string> = {
  SUGGESTED: "Ruta sugerida",
  LIVE_GPS: "GPS en vivo",
  HISTORY: "Histórico de ruta",
};

const ACCION_ES: Record<string, string> = {
  CREATED: "Creado",
  ASSIGNED: "Asignado",
  STATUS_CHANGED: "Cambio de estado",
  STARTED: "Iniciado",
  COMPLETED: "Cerrado",
  INCIDENT: "Novedad",
  REASSIGNED: "Reasignado",
  NOVELTY: "Novedad",
  GPS_PING: "Señal GPS",
  OTHER: "Otro",
};

function estadoEs(status?: string) {
  if (!status) return "—";
  return ESTADO_ES[status] ?? status;
}

function modoRutaEs(mode?: string) {
  if (!mode) return "—";
  return MODO_RUTA_ES[mode] ?? mode;
}

export function ServicioDetailDrawer({
  tripId,
  onClose,
}: {
  tripId: string;
  onClose: () => void;
}) {
  const [tracking, setTracking] = useState<Tracking | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    void api<Tracking>(`/logistica/servicios/${tripId}/tracking`)
      .then((t) => {
        if (alive) setTracking(t);
      })
      .catch((e) => {
        if (alive)
          setError(
            e instanceof Error ? e.message : "No se pudo cargar el detalle",
          );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [tripId]);

  const trip = tracking?.trip;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      data-testid="servicio-detail-drawer"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Cerrar detalle"
        onClick={onClose}
      />
      <aside className="relative z-10 flex h-full w-full max-w-lg flex-col border-l border-[var(--brand-line)] bg-[var(--brand-surface,#121722)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--brand-line)] px-4 py-3">
          <div>
            <p className="font-data text-[10px] uppercase tracking-[0.14em] text-[var(--brand-muted)]">
              Detalle del servicio
            </p>
            <h3 className="font-data text-lg text-[var(--brand-primary)]">
              {trip?.code ?? "…"}
            </h3>
          </div>
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {loading ? (
            <p className="text-sm text-[var(--brand-muted)]">Cargando…</p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-[var(--brand-signal)]">
              {error}
            </p>
          ) : null}

          {trip ? (
            <>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.1em] text-[var(--brand-muted)]">
                    Estado
                  </dt>
                  <dd className="font-data">{estadoEs(trip.status)}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.1em] text-[var(--brand-muted)]">
                    Modo de ruta
                  </dt>
                  <dd className="font-data">{modoRutaEs(tracking?.mode)}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-[10px] uppercase tracking-[0.1em] text-[var(--brand-muted)]">
                    Origen → Destino
                  </dt>
                  <dd>
                    {trip.origin} → {trip.destination}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.1em] text-[var(--brand-muted)]">
                    Inicio programado
                  </dt>
                  <dd className="font-data text-xs">{fmt(trip.departAt)}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.1em] text-[var(--brand-muted)]">
                    Fin programado
                  </dt>
                  <dd className="font-data text-xs">{fmt(trip.arriveAt)}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.1em] text-[var(--brand-muted)]">
                    Inicio real
                  </dt>
                  <dd className="font-data text-xs">{fmt(trip.startedAt)}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.1em] text-[var(--brand-muted)]">
                    Cierre real
                  </dt>
                  <dd className="font-data text-xs">{fmt(trip.completedAt)}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.1em] text-[var(--brand-muted)]">
                    Conductor
                  </dt>
                  <dd>{trip.driver?.name ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.1em] text-[var(--brand-muted)]">
                    Placa
                  </dt>
                  <dd className="font-data">{trip.vehicle?.plate ?? "—"}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-[10px] uppercase tracking-[0.1em] text-[var(--brand-muted)]">
                    Funcionario / cliente
                  </dt>
                  <dd>{trip.officerName ?? "—"}</dd>
                </div>
              </dl>

              {tracking ? (
                <RouteMap
                  modeLabel={modoRutaEs(tracking.mode)}
                  mode={tracking.mode}
                  suggested={tracking.suggestedRoute}
                  history={tracking.history}
                  live={tracking.live}
                />
              ) : null}

              <div className="fsg-panel max-h-[220px] overflow-auto p-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--brand-muted)]">
                  Registro de auditoría
                </p>
                <ul className="space-y-1 font-data text-[11px]">
                  {(tracking?.audit ?? []).map((a) => (
                    <li key={a.id}>
                      <span className="text-[var(--brand-muted)]">
                        {new Date(a.serverTime).toLocaleTimeString("es-CO")}
                      </span>{" "}
                      <span className="text-[var(--brand-muted)]">
                        [{ACCION_ES[a.action] ?? a.action}]
                      </span>{" "}
                      {a.message}
                    </li>
                  ))}
                  {!tracking?.audit?.length ? (
                    <li className="text-[var(--brand-muted)]">Sin registros</li>
                  ) : null}
                </ul>
              </div>
            </>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
