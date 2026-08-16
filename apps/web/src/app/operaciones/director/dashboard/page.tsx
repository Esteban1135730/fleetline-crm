"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { api } from "@/lib/api";
import { HowToBox, PageIntro } from "@/components/page-intro";

type GanttBar = {
  id: string;
  code: string;
  vehicleId?: string | null;
  plate?: string | null;
  driverName?: string | null;
  departAt: string;
  arriveAt?: string | null;
  status: string;
  ganttBlocked: boolean;
  blockReason?: string;
};

type Dash = {
  gantt: GanttBar[];
  fleetStops: Array<{
    id: string;
    code: string;
    status: string;
    reason: string;
    windowStart: string;
    windowEnd: string;
    vehicle: { plate: string };
  }>;
  novedades: Array<{
    id: string;
    kind: string;
    title: string;
    severity: string;
    at: string;
  }>;
  sla: {
    punctualityPct: number;
    availabilityPct: number;
    tripsToday: number;
    fleetStopsActive: number;
  };
};

type Capacity = {
  fleet: { available: number; total: number; seatsAvailable: number };
  drivers: { available: number; total: number; resting: number };
  demand: { peakDemand: number; shortfall: number; scheduledTrips: number };
  suggestions: string[];
  routeRentabilidad: Array<{
    route: string;
    revenue: number;
    trips: number;
    revenuePerKm: number | null;
  }>;
};

function Gauge(props: { label: string; value: number; accent?: string }) {
  const pct = Math.max(0, Math.min(100, props.value));
  const tone =
    pct >= 85 ? "emerald" : pct >= 70 ? "amber" : ("rose" as const);
  return (
    <div className="fsg-panel p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-[var(--text-secondary)]">
          {props.label}
        </p>
        <Badge tone={tone}>{pct}%</Badge>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--border-subtle)]">
        <div
          className="h-full rounded-full bg-[var(--accent-primary)] transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-3 font-mono text-3xl text-[var(--text-primary)]">
        {pct}
        <span className="text-base text-[var(--text-secondary)]"> %</span>
      </p>
    </div>
  );
}

