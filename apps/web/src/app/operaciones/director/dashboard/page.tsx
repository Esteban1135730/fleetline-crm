"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { Calendar, Radio, Shield } from "lucide-react";
import { api } from "@/lib/api";
import { BentoPanel } from "@/components/nexa/bento-panel";
import { NexaTable, NexaRow, NexaCell } from "@/components/nexa/nexa-table";
import { StatusPulseBadge } from "@/components/audit/KpiCard";

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

function SlaGauge({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  const tone =
    pct >= 85 ? "active" : pct >= 70 ? "fatiga" : ("danger" as const);
  return (
    <BentoPanel title={label} subtitle="SLA">
      <div className="flex items-center justify-between">
        <StatusPulseBadge tone={tone}>{pct}%</StatusPulseBadge>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-brand-border">
        <div
          className="h-full rounded-full bg-brand-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-3 font-data text-3xl tabular-nums text-brand-text-primary">
        {pct}
        <span className="text-base text-brand-text-secondary"> %</span>
      </p>
    </BentoPanel>
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
      +(g.arriveAt
        ? new Date(g.arriveAt)
        : new Date(+new Date(g.departAt) + 2 * 3600_000)),
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
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-border pb-4">
        <div>
          <p className="font-data text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-primary">
            Operaciones · Dirección
          </p>
          <h1 className="font-sans text-2xl font-semibold tracking-tight text-brand-text-primary md:text-3xl">
            Torre de control táctica
          </h1>
        </div>
      </header>

      {error ? (
        <p className="rounded-lg border border-brand-danger/40 bg-brand-danger/10 px-4 py-3 font-data text-sm text-brand-danger">
          {error}
        </p>
      ) : null}
      {msg ? (
        <p className="rounded-lg border border-brand-success/40 bg-brand-success/10 px-4 py-3 font-data text-sm text-brand-success">
          {msg}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        <SlaGauge label="Puntualidad SLA" value={dash?.sla.punctualityPct ?? 0} />
        <SlaGauge
          label="Disponibilidad flota"
          value={dash?.sla.availabilityPct ?? 0}
        />
        <BentoPanel title="Servicios 24h" subtitle="Ventana operativa">
          <p className="font-data text-3xl tabular-nums text-brand-text-primary">
            {dash?.sla.tripsToday ?? "—"}
          </p>
        </BentoPanel>
        <BentoPanel title="Paradas activas" subtitle="Flota · mantenimiento">
          <p className="font-data text-3xl tabular-nums text-brand-text-primary">
            {dash?.sla.fleetStopsActive ?? "—"}
          </p>
          <div className="mt-3 flex justify-end">
            <Button
              type="button"
              variant="primary"
              className="w-auto px-3 py-1.5 text-xs"
              disabled={busy}
              onClick={() => void approveFirstPendingStop()}
            >
              Aprobar parada
            </Button>
          </div>
        </BentoPanel>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 lg:gap-4">
        <BentoPanel
          id="gantt"
          title="Cronograma táctico"
          subtitle="Arrastrar y soltar · reasignación en vivo"
          icon={<Calendar />}
          className="lg:col-span-8"
          action={
            dragId ? <Badge tone="warning">Reasignación lista</Badge> : null
          }
        >
          <div className="space-y-2">
            {plates.length === 0 ? (
              <p className="py-10 text-center font-sans text-sm text-brand-text-secondary">
                Sin programación en ventana
              </p>
            ) : (
              plates.map((plate) => (
                <div key={plate} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 font-data text-xs text-brand-primary">
                    {plate}
                  </span>
                  <div
                    className="relative h-10 flex-1 rounded-md border border-brand-border bg-brand-canvas"
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
                          className={`absolute top-1 h-8 truncate rounded px-2 text-left font-data text-[10px] text-white ${
                            g.ganttBlocked
                              ? "cursor-not-allowed bg-brand-danger opacity-80"
                              : "cursor-grab bg-brand-primary"
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
        </BentoPanel>

        <BentoPanel
          id="novedades"
          title="Radar de novedades"
          subtitle="Tráfico · ingreso · SOS"
          icon={<Radio />}
          className="lg:col-span-4"
        >
          <ul className="max-h-[420px] space-y-2 overflow-y-auto">
            {(dash?.novedades ?? []).length === 0 ? (
              <li className="py-8 font-sans text-sm text-brand-text-secondary">
                Conexión nominal
              </li>
            ) : (
              dash!.novedades.map((n) => (
                <li
                  key={n.id}
                  className="rounded-lg border border-brand-border px-3 py-2 transition-colors hover:border-brand-border-active"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-sans text-sm text-brand-text-primary">
                      {n.title}
                    </p>
                    <Badge tone={n.severity === "ALERT" ? "danger" : "warning"}>
                      {n.kind}
                    </Badge>
                  </div>
                  <p className="mt-1 font-data text-[10px] tabular-nums text-brand-text-secondary">
                    {new Date(n.at).toLocaleString("es-CO")}
                  </p>
                </li>
              ))
            )}
          </ul>
        </BentoPanel>

        <BentoPanel
          id="capacidad"
          title="Planeación de capacidad"
          subtitle="Flota disponible descontando taller y RRHH"
          icon={<Shield />}
          className="lg:col-span-12"
        >
          {capacity ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <p className="font-data text-2xl tabular-nums text-brand-text-primary">
                  {capacity.fleet.available}/{capacity.fleet.total}
                </p>
                <p className="font-data text-[10px] uppercase tracking-wider text-brand-text-secondary">
                  Unidades · {capacity.fleet.seatsAvailable} asientos
                </p>
              </div>
              <div>
                <p className="font-data text-2xl tabular-nums text-brand-text-primary">
                  {capacity.drivers.available}/{capacity.drivers.total}
                </p>
                <p className="font-data text-[10px] uppercase tracking-wider text-brand-text-secondary">
                  Conductores · {capacity.drivers.resting} descanso
                </p>
              </div>
              <div>
                <p className="font-data text-2xl tabular-nums text-brand-text-primary">
                  Δ {capacity.demand.shortfall}
                </p>
                <p className="font-data text-[10px] uppercase tracking-wider text-brand-text-secondary">
                  Déficit pico · {capacity.demand.scheduledTrips} servicios
                </p>
              </div>
            </div>
          ) : null}
          <ul className="mt-4 space-y-1 font-sans text-sm text-brand-text-secondary">
            {(capacity?.suggestions ?? []).map((s) => (
              <li key={s}>· {s}</li>
            ))}
          </ul>
          {(capacity?.routeRentabilidad?.length ?? 0) > 0 ? (
            <div className="mt-4">
              <NexaTable columns={["Ruta", "Ingresos", "$/km", "Viajes"]}>
                {capacity!.routeRentabilidad.map((r) => (
                  <NexaRow key={r.route}>
                    <NexaCell>{r.route}</NexaCell>
                    <NexaCell mono>
                      ${r.revenue.toLocaleString("es-CO")}
                    </NexaCell>
                    <NexaCell mono>
                      {r.revenuePerKm != null ? r.revenuePerKm : "—"}
                    </NexaCell>
                    <NexaCell mono>{r.trips}</NexaCell>
                  </NexaRow>
                ))}
              </NexaTable>
            </div>
          ) : null}
        </BentoPanel>
      </div>
    </div>
  );
}
