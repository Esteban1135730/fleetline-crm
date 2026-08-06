"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Button } from "@fsg/ui";
import { api } from "@/lib/api";
import { HowToBox, PageIntro } from "@/components/page-intro";
import {
  RouteMap,
  ServerClockBadge,
  type Driver,
  type Servicio,
  type Tracking,
  type Vehicle,
} from "@/components/logistica/logistica-shared";

export default function LogisticaServiciosPage() {
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tracking, setTracking] = useState<Tracking | null>(null);
  const [clock, setClock] = useState<string>("—");
  const [error, setError] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [form, setForm] = useState({
    origin: "",
    destination: "",
    departAt: "",
    arriveAt: "",
    driverId: "",
    vehicleId: "",
    officerName: "",
    officerDocument: "",
  });

  const loadServicios = useCallback(async () => {
    const rows = await api<Servicio[]>("/logistica/servicios");
    setServicios(rows);
  }, []);

  const loadDriversVehicles = useCallback(async () => {
    const [d, gps] = await Promise.all([
      api<Driver[]>("/logistica/conductores"),
      api<Vehicle[]>("/logistics/gps").catch(() => [] as Vehicle[]),
    ]);
    setDrivers(d);
    setVehicles(gps);
  }, []);

  const loadClock = useCallback(async () => {
    const c = await api<{ iso: string }>("/logistica/reloj");
    setClock(new Date(c.iso).toLocaleTimeString("es-CO", { hour12: false }));
  }, []);

  useEffect(() => {
    void Promise.all([
      loadServicios(),
      loadDriversVehicles(),
      loadClock(),
    ]).catch((e) =>
      setError(e instanceof Error ? e.message : "Uplink fallido"),
    );
    const t = setInterval(() => void loadClock(), 1000);
    return () => clearInterval(t);
  }, [loadServicios, loadDriversVehicles, loadClock]);

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
    try {
      const created = await api<Servicio>("/logistica/servicios", {
        method: "POST",
        body: JSON.stringify({
          origin: form.origin,
          destination: form.destination,
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
      setStatusMsg(`Servicio ${created.code} indexado`);
      setForm({
        origin: "",
        destination: "",
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

  async function iniciar(id: string) {
    await api(`/logistica/servicios/${id}/iniciar`, {
      method: "POST",
      body: "{}",
    });
    setStatusMsg("Servicio EN PROCESO — GPS en vivo");
    await loadServicios();
  }

  async function cerrar(id: string) {
    await api(`/logistica/servicios/${id}/cerrar`, {
      method: "POST",
      body: "{}",
    });
    setStatusMsg("Servicio cerrado — extras liquidados");
    await loadServicios();
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <PageIntro
        module="logistica"
        title="Programación de Servicios y Tracking GPS"
        action={<ServerClockBadge clock={clock} />}
      />
      <HowToBox
        steps={[
          "Registra origen/destino, conductor, placa y horario programado.",
          "Pendiente = ruta óptima sugerida; En proceso = traza GPS en vivo + histórico.",
          "El reloj del servidor sella cada acción en TripAuditLog inmutable.",
          "Al cerrar el servicio se liquidan HED/HEN/RN según tabla laboral CO.",
        ]}
      />

      {statusMsg ? (
        <p className="font-data text-xs text-[var(--brand-primary)]">
          {statusMsg}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-[var(--brand-signal)]">
          {error}
        </p>
      ) : null}

      <section className="space-y-4" data-testid="panel-servicios">
        <form
          onSubmit={onCreateServicio}
          className="fsg-panel grid grid-cols-1 gap-3 p-4 md:grid-cols-4"
          data-testid="servicio-form"
        >
          <input
            className="field"
            placeholder="Origen"
            value={form.origin}
            onChange={(e) => setForm({ ...form, origin: e.target.value })}
            required
          />
          <input
            className="field"
            placeholder="Destino"
            value={form.destination}
            onChange={(e) => setForm({ ...form, destination: e.target.value })}
            required
          />
          <input
            className="field font-data"
            type="datetime-local"
            value={form.departAt}
            onChange={(e) => setForm({ ...form, departAt: e.target.value })}
            required
          />
          <input
            className="field font-data"
            type="datetime-local"
            value={form.arriveAt}
            onChange={(e) => setForm({ ...form, arriveAt: e.target.value })}
          />
          <select
            className="field"
            data-testid="dispatch-driver"
            value={form.driverId}
            onChange={(e) => setForm({ ...form, driverId: e.target.value })}
          >
            <option value="">Conductor…</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {d.dispatchBlocked ? " · BLOCKED" : ""}
              </option>
            ))}
          </select>
          <select
            className="field"
            data-testid="dispatch-vehicle"
            value={form.vehicleId}
            onChange={(e) => setForm({ ...form, vehicleId: e.target.value })}
          >
            <option value="">Placa…</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.plate}
              </option>
            ))}
          </select>
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
          <Button type="submit" variant="primary" className="md:col-span-4">
            Crear servicio
          </Button>
        </form>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
                        {s.driver?.name ?? "—"} · {s.vehicle?.plate ?? "—"}
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
                <div className="fsg-panel max-h-[200px] overflow-auto p-3">
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
                Selecciona un servicio para ver ruta sugerida o GPS en vivo.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
