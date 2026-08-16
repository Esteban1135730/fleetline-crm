"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Button } from "@fsg/ui";
import { Bell, MapPin, Plus, Radio } from "lucide-react";
import { api } from "@/lib/api";
import { statusEs } from "@fsg/shared";
import { PageIntro } from "@/components/page-intro";
import {
  EmptyState,
  SlideOver,
  StatusPulseBadge,
} from "@/components/audit";
import {
  RouteMap,
  ServerClockBadge,
  type Servicio,
  type Tracking,
} from "@/components/logistica/logistica-shared";
import type { PlacePin } from "@/components/logistica/servicio-map-planner";
import { SupervisorDeviationsPanel } from "@/components/logistica/supervisor-deviations-panel";
import { OpsChatPanel } from "@/components/logistica/ops-chat-panel";

const ServicioMapPlanner = dynamic(
  () =>
    import("@/components/logistica/servicio-map-planner").then(
      (m) => m.ServicioMapPlanner,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-[#0A0D14] text-sm text-[var(--brand-muted)]">
        Cargando mapa…
      </div>
    ),
  },
);

type PoolDriver = {
  id: string;
  name: string;
  document: string;
  fatigueScore: number;
  dispatchBlocked: boolean;
  ready: boolean;
  blockers: string[];
};

type PoolVehicle = {
  id: string;
  plate: string;
  status: string;
  complianceBlocked: boolean;
  ready: boolean;
  blockers: string[];
};

type CreateResult = Servicio & {
  message?: string;
  assigned?: boolean;
  dispatchNotes?: string[];
};