export default function DirectorOperativoDashboardPage() {
  const [dash, setDash] = useState<Dash | null>(null);
  const [capacity, setCapacity] = useState<Capacity | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [d, c] = await Promise.all([
        api<Dash>("/api/v1/operaciones/director/dashboard"),
        api<Capacity>("/api/v1/operaciones/director/capacity-planning"),
      ]);
      setDash(d);
      setCapacity(c);
    } catch (e) {
      setError((e as Error).message || "Señal perdida — reintentando conexión");
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 20_000);
    return () => clearInterval(t);
  }, [load]);

  const plates = useMemo(() => {
    const set = new Set<string>();
    for (const g of dash?.gantt ?? []) {
      if (g.plate) set.add(g.plate);
    }
    for (const s of dash?.fleetStops ?? []) {
      set.add(s.vehicle.plate);
    }
    return [...set].sort();
  }, [dash]);

  async function approveFirstPendingStop() {
    const pending = dash?.fleetStops.find((s) => s.status === "PENDING");
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      if (pending) {
        const res = await api<{ message: string }>(
          "/api/v1/operaciones/director/aprobar-parada-flota",
          {
            method: "POST",
            body: JSON.stringify({ fleetStopId: pending.id, approve: true }),
          },
        );
        setMsg(res.message);
      } else {
        const first = dash?.gantt.find((g) => g.vehicleId);
        if (!first?.vehicleId) {
          setError("Sin vehículo para crear parada de flota");
          return;
        }
        const res = await api<{ message: string }>(
          "/api/v1/operaciones/director/aprobar-parada-flota",
          {
            method: "POST",
            body: JSON.stringify({
              vehicleId: first.vehicleId,
              reason: "Mantenimiento preventivo — ventana baja demanda",
              approve: true,
              preferLowDemandWindow: true,
            }),
          },
        );
        setMsg(res.message);
      }
      await load();
    } catch (e) {
      setError((e as Error).message || "Aprobación fallida");
    } finally {
      setBusy(false);
    }
  }

  async function overrideFromDrag(tripId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{
        trip: { code: string; vehicle?: { plate: string } };
        contingencyPool: Array<{ plate: string; distanceKm: number }>;
      }>("/api/v1/operaciones/director/override-reasignar", {
        method: "POST",
        body: JSON.stringify({
          tripId,
          reason: "Contingencia mayor — reasignación de cronograma",
          radiusKm: 20,
          forceOverride: true,
          notifyDrivers: true,
          notifyCustomers: true,
        }),
      });
      setMsg(
        `Override ${res.trip.code} → ${res.trip.vehicle?.plate ?? "pool"} · ${res.contingencyPool.length} unidades en radio`,
      );
      await load();
    } catch (e) {
      setError((e as Error).message || "Reasignación fallida");
    } finally {
      setBusy(false);
      setDragId(null);
    }
  }

  const windowStart = useMemo(() => {
    const times = (dash?.gantt ?? []).map((g) => +new Date(g.departAt));
    return times.length ? Math.min(...times) : Date.now();
  }, [dash]);
  const windowEnd = windowStart + 24 * 60 * 60 * 1000;

  function barStyle(g: GanttBar) {
    const start = Math.max(+new Date(g.departAt), windowStart);
    const end = Math.min(
      +(g.arriveAt ? new Date(g.arriveAt) : new Date(+new Date(g.departAt) + 2 * 3600_000)),
      windowEnd,
    );
    const left = ((start - windowStart) / (windowEnd - windowStart)) * 100;
    const width = Math.max(
      2,
      ((end - start) / (windowEnd - windowStart)) * 100,
    );
    return { left: `${left}%`, width: `${width}%` };
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-8">
      <PageIntro module="logistica" title="Torre de control · Dirección operativa" />
      <HowToBox
        steps={[
          "Cronograma: arrastre un servicio para reasignación de contingencia (grupo GPS).",
          "Apruebe paradas de flota en ventanas de baja demanda — bloqueo automático en el cronograma.",
          "La planeación de capacidad descuenta taller y descansos de RRHH antes de alquilar flota.",
        ]}
      />

      {error ? (
        <p className="rounded-lg border border-[rgba(255,42,95,0.35)] bg-[rgba(255,42,95,0.08)] px-4 py-3 text-sm">
          {error}
        </p>
      ) : null}
      {msg ? (
        <p className="rounded-lg border border-[rgba(16,185,129,0.35)] bg-[rgba(16,185,129,0.08)] px-4 py-3 text-sm">
          {msg}
        </p>
      ) : null}

      {/* SLA gauges */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Gauge label="Puntualidad SLA" value={dash?.sla.punctualityPct ?? 0} />
        <Gauge
          label="Disponibilidad flota"
          value={dash?.sla.availabilityPct ?? 0}
        />
        <div className="fsg-panel p-5">
          <p className="text-xs uppercase tracking-wider text-[var(--text-secondary)]">
            Servicios 24h
          </p>
          <p className="mt-3 font-mono text-3xl text-[var(--text-primary)]">
            {dash?.sla.tripsToday ?? "—"}
          </p>
        </div>
        <div className="fsg-panel p-5">
          <p className="text-xs uppercase tracking-wider text-[var(--text-secondary)]">
            Paradas activas
          </p>
          <p className="mt-3 font-mono text-3xl text-[var(--text-primary)]">
            {dash?.sla.fleetStopsActive ?? "—"}
          </p>
          <Button
            type="button"
            variant="primary"
            className="mt-3"
            disabled={busy}
            onClick={() => void approveFirstPendingStop()}
          >
            Aprobar parada flota
          </Button>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
        {/* Gantt */}
        <section id="gantt" className="fsg-panel overflow-hidden p-4">
          <header className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-display text-lg text-[var(--text-primary)]">
                Cronograma táctico
              </h3>
              <p className="text-sm text-[var(--text-secondary)]">
                Arrastrar y soltar · reasignación en vivo
              </p>
            </div>
            {dragId ? <Badge tone="amber">Reasignación lista</Badge> : null}
          </header>
          <div className="space-y-2">
            {plates.length === 0 ? (
              <p className="py-10 text-center text-sm text-[var(--text-secondary)]">
                Sin programación en ventana
              </p>
            ) : (
              plates.map((plate) => (
                <div key={plate} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 font-mono text-xs text-[var(--accent-primary)]">
                    {plate}
                  </span>
                  <div
                    className="relative h-10 flex-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)]"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragId) void overrideFromDrag(dragId);
                    }}
                  >
                    {(dash?.gantt ?? [])
                      .filter((g) => g.plate === plate)
                      .map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          draggable={!g.ganttBlocked}
                          onDragStart={() => setDragId(g.id)}
                          title={
                            g.ganttBlocked
                              ? g.blockReason || "Bloqueado"
                              : `${g.code} · ${g.driverName || "—"}`
                          }
                          className={`absolute top-1 h-8 truncate rounded px-2 text-left font-mono text-[10px] text-white ${
                            g.ganttBlocked
                              ? "cursor-not-allowed bg-[var(--danger,#FF2A5F)] opacity-80"
                              : "cursor-grab bg-[var(--accent-primary)]"
                          }`}
                          style={barStyle(g)}
                        >
                          {g.code}
                          {g.ganttBlocked ? " ⛔" : ""}
                        </button>
                      ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Radar novedades */}
        <aside id="novedades" className="fsg-panel overflow-hidden">
          <header className="border-b border-[var(--border-subtle)] px-4 py-3">
            <h3 className="font-display text-base text-[var(--text-primary)]">
              Radar de novedades
            </h3>
            <p className="text-xs text-[var(--text-secondary)]">
              Tráfico · ingreso · SOS
            </p>
          </header>
          <ul className="max-h-[420px] divide-y divide-[var(--border-subtle)] overflow-y-auto">
            {(dash?.novedades ?? []).length === 0 ? (
              <li className="px-4 py-8 text-sm text-[var(--text-secondary)]">
                Conexión nominal
              </li>
            ) : (
              dash!.novedades.map((n) => (
                <li key={n.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-[var(--text-primary)]">
                      {n.title}
                    </p>
                    <Badge tone={n.severity === "ALERT" ? "rose" : "amber"}>
                      {n.kind}
                    </Badge>
                  </div>
                  <p className="mt-1 font-mono text-[10px] text-[var(--text-secondary)]">
                    {new Date(n.at).toLocaleString("es-CO")}
                  </p>
                </li>
              ))
            )}
          </ul>
        </aside>
      </div>

      {/* Capacity */}
      <section id="capacidad" className="fsg-panel p-5">
        <h3 className="font-display text-lg text-[var(--text-primary)]">
          Planeación de capacidad
        </h3>
        <p className="text-sm text-[var(--text-secondary)]">
          Flota disponible descontando taller y RRHH
        </p>
        {capacity ? (
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <p className="font-mono text-2xl text-[var(--text-primary)]">
                {capacity.fleet.available}/{capacity.fleet.total}
              </p>
              <p className="text-xs text-[var(--text-secondary)]">
                Unidades · {capacity.fleet.seatsAvailable} asientos
              </p>
            </div>
            <div>
              <p className="font-mono text-2xl text-[var(--text-primary)]">
                {capacity.drivers.available}/{capacity.drivers.total}
              </p>
              <p className="text-xs text-[var(--text-secondary)]">
                Conductores · {capacity.drivers.resting} descanso
              </p>
            </div>
            <div>
              <p className="font-mono text-2xl text-[var(--text-primary)]">
                Δ {capacity.demand.shortfall}
              </p>
              <p className="text-xs text-[var(--text-secondary)]">
                Déficit pico · {capacity.demand.scheduledTrips} servicios
              </p>
            </div>
          </div>
        ) : null}
        <ul className="mt-4 space-y-1 text-sm text-[var(--text-secondary)]">
          {(capacity?.suggestions ?? []).map((s) => (
            <li key={s}>· {s}</li>
          ))}
        </ul>
        {(capacity?.routeRentabilidad?.length ?? 0) > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase text-[var(--text-secondary)]">
                  <th className="py-2">Ruta</th>
                  <th>Ingresos</th>
                  <th>$/km</th>
                  <th>Viajes</th>
                </tr>
              </thead>
              <tbody>
                {capacity!.routeRentabilidad.map((r) => (
                  <tr key={r.route} className="border-t border-[var(--border-subtle)]">
                    <td className="py-2 text-[var(--text-primary)]">{r.route}</td>
                    <td className="font-mono">
                      ${r.revenue.toLocaleString("es-CO")}
                    </td>
                    <td className="font-mono">
                      {r.revenuePerKm != null ? r.revenuePerKm : "—"}
                    </td>
                    <td className="font-mono">{r.trips}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
