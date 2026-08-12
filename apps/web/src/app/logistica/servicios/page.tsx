"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Button } from "@fsg/ui";
import { api } from "@/lib/api";
import { HowToBox, PageIntro } from "@/components/page-intro";
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
      <div className="fsg-panel flex h-[420px] items-center justify-center text-sm text-[var(--brand-muted)]">
        Cargando planificador de ruta…
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
    void Promise.all([loadServicios(), loadPool(), loadClock()]).catch((e) =>
      setError(e instanceof Error ? e.message : "Uplink fallido"),
    );
    const t = setInterval(() => void loadClock(), 1000);
    return () => clearInterval(t);
  }, [loadServicios, loadPool, loadClock]);

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
          setError(e instanceof Error ? e.message : "Tracking fallido");
      }
    };
    void pull();
    const iv = setInterval(pull, 8000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [selectedId]);

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
      setStatusMsg(
        created.message ||
          `Servicio ${created.code} indexado`,
      );
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
      setStatusMsg("Servicio asignado — checklist normativo OK");
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

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <PageIntro
        module="logistica"
        title="Programación de Servicios y Tracking GPS"
        action={<ServerClockBadge clock={clock} />}
      />
      <HowToBox
        steps={[
          "Paso 1 — Ruta: origen (A) y destino (B) en el mapa.",
          "Paso 2 — Horario: salida (obligatoria). Conductor/placa son opcionales.",
          "Paso 3 — Si hay bloqueo normativo, el servicio se crea igual SIN asignar; luego asignas cuando docs estén OK. Chat app↔CRM abajo.",
        ]}
      />

      <ol className="grid gap-2 md:grid-cols-3">
        {[
          { ok: step1, label: "1 · Ruta A→B", hint: "Mapa" },
          { ok: step2, label: "2 · Salida", hint: "Fecha/hora" },
          {
            ok: step3Ready,
            label: "3 · Asignación",
            hint: step3Ready ? "Checklist OK" : "Opcional / soft",
          },
        ].map((s) => (
          <li
            key={s.label}
            className={`rounded-md border px-3 py-2 text-sm ${
              s.ok
                ? "border-[var(--brand-primary)]/40 bg-[var(--brand-primary)]/10"
                : "border-[var(--brand-line)]"
            }`}
          >
            <span className="font-semibold">{s.label}</span>
            <span className="ml-2 text-[var(--brand-muted)]">{s.hint}</span>
          </li>
        ))}
      </ol>

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

      <SupervisorDeviationsPanel />

      <section className="space-y-4" data-testid="panel-servicios">
        <ServicioMapPlanner
          origin={originPin}
          dest={destPin}
          onOriginChange={setOriginPin}
          onDestChange={setDestPin}
        />

        <form
          onSubmit={onCreateServicio}
          className="fsg-panel grid grid-cols-1 gap-3 p-4 md:grid-cols-4"
          data-testid="servicio-form"
        >
          <label className="text-xs text-[var(--brand-muted)] md:col-span-2">
            Salida *
            <input
              className="field mt-1 w-full font-data"
              type="datetime-local"
              value={form.departAt}
              onChange={(e) => setForm({ ...form, departAt: e.target.value })}
              required
              aria-label="Salida"
            />
          </label>
          <label className="text-xs text-[var(--brand-muted)] md:col-span-2">
            Llegada estimada
            <input
              className="field mt-1 w-full font-data"
              type="datetime-local"
              value={form.arriveAt}
              onChange={(e) => setForm({ ...form, arriveAt: e.target.value })}
              aria-label="Llegada estimada"
            />
          </label>

          <label className="text-xs text-[var(--brand-muted)] md:col-span-2">
            Conductor (opcional)
            <select
              className="field mt-1 w-full"
              data-testid="dispatch-driver"
              value={form.driverId}
              onChange={(e) => setForm({ ...form, driverId: e.target.value })}
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
              <p className="mt-1 text-[11px] text-[var(--brand-amber,#FFB800)]">
                No se asignará aún: {selectedDriver.blockers.join(" · ")}. El
                servicio sí se crea.
              </p>
            ) : null}
          </label>

          <label className="text-xs text-[var(--brand-muted)] md:col-span-2">
            Vehículo / placa (opcional)
            <select
              className="field mt-1 w-full"
              data-testid="dispatch-vehicle"
              value={form.vehicleId}
              onChange={(e) => setForm({ ...form, vehicleId: e.target.value })}
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
              <p className="mt-1 text-[11px] text-[var(--brand-amber,#FFB800)]">
                No se asignará aún: {selectedVehicle.blockers.join(" · ")}.
                Revisa SOAT / tecnomecánica en Trámites.
              </p>
            ) : null}
          </label>

          <input
            className="field"
            placeholder="Funcionario / cliente"
            value={form.officerName}
            onChange={(e) => setForm({ ...form, officerName: e.target.value })}
          />
          <input
            className="field font-data"
            placeholder="Cédula funcionario"
            value={form.officerDocument}
            onChange={(e) =>
              setForm({ ...form, officerDocument: e.target.value })
            }
          />
          <Button
            type="submit"
            variant="primary"
            className="md:col-span-4"
            disabled={!canConfirm}
          >
            {form.driverId || form.vehicleId
              ? "Crear servicio (asigna solo si checklist OK)"
              : "Crear servicio sin asignación"}
          </Button>
        </form>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="fsg-panel data-shell max-h-[520px] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="px-3 py-2">Código</th>
                  <th className="px-3 py-2">Ruta</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {servicios.map((s) => (
                  <tr
                    key={s.id}
                    className={`cursor-pointer border-t border-[var(--brand-line)] ${
                      selectedId === s.id
                        ? "bg-[var(--brand-primary)]/10"
                        : ""
                    }`}
                    onClick={() => setSelectedId(s.id)}
                  >
                    <td className="px-3 py-2 font-data text-xs">{s.code}</td>
                    <td className="px-3 py-2">
                      {s.origin} → {s.destination}
                      <div className="text-[10px] text-[var(--brand-muted)]">
                        {s.driver?.name ?? "Sin conductor"} ·{" "}
                        {s.vehicle?.plate ?? "Sin placa"}
                      </div>
                    </td>
                    <td className="px-3 py-2 font-data text-xs">{s.status}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {s.status !== "IN_TRANSIT" &&
                        s.status !== "COMPLETED" ? (
                          <Button
                            variant="ghost"
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
                            onClick={(e) => {
                              e.stopPropagation();
                              void cerrar(s.id);
                            }}
                          >
                            Cerrar
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3">
            {tracking ? (
              <>
                <RouteMap
                  mode={tracking.mode}
                  suggested={tracking.suggestedRoute}
                  history={tracking.history}
                  live={tracking.live}
                />
                <div className="fsg-panel max-h-[160px] overflow-auto p-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--brand-muted)]">
                    Audit log · inmutable
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
              </>
            ) : (
              <div className="fsg-panel p-6 text-sm text-[var(--brand-muted)]">
                Selecciona un servicio para ver ruta / GPS y abrir chats.
              </div>
            )}

            {selected &&
            (!selected.driver || !selected.vehicle) &&
            selected.status !== "COMPLETED" ? (
              <div className="fsg-panel space-y-2 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--brand-amber,#FFB800)]">
                  Asignar después · {selected.code}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
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
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => void asignarPendiente()}
                >
                  Asignar ahora
                </Button>
                {drivers.filter((d) => d.ready).length === 0 ||
                vehicles.filter((v) => v.ready).length === 0 ? (
                  <p className="text-[11px] text-[var(--brand-muted)]">
                    No hay recursos aptos. Carga SOAT / tecnomecánica / licencia
                    en Trámites o baja fatiga en RRHH.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <OpsChatPanel
            mode="trip"
            tripId={selectedId}
            tripCode={selected?.code}
          />
          <OpsChatPanel mode="support" />
        </div>
      </section>
    </div>
  );
}