export default function LogisticaServiciosPage() {
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [drivers, setDrivers] = useState<PoolDriver[]>([]);
  const [vehicles, setVehicles] = useState<PoolVehicle[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tracking, setTracking] = useState<Tracking | null>(null);
  const [clock, setClock] = useState<string>("—");
  const [error, setError] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [originPin, setOriginPin] = useState<PlacePin | null>(null);
  const [destPin, setDestPin] = useState<PlacePin | null>(null);
  const [assignDriverId, setAssignDriverId] = useState("");
  const [assignVehicleId, setAssignVehicleId] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [focusCode, setFocusCode] = useState<string | null>(null);
  const [focusMissing, setFocusMissing] = useState(false);
  const [listLoaded, setListLoaded] = useState(false);
  const [deviationsOpen, setDeviationsOpen] = useState(false);
  const [deviationCount, setDeviationCount] = useState(0);
  const [form, setForm] = useState({
    departAt: "",
    arriveAt: "",
    driverId: "",
    vehicleId: "",
    officerName: "",
    officerDocument: "",
  });

  const selected = useMemo(
    () => servicios.find((s) => s.id === selectedId) ?? null,
    [servicios, selectedId],
  );

  const selectedDriver = drivers.find((d) => d.id === form.driverId);
  const selectedVehicle = vehicles.find((v) => v.id === form.vehicleId);

  const loadServicios = useCallback(async () => {
    const rows = await api<Servicio[]>("/logistica/servicios");
    setServicios(rows);
    setListLoaded(true);
  }, []);

  const loadPool = useCallback(async () => {
    const pool = await api<{ drivers: PoolDriver[]; vehicles: PoolVehicle[] }>(
      "/logistica/servicios/recursos-despacho",
    );
    setDrivers(pool.drivers);
    setVehicles(pool.vehicles);
  }, []);

  const loadClock = useCallback(async () => {
    const c = await api<{ iso: string }>("/logistica/reloj");
    setClock(new Date(c.iso).toLocaleTimeString("es-CO", { hour12: false }));
  }, []);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");
    setFocusCode(code);
  }, []);

  useEffect(() => {
    void Promise.all([loadServicios(), loadPool(), loadClock()]).catch((e) =>
      setError(e instanceof Error ? e.message : "Conexión fallida"),
    );
    const t = setInterval(() => void loadClock(), 1000);
    return () => clearInterval(t);
  }, [loadServicios, loadPool, loadClock]);

  useEffect(() => {
    let alive = true;
    const pullCount = async () => {
      try {
        const data = await api<unknown[]>(
          "/api/v1/servicios/desviaciones/pendientes",
        );
        if (alive) setDeviationCount(data.length);
      } catch {
        /* silent — campana sin badge */
      }
    };
    void pullCount();
    const iv = setInterval(pullCount, 12_000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setTracking(null);
      return;
    }
    let alive = true;
    const pull = async () => {
      try {
        const t = await api<Tracking>(
          `/logistica/servicios/${selectedId}/tracking`,
        );
        if (alive) setTracking(t);
      } catch (e) {
        if (alive)
          setError(e instanceof Error ? e.message : "Seguimiento fallido");
      }
    };
    void pull();
    const iv = setInterval(pull, 8000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [selectedId]);

  useEffect(() => {
    if (!focusCode) {
      setFocusMissing(false);
      return;
    }
    if (!listLoaded) return;
    const hit = servicios.find((s) => s.code === focusCode);
    if (hit) {
      setSelectedId(hit.id);
      setCreateOpen(false);
      setFocusMissing(false);
    } else {
      setFocusMissing(true);
    }
  }, [focusCode, servicios, listLoaded]);

  async function onCreateServicio(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!originPin || !destPin) {
      setError("Paso 1 incompleto: marca origen (A) y destino (B) en el mapa");
      return;
    }
    if (!form.departAt) {
      setError("Paso 2 incompleto: indica fecha/hora de salida");
      return;
    }
    try {
      const created = await api<CreateResult>("/logistica/servicios", {
        method: "POST",
        body: JSON.stringify({
          origin: originPin.label,
          destination: destPin.label,
          originLat: originPin.lat,
          originLng: originPin.lng,
          destLat: destPin.lat,
          destLng: destPin.lng,
          departAt: new Date(form.departAt).toISOString(),
          arriveAt: form.arriveAt
            ? new Date(form.arriveAt).toISOString()
            : undefined,
          driverId: form.driverId || undefined,
          vehicleId: form.vehicleId || undefined,
          officerName: form.officerName || undefined,
          officerDocument: form.officerDocument || undefined,
        }),
      });
      setStatusMsg(created.message || `Servicio ${created.code} indexado`);
      setOriginPin(null);
      setDestPin(null);
      setForm({
        departAt: "",
        arriveAt: "",
        driverId: "",
        vehicleId: "",
        officerName: "",
        officerDocument: "",
      });
      await loadServicios();
      setSelectedId(created.id);
      setCreateOpen(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo crear servicio",
      );
    }
  }

  async function asignarPendiente() {
    if (!selectedId || !assignDriverId || !assignVehicleId) {
      setError("Elige conductor y vehículo aptos para asignar");
      return;
    }
    setError("");
    try {
      await api(`/logistica/servicios/${selectedId}/asignar`, {
        method: "POST",
        body: JSON.stringify({
          driverId: assignDriverId,
          vehicleId: assignVehicleId,
        }),
      });
      setStatusMsg("Servicio asignado — lista normativa correcta");
      setAssignDriverId("");
      setAssignVehicleId("");
      await loadServicios();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Asignación fallida");
    }
  }

  async function iniciar(id: string) {
    try {
      await api(`/logistica/servicios/${id}/iniciar`, {
        method: "POST",
        body: "{}",
      });
      setStatusMsg("Servicio EN PROCESO — GPS en vivo");
      await loadServicios();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar");
    }
  }

  async function cerrar(id: string) {
    try {
      await api(`/logistica/servicios/${id}/cerrar`, {
        method: "POST",
        body: "{}",
      });
      setStatusMsg("Servicio cerrado — extras liquidados");
      await loadServicios();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cerrar");
    }
  }

  const canConfirm = Boolean(originPin && destPin && form.departAt);
  const step1 = Boolean(originPin && destPin);
  const step2 = Boolean(form.departAt);
  const step3Ready =
    Boolean(form.driverId && form.vehicleId) &&
    Boolean(selectedDriver?.ready && selectedVehicle?.ready);

  function openCreate() {
    setCreateOpen(true);
    setError("");
  }

  return (
    <div
      className="fade-in flex h-[calc(100vh-5.5rem)] min-h-[560px] flex-col gap-3"
      data-testid="panel-servicios"
    >
      <PageIntro
        module="logistica"
        title="Programación de servicios y seguimiento GPS"
        action={
          <div className="flex items-center gap-2">
            <ServerClockBadge clock={clock} />
            <Button
              type="button"
              variant="ghost"
              className="relative w-auto px-3"
              aria-label="Desviaciones pendientes"
              onClick={() => setDeviationsOpen(true)}
            >
              <Bell className="h-4 w-4" />
              {deviationCount > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--brand-signal,#FF2A5F)] px-1 font-mono text-[10px] font-bold text-white tabular-nums">
                  {deviationCount}
                </span>
              ) : null}
            </Button>
            <Button
              type="button"
              variant="primary"
              className="w-auto"
              onClick={openCreate}
            >
              <Plus className="mr-1 h-4 w-4" />
              Nueva ruta
            </Button>
          </div>
        }
      />

      {focusCode && !focusMissing ? (
        <p className="rounded border border-[var(--brand-primary)]/30 bg-[var(--brand-primary)]/10 px-3 py-2 text-sm text-[var(--brand-primary)]">
          Enfocado {focusCode} — borrador desde Comercial. Asigne conductor y
          placa para despachar. El mapa queda vacío hasta georreferenciar la
          ruta.
        </p>
      ) : null}
      {focusMissing && focusCode ? (
        <p
          role="alert"
          className="rounded border border-[var(--brand-signal)]/40 bg-[var(--brand-signal)]/10 px-3 py-2 text-sm text-[var(--brand-signal)]"
        >
          {focusCode} no está en Programación de Servicios. Vuelva a Comercial y
          pulse Generar viaje en esa cotización.
        </p>
      ) : null}
      {statusMsg ? (
        <p className="rounded border border-[var(--brand-primary)]/30 bg-[var(--brand-primary)]/10 px-3 py-2 text-sm text-[var(--brand-primary)]">
          {statusMsg}
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="rounded border border-[var(--brand-signal)]/40 bg-[var(--brand-signal)]/10 px-3 py-2 text-sm text-[var(--brand-signal)]"
        >
          {error}
        </p>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]">
        {/* —— Izquierda: lista + alta + chat —— */}
        <aside className="relative z-10 flex min-h-0 flex-col gap-3 overflow-hidden">
          <div
            className={`fsg-panel flex flex-col overflow-hidden ${
              createOpen
                ? "max-h-[200px] shrink-0"
                : "min-h-[220px] flex-1"
            }`}
          >
            <div className="flex items-center justify-between border-b border-[var(--brand-line)] px-3 py-2">
              <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--brand-muted)]">
                Servicios ({servicios.length})
              </h2>
              <StatusPulseBadge
                tone={servicios.some((s) => s.status === "IN_TRANSIT") ? "active" : "neutral"}
                pulse={servicios.some((s) => s.status === "IN_TRANSIT")}
              >
                {servicios.some((s) => s.status === "IN_TRANSIT")
                  ? "En tránsito"
                  : "Nominal"}
              </StatusPulseBadge>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {!servicios.length ? (
                <div className="p-4">
                  <EmptyState
                    icon={<MapPin className="h-7 w-7" />}
                    title="Sin servicios indexados"
                    description="Crea una ruta en el mapa para despachar la flota."
                    actionLabel="Nueva ruta"
                    onAction={openCreate}
                  />
                </div>
              ) : (
                <ul className="divide-y divide-[var(--brand-line)]">
                  {servicios.map((s) => (
                    <li key={s.id}>
                      <div
                        role="button"
                        tabIndex={0}
                        className={`w-full cursor-pointer px-3 py-2.5 text-left transition-colors duration-150 ${
                          selectedId === s.id || s.code === focusCode
                            ? "bg-[var(--brand-primary)]/10"
                            : "hover:bg-white/[0.03]"
                        }`}
                        onClick={() => setSelectedId(s.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedId(s.id);
                          }
                        }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-data text-xs text-[var(--brand-primary)]">
                            {s.code}
                          </span>
                          <StatusPulseBadge
                            tone={
                              s.status === "IN_TRANSIT"
                                ? "active"
                                : s.status === "COMPLETED"
                                  ? "neutral"
                                  : "fatiga"
                            }
                            pulse={s.status === "IN_TRANSIT"}
                          >
                            {statusEs(s.status)}
                          </StatusPulseBadge>
                        </div>
                        <p className="mt-1 text-sm">
                          {s.origin} → {s.destination}
                        </p>
                        <p className="mt-0.5 text-[10px] text-[var(--brand-muted)]">
                          {s.driver?.name ?? "Sin conductor"} ·{" "}
                          {s.vehicle?.plate ?? "Sin placa"}
                          {s.customer?.name ? ` · ${s.customer.name}` : ""}
                        </p>
                        {s.meta?.quoteCode ? (
                          <p className="mt-0.5 font-data text-[10px] text-[var(--accent-metric,#FFB800)]">
                            Desde cotización {s.meta.quoteCode}
                          </p>
                        ) : null}
                        <div className="mt-2 flex flex-wrap gap-1">
                          {s.status !== "IN_TRANSIT" &&
                          s.status !== "COMPLETED" ? (
                            <Button
                              variant="ghost"
                              className="w-auto px-2 py-1 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                void iniciar(s.id);
                              }}
                            >
                              Iniciar
                            </Button>
                          ) : null}
                          {s.status === "IN_TRANSIT" ? (
                            <Button
                              variant="primary"
                              className="w-auto px-2 py-1 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                void cerrar(s.id);
                              }}
                            >
                              Cerrar
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {createOpen ? (
            <form
              id="crear-servicio"
              onSubmit={onCreateServicio}
              className="fsg-panel max-h-[min(52vh,28rem)] shrink-0 space-y-3 overflow-y-auto p-3"
              data-testid="servicio-form"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  Nueva ruta
                </h3>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-auto px-2 py-1 text-xs"
                  onClick={() => setCreateOpen(false)}
                >
                  Cerrar
                </Button>
              </div>

              <ol className="flex flex-wrap gap-1.5 text-[10px]">
                {[
                  { ok: step1, label: "1 · Ruta A→B" },
                  { ok: step2, label: "2 · Salida" },
                  { ok: step3Ready, label: "3 · Asignación" },
                ].map((s) => (
                  <li
                    key={s.label}
                    className={`rounded border px-2 py-0.5 ${
                      s.ok
                        ? "border-[var(--brand-primary)]/40 bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]"
                        : "border-[var(--border-subtle)] text-[var(--text-secondary)]"
                    }`}
                  >
                    {s.label}
                  </li>
                ))}
              </ol>

              <p className="text-xs text-[var(--text-secondary)]">
                Marca origen (A) y destino (B) en el mapa, o búscalo en las
                pestañas A / B.
              </p>
              <div className="grid gap-1.5 text-xs">
                <div className="rounded-md border border-[var(--border-subtle)] px-2 py-1.5">
                  <span className="font-data text-[10px] uppercase tracking-[0.1em] text-[var(--brand-amber,#D97706)]">
                    A · Origen
                  </span>
                  <p className="mt-0.5 text-[var(--text-primary)]">
                    {originPin?.label ?? "Sin marcar"}
                  </p>
                </div>
                <div className="rounded-md border border-[var(--border-subtle)] px-2 py-1.5">
                  <span className="font-data text-[10px] uppercase tracking-[0.1em] text-[var(--brand-signal,#DC2626)]">
                    B · Destino
                  </span>
                  <p className="mt-0.5 text-[var(--text-primary)]">
                    {destPin?.label ?? "Sin marcar"}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2">
                <label className="text-xs text-[var(--text-secondary)]">
                  Salida *
                  <input
                    className="field mt-1 w-full font-data"
                    type="datetime-local"
                    value={form.departAt}
                    onChange={(e) =>
                      setForm({ ...form, departAt: e.target.value })
                    }
                    required
                    aria-label="Salida"
                  />
                </label>
                <label className="text-xs text-[var(--text-secondary)]">
                  Llegada estimada
                  <input
                    className="field mt-1 w-full font-data"
                    type="datetime-local"
                    value={form.arriveAt}
                    onChange={(e) =>
                      setForm({ ...form, arriveAt: e.target.value })
                    }
                    aria-label="Llegada estimada"
                  />
                </label>
              </div>

              <label className="block text-xs text-[var(--text-secondary)]">
                Conductor (opcional)
                <select
                  className="field mt-1 w-full"
                  data-testid="dispatch-driver"
                  value={form.driverId}
                  onChange={(e) =>
                    setForm({ ...form, driverId: e.target.value })
                  }
                >
                  <option value="">Sin asignar ahora…</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.ready ? "✓ " : "⚠ "}
                      {d.name}
                      {!d.ready ? ` · ${d.blockers[0] ?? "revisar"}` : ""}
                    </option>
                  ))}
                </select>
                {selectedDriver && !selectedDriver.ready ? (
                  <p className="mt-1 text-[11px] text-[var(--brand-amber,#D97706)]">
                    No se asignará aún: {selectedDriver.blockers.join(" · ")}.
                  </p>
                ) : null}
              </label>

              <label className="block text-xs text-[var(--text-secondary)]">
                Vehículo / placa (opcional)
                <select
                  className="field mt-1 w-full"
                  data-testid="dispatch-vehicle"
                  value={form.vehicleId}
                  onChange={(e) =>
                    setForm({ ...form, vehicleId: e.target.value })
                  }
                >
                  <option value="">Sin asignar ahora…</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.ready ? "✓ " : "⚠ "}
                      {v.plate}
                      {!v.ready ? ` · ${v.blockers[0] ?? "revisar"}` : ""}
                    </option>
                  ))}
                </select>
                {selectedVehicle && !selectedVehicle.ready ? (
                  <p className="mt-1 text-[11px] text-[var(--brand-amber,#D97706)]">
                    No se asignará aún: {selectedVehicle.blockers.join(" · ")}.
                  </p>
                ) : null}
              </label>

              <div className="grid grid-cols-1 gap-2">
                <input
                  className="field"
                  placeholder="Funcionario / cliente"
                  value={form.officerName}
                  onChange={(e) =>
                    setForm({ ...form, officerName: e.target.value })
                  }
                />
                <input
                  className="field font-data"
                  placeholder="Cédula funcionario"
                  value={form.officerDocument}
                  onChange={(e) =>
                    setForm({ ...form, officerDocument: e.target.value })
                  }
                />
              </div>

              <div className="flex justify-end">
                <Button
                  type="submit"
                  variant="primary"
                  className="w-auto"
                  disabled={!canConfirm}
                >
                  {form.driverId || form.vehicleId
                    ? "Crear (asigna si la lista normativa está correcta)"
                    : "Crear sin asignación"}
                </Button>
              </div>
            </form>
          ) : null}

          {selected &&
          (!selected.driver || !selected.vehicle) &&
          selected.status !== "COMPLETED" ? (
            <div className="fsg-panel shrink-0 space-y-2 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--brand-amber,#FFB800)]">
                Asignar · {selected.code}
              </p>
              <div className="grid gap-2">
                <select
                  className="field"
                  value={assignDriverId}
                  onChange={(e) => setAssignDriverId(e.target.value)}
                >
                  <option value="">Conductor apto…</option>
                  {drivers
                    .filter((d) => d.ready)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                </select>
                <select
                  className="field"
                  value={assignVehicleId}
                  onChange={(e) => setAssignVehicleId(e.target.value)}
                >
                  <option value="">Placa apta…</option>
                  {vehicles
                    .filter((v) => v.ready)
                    .map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.plate}
                      </option>
                    ))}
                </select>
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="primary"
                  className="w-auto"
                  onClick={() => void asignarPendiente()}
                >
                  Asignar ahora
                </Button>
              </div>
            </div>
          ) : null}

          {tracking && !createOpen ? (
            <div className="fsg-panel max-h-[120px] shrink-0 overflow-auto p-3">
              <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--brand-muted)]">
                <Radio className="h-3 w-3" />
                Bitácora de seguimiento
              </p>
              <ul className="space-y-1 font-data text-[11px]">
                {tracking.audit.map((a) => (
                  <li key={a.id}>
                    <span className="text-[var(--brand-muted)]">
                      {new Date(a.serverTime).toLocaleTimeString("es-CO")}
                    </span>{" "}
                    {a.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {!createOpen ? (
            <div className="grid shrink-0 gap-2">
              <OpsChatPanel
                mode="trip"
                tripId={selectedId}
                tripCode={selected?.code}
              />
              <OpsChatPanel mode="support" />
            </div>
          ) : null}
        </aside>

        {/* —— Derecha: mapa (stacking aislado para no tapar Servicios) —— */}
        <section className="relative z-0 isolate min-h-[320px] overflow-hidden rounded-xl border border-[var(--brand-line)] bg-[#0A0D14] lg:min-h-0">
          {tracking && selectedId && !createOpen ? (
            <div className="absolute inset-0">
              <RouteMap
                mode={tracking.mode}
                suggested={tracking.suggestedRoute}
                history={tracking.history}
                live={tracking.live}
                fillHeight
              />
            </div>
          ) : (
            <ServicioMapPlanner
              origin={originPin}
              dest={destPin}
              onOriginChange={setOriginPin}
              onDestChange={setDestPin}
              fillHeight
            />
          )}
        </section>
      </div>

      <SlideOver
        open={deviationsOpen}
        onClose={() => setDeviationsOpen(false)}
        title="Desviaciones pendientes"
        description="ACEPTAR autoriza seguimiento / extras; CANCELAR restaura el estado previo."
        widthClass="max-w-lg"
      >
        <SupervisorDeviationsPanel
          embedded
          onCountChange={setDeviationCount}
        />
      </SlideOver>
    </div>
  );
}
