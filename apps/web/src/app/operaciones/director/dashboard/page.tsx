"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import {
  Bus,
  Calendar,
  MapPinned,
  Radio,
  RefreshCw,
  Shield,
} from "lucide-react";
import { api } from "@/lib/api";
import { statusEs } from "@fsg/shared";
import { BentoPanel } from "@/components/nexa/bento-panel";
import { NexaTable, NexaRow, NexaCell } from "@/components/nexa/nexa-table";
import { EmptyState, StatusPulseBadge } from "@/components/audit";

type GanttBar = {
  id: string;
  code: string;
  vehicleId?: string | null;
  plate?: string | null;
  driverName?: string | null;
  customerName?: string | null;
  origin?: string;
  destination?: string;
  departAt: string;
  arriveAt?: string | null;
  status: string;
  ganttBlocked: boolean;
  blockReason?: string;
};

type Dash = {
  asOf?: string;
  window?: { start: string; end: string };
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
  tower?: {
    tripsOpen: number;
    inTransit: number;
    incidents: number;
    fleetTotal: number;
    fleetAvailable: number;
    fleetOnline: number;
    driversOnDuty: number;
  };
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

const UNASSIGNED = "Sin unidad";

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

function statusTone(status: string): "success" | "warning" | "danger" | "info" {
  const u = status.toUpperCase();
  if (u === "IN_TRANSIT") return "success";
  if (u === "INCIDENT") return "danger";
  if (u === "COMPLETED") return "info";
  return "warning";
}

export default function DirectorOperativoDashboardPage() {
  const [dash, setDash] = useState<Dash | null>(null);
  const [capacity, setCapacity] = useState<Capacity | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [d, c] = await Promise.all([
        api.get<Dash>("/api/v1/operaciones/director/dashboard"),
        api.get<Capacity>("/api/v1/operaciones/director/capacity-planning"),
      ]);
      setDash(d);
      setCapacity(c);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo cargar la torre táctica. Reintente.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 20_000);
    return () => clearInterval(t);
  }, [load]);

  const plates = useMemo(() => {
    const set = new Set<string>();
    let hasUnassigned = false;
    for (const g of dash?.gantt ?? []) {
      if (g.plate) set.add(g.plate);
      else hasUnassigned = true;
    }
    for (const s of dash?.fleetStops ?? []) {
      set.add(s.vehicle.plate);
    }
    const list = [...set].sort();
    if (hasUnassigned) list.push(UNASSIGNED);
    return list;
  }, [dash]);

  const windowStart = useMemo(() => {
    if (dash?.window?.start) return +new Date(dash.window.start);
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return +d;
  }, [dash?.window?.start]);
  const windowEnd = useMemo(() => {
    if (dash?.window?.end) return +new Date(dash.window.end);
    return windowStart + 24 * 60 * 60 * 1000;
  }, [dash?.window?.end, windowStart]);

  const hourMarks = useMemo(() => {
    const marks: number[] = [];
    for (let h = 0; h <= 24; h += 4) marks.push(h);
    return marks;
  }, []);

  async function approveFirstPendingStop() {
    const pending = dash?.fleetStops.find((s) => s.status === "PENDING");
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      if (pending) {
        const res = await api.post<{ message: string }>(
          "/api/v1/operaciones/director/aprobar-parada-flota",
          { fleetStopId: pending.id, approve: true },
          { confirm: { skip: true } },
        );
        setMsg(res.message);
      } else {
        const first = dash?.gantt.find((g) => g.vehicleId);
        if (!first?.vehicleId) {
          setError("Sin vehículo para crear parada de flota");
          return;
        }
        const res = await api.post<{ message: string }>(
          "/api/v1/operaciones/director/aprobar-parada-flota",
          {
            vehicleId: first.vehicleId,
            reason: "Mantenimiento preventivo — ventana baja demanda",
            approve: true,
            preferLowDemandWindow: true,
          },
          { confirm: { skip: true } },
        );
        setMsg(res.message);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Aprobación fallida");
    } finally {
      setBusy(false);
    }
  }

  async function overrideFromDrag(tripId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{
        trip: { code: string; vehicle?: { plate: string } };
        contingencyPool: Array<{ plate: string; distanceKm: number }>;
      }>(
        "/api/v1/operaciones/director/override-reasignar",
        {
          tripId,
          reason: "Contingencia mayor — reasignación de cronograma",
          radiusKm: 20,
          forceOverride: true,
          notifyDrivers: true,
          notifyCustomers: true,
        },
        { confirm: { skip: true } },
      );
      setMsg(
        `Override ${res.trip.code} → ${res.trip.vehicle?.plate ?? "pool"} · ${res.contingencyPool.length} unidades en radio`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reasignación fallida");
    } finally {
      setBusy(false);
      setDragId(null);
    }
  }

  function barStyle(g: GanttBar) {
    const span = Math.max(1, windowEnd - windowStart);
    const rawStart = +new Date(g.departAt);
    const rawEnd = g.arriveAt
      ? +new Date(g.arriveAt)
      : rawStart + 2 * 3600_000;
    // Viajes abiertos iniciados antes de hoy: anclar al inicio de la ventana
    const start = Math.max(Math.min(rawStart, windowEnd - 1), windowStart);
    const end = Math.max(
      Math.min(Math.max(rawEnd, start + 30 * 60_000), windowEnd),
      start + 30 * 60_000,
    );
    const left = ((start - windowStart) / span) * 100;
    const width = Math.max(2.5, ((end - start) / span) * 100);
    return { left: `${left}%`, width: `${Math.min(width, 100 - left)}%` };
  }

  const tower = dash?.tower;

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
          <p className="mt-1 text-sm text-brand-text-secondary">
            Gantt de flota · radar de novedades · capacidad
            {dash?.asOf
              ? ` · actualizado ${new Date(dash.asOf).toLocaleTimeString("es-CO", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/operaciones/tablero"
            className="inline-flex items-center gap-1.5 rounded-lg border border-brand-border px-3 py-2 text-xs text-brand-text-secondary hover:bg-brand-surface"
          >
            <MapPinned className="h-3.5 w-3.5" aria-hidden />
            Tablero y mapa
          </Link>
          <Button
            type="button"
            variant="ghost"
            className="w-auto px-3 py-1.5 text-xs"
            disabled={loading || busy}
            onClick={() => void load()}
          >
            <RefreshCw className="mr-1 inline h-3 w-3" aria-hidden />
            Refrescar
          </Button>
        </div>
      </header>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-brand-danger/40 bg-brand-danger/10 px-4 py-3 font-data text-sm text-brand-danger"
        >
          {error}
        </p>
      ) : null}
      {msg ? (
        <p className="rounded-lg border border-brand-success/40 bg-brand-success/10 px-4 py-3 font-data text-sm text-brand-success">
          {msg}
        </p>
      ) : null}

      {loading && !dash ? (
        <EmptyState
          title="Cargando torre táctica"
          description="Sincronizando viajes, flota y capacidad…"
        />
      ) : (
        <>
          <BentoPanel
            id="torre"
            title="Torre de Control"
            subtitle="Operación abierta · flota y servicio en vivo"
            icon={<Bus className="h-4 w-4" aria-hidden />}
          >
            {!tower && !dash ? (
              <EmptyState
                title="Sin datos de torre"
                description="No hay señal operativa. Reintente o revise permisos de logística."
              />
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <div className="rounded-xl border border-brand-border px-3 py-3">
                  <p className="font-data text-[10px] uppercase tracking-wider text-brand-text-secondary">
                    Viajes abiertos
                  </p>
                  <p className="mt-1 font-data text-2xl tabular-nums">
                    {tower?.tripsOpen ?? dash?.sla.tripsToday ?? 0}
                  </p>
                </div>
                <div className="rounded-xl border border-brand-border px-3 py-3">
                  <p className="font-data text-[10px] uppercase tracking-wider text-brand-text-secondary">
                    En ruta
                  </p>
                  <p className="mt-1 font-data text-2xl tabular-nums text-brand-primary">
                    {tower?.inTransit ?? 0}
                  </p>
                </div>
                <div className="rounded-xl border border-brand-border px-3 py-3">
                  <p className="font-data text-[10px] uppercase tracking-wider text-brand-text-secondary">
                    Incidentes
                  </p>
                  <p className="mt-1 font-data text-2xl tabular-nums text-brand-danger">
                    {tower?.incidents ?? 0}
                  </p>
                </div>
                <div className="rounded-xl border border-brand-border px-3 py-3">
                  <p className="font-data text-[10px] uppercase tracking-wider text-brand-text-secondary">
                    Flota online
                  </p>
                  <p className="mt-1 font-data text-2xl tabular-nums">
                    {tower?.fleetOnline ?? 0}
                    <span className="text-sm text-brand-text-secondary">
                      /{tower?.fleetTotal ?? "—"}
                    </span>
                  </p>
                </div>
                <div className="rounded-xl border border-brand-border px-3 py-3">
                  <p className="font-data text-[10px] uppercase tracking-wider text-brand-text-secondary">
                    Disponibles
                  </p>
                  <p className="mt-1 font-data text-2xl tabular-nums">
                    {tower?.fleetAvailable ?? "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-brand-border px-3 py-3">
                  <p className="font-data text-[10px] uppercase tracking-wider text-brand-text-secondary">
                    Conductores en turno
                  </p>
                  <p className="mt-1 font-data text-2xl tabular-nums">
                    {tower?.driversOnDuty ?? 0}
                  </p>
                </div>
              </div>
            )}
            {(dash?.gantt?.length ?? 0) > 0 ? (
              <div className="mt-4">
                <NexaTable
                  columns={["Viaje", "Unidad", "Estado", "Ruta", "Salida"]}
                >
                  {dash!.gantt.slice(0, 8).map((g) => (
                    <NexaRow key={g.id}>
                      <NexaCell mono className="text-xs text-brand-primary">
                        {g.code}
                      </NexaCell>
                      <NexaCell mono>{g.plate || "—"}</NexaCell>
                      <NexaCell>
                        <Badge tone={statusTone(g.status)}>
                          {statusEs(g.status)}
                        </Badge>
                      </NexaCell>
                      <NexaCell className="text-xs text-brand-text-secondary">
                        {g.origin && g.destination
                          ? `${g.origin} → ${g.destination}`
                          : g.customerName || "—"}
                      </NexaCell>
                      <NexaCell mono className="text-xs">
                        {new Date(g.departAt).toLocaleString("es-CO", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </NexaCell>
                    </NexaRow>
                  ))}
                </NexaTable>
              </div>
            ) : (
              <p className="mt-4 text-sm text-brand-text-secondary">
                No hay viajes abiertos ni programados para hoy.
              </p>
            )}
          </BentoPanel>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
            <SlaGauge
              label="Puntualidad SLA"
              value={dash?.sla.punctualityPct ?? 0}
            />
            <SlaGauge
              label="Disponibilidad flota"
              value={dash?.sla.availabilityPct ?? 0}
            />
            <BentoPanel title="Servicios abiertos" subtitle="Hoy + en curso">
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
              title="Gantt de flota"
              subtitle="Línea de tiempo del día · arrastre para override"
              icon={<Calendar className="h-4 w-4" aria-hidden />}
              className="lg:col-span-8"
              action={
                dragId ? (
                  <Badge tone="warning">Reasignación lista</Badge>
                ) : null
              }
            >
              {!(dash?.gantt?.length) && !(dash?.fleetStops?.length) ? (
                <EmptyState
                  icon={<Calendar className="h-7 w-7" />}
                  title="No hay viajes hoy"
                  description="No hay servicios programados para hoy ni viajes abiertos en curso. Revise Logística → Servicios o el Tablero y mapa."
                  actionLabel="Ir al tablero"
                  onAction={() => {
                    window.location.href = "/operaciones/tablero";
                  }}
                />
              ) : (
                <div className="space-y-2">
                  <div className="relative mb-1 ml-20 h-4">
                    {hourMarks.map((h) => (
                      <span
                        key={h}
                        className="absolute -translate-x-1/2 font-data text-[9px] text-brand-text-secondary"
                        style={{ left: `${(h / 24) * 100}%` }}
                      >
                        {String(h).padStart(2, "0")}:00
                      </span>
                    ))}
                  </div>
                  {plates.map((plate) => (
                    <div key={plate} className="flex items-center gap-3">
                      <span className="w-20 shrink-0 truncate font-data text-xs text-brand-primary">
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
                          .filter((g) =>
                            plate === UNASSIGNED
                              ? !g.plate
                              : g.plate === plate,
                          )
                          .map((g) => (
                            <button
                              key={g.id}
                              type="button"
                              draggable={!g.ganttBlocked}
                              onDragStart={() => setDragId(g.id)}
                              title={
                                g.ganttBlocked
                                  ? g.blockReason || "Bloqueado"
                                  : `${g.code} · ${statusEs(g.status)} · ${g.driverName || "—"}`
                              }
                              className={`absolute top-1 h-8 truncate rounded px-2 text-left font-data text-[10px] text-white ${
                                g.ganttBlocked
                                  ? "cursor-not-allowed bg-brand-danger opacity-80"
                                  : g.status === "IN_TRANSIT"
                                    ? "cursor-grab bg-brand-success"
                                    : g.status === "INCIDENT"
                                      ? "cursor-grab bg-brand-danger"
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
                  ))}
                  <p className="pt-2 font-data text-[10px] text-brand-text-secondary">
                    {(dash?.gantt ?? []).length} barra(s) · ventana{" "}
                    {new Date(windowStart).toLocaleDateString("es-CO")}
                  </p>
                </div>
              )}
            </BentoPanel>

            <BentoPanel
              id="novedades"
              title="Radar de novedades"
              subtitle="Tráfico · ingreso · SOS"
              icon={<Radio className="h-4 w-4" aria-hidden />}
              className="lg:col-span-4"
            >
              <ul className="max-h-[420px] space-y-2 overflow-y-auto">
                {(dash?.novedades ?? []).length === 0 ? (
                  <li>
                    <EmptyState
                      title="Sin novedades"
                      description="Conexión nominal — no hay alertas ni paradas pendientes."
                    />
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
                        <Badge
                          tone={n.severity === "ALERT" ? "danger" : "warning"}
                        >
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
              icon={<Shield className="h-4 w-4" aria-hidden />}
              className="lg:col-span-12"
            >
              {!capacity ? (
                <EmptyState
                  title="Capacidad no disponible"
                  description="No se pudo cargar el planeamiento. Use Refrescar."
                />
              ) : (
                <>
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
                  <ul className="mt-4 space-y-1 font-sans text-sm text-brand-text-secondary">
                    {(capacity.suggestions ?? []).map((s) => (
                      <li key={s}>· {s}</li>
                    ))}
                  </ul>
                  {(capacity.routeRentabilidad?.length ?? 0) > 0 ? (
                    <div className="mt-4">
                      <NexaTable columns={["Ruta", "Ingresos", "$/km", "Viajes"]}>
                        {capacity.routeRentabilidad.map((r) => (
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
                </>
              )}
            </BentoPanel>
          </div>
        </>
      )}
    </div>
  );
}
