"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { io, Socket } from "socket.io-client";
import { Badge, Button, Tooltip } from "@fsg/ui";
import { api, getStoredUser, getTokenPublic, API_URL } from "@/lib/api";
import { HowToBox, PageIntro } from "@/components/page-intro";
import {
  WorkbenchSearch,
  WorkbenchTabs,
  WorkbenchToolbar,
} from "@/components/workbench-toolbar";
import { useShell } from "@/lib/shell-context";
import { PreoperationalFicha } from "@/components/logistica/preoperational-ficha";

type Trip = {
  id: string;
  code: string;
  origin: string;
  destination: string;
  status: string;
  fareAmount?: string | number | null;
  vehicle?: { plate: string } | null;
  driver?: { name: string } | null;
  contract?: { code: string; name: string } | null;
  invoice?: { id: string; number: string; status: string } | null;
  notes?: string | null;
  preoperationalAt?: string | null;
  preoperationalJson?: unknown;
};

type Gps = {
  id: string;
  plate: string;
  lat: number;
  lng: number;
  status: string;
  updatedAt: string;
};

type Opt = { id: string; name?: string; plate?: string; code?: string };

type VehicleReady = {
  vehicleId: string;
  plate: string;
  semaphore: "GREEN" | "YELLOW" | "RED";
  dispatchable: boolean;
  blockReasons: string[];
  warnings: string[];
};

type DriverReady = {
  driverId: string;
  name: string;
  dispatchable: boolean;
  blockReasons: string[];
  warnings: string[];
};

const STATUS_ES: Record<string, string> = {
  PENDING: "Pendiente",
  ASSIGNED: "Asignado",
  IN_TRANSIT: "En ruta",
  COMPLETED: "Terminado",
  CANCELLED: "Cancelado",
  INCIDENT: "Novedad",
};

export default function LogisticaPage() {
  const { openInspector } = useShell();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [gps, setGps] = useState<Gps[]>([]);
  const [connected, setConnected] = useState(false);
  const [customers, setCustomers] = useState<Opt[]>([]);
  const [contracts, setContracts] = useState<Opt[]>([]);
  const [vehicles, setVehicles] = useState<Opt[]>([]);
  const [drivers, setDrivers] = useState<Opt[]>([]);
  const [vehicleReady, setVehicleReady] = useState<VehicleReady[]>([]);
  const [driverReady, setDriverReady] = useState<DriverReady[]>([]);
  const [createError, setCreateError] = useState("");
  const [form, setForm] = useState({
    origin: "",
    destination: "",
    scheduledAt: "",
    customerId: "",
    contractId: "",
    vehicleId: "",
    driverId: "",
    fareAmount: "",
  });

  const [driversList, setDriversList] = useState<
    { id: string; name: string; document: string; phone?: string | null; active: boolean }[]
  >([]);
  const [driverForm, setDriverForm] = useState({
    name: "",
    document: "",
    phone: "",
    license: "",
  });
  const [nowTick, setNowTick] = useState(0);
  const [gpsForm, setGpsForm] = useState({
    vehicleId: "",
    lat: "",
    lng: "",
  });
  const [tripTab, setTripTab] = useState<"all" | "route" | "alerts">("all");
  const [tripQuery, setTripQuery] = useState("");

  async function reloadTrips() {
    await api<Trip[]>("/logistics/trips").then(setTrips);
  }

  useEffect(() => {
    setNowTick(Date.now());
    const t = setInterval(() => setNowTick(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  async function loadOptions() {
    const [c, ctr, v, d, dall, board] = await Promise.all([
      api<{ id: string; name: string }[]>("/comercial/customers"),
      api<{ id: string; code: string; name: string }[]>("/comercial/contracts"),
      api<{ id: string; plate: string }[]>("/fleet/vehicles"),
      api<{ id: string; name: string }[]>("/logistics/drivers"),
      api<
        { id: string; name: string; document: string; phone?: string | null; active: boolean }[]
      >("/logistics/drivers?all=1"),
      api<{ vehicles: VehicleReady[]; drivers: DriverReady[] }>(
        "/logistics/dispatch-board",
      ),
    ]);
    setCustomers(c);
    setContracts(ctr);
    setVehicles(v);
    setDrivers(d);
    setDriversList(dall);
    setVehicleReady(board.vehicles);
    setDriverReady(board.drivers);
  }

  useEffect(() => {
    const user = getStoredUser();
    if (!user) return;

    let socket: Socket | null = null;

    api<Trip[]>("/logistics/trips").then(setTrips).catch(console.error);
    api<Gps[]>("/logistics/gps").then(setGps).catch(console.error);
    void loadOptions().catch(console.error);

    socket = io(`${API_URL}/logistics`, {
      transports: ["websocket"],
      auth: { token: getTokenPublic() },
    });
    socket.on("connect", () => {
      setConnected(true);
      socket?.emit("join");
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("snapshot", (data: { trips: Trip[]; gps: Gps[] }) => {
      setTrips(data.trips);
      setGps(data.gps);
    });
    socket.on("gps", (data: Gps[]) => setGps(data));

    return () => {
      socket?.disconnect();
    };
  }, []);

  async function setStatus(id: string, status: string) {
    await api(`/logistics/trips/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    await reloadTrips();
  }

  async function reportIncident(id: string) {
    const notes = window.prompt("Describe la novedad operativa:");
    if (!notes?.trim()) return;
    await api(`/logistics/trips/${id}/incident`, {
      method: "PATCH",
      body: JSON.stringify({ notes }),
    });
    await reloadTrips();
  }

  async function invoiceTrip(id: string) {
    try {
      const inv = await api<{ number: string }>(`/logistics/trips/${id}/invoice`, {
        method: "POST",
      });
      window.alert(`Factura creada: ${inv.number}`);
      await reloadTrips();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "No se pudo facturar");
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreateError("");
    try {
      await api("/logistics/trips", {
        method: "POST",
        body: JSON.stringify({
          origin: form.origin,
          destination: form.destination,
          scheduledAt: form.scheduledAt,
          customerId: form.customerId || undefined,
          contractId: form.contractId || undefined,
          vehicleId: form.vehicleId || undefined,
          driverId: form.driverId || undefined,
          fareAmount: form.fareAmount ? Number(form.fareAmount) : undefined,
        }),
      });
      setForm({
        origin: "",
        destination: "",
        scheduledAt: "",
        customerId: form.customerId,
        contractId: "",
        vehicleId: "",
        driverId: "",
        fareAmount: "",
      });
      await reloadTrips();
      await loadOptions();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "No se pudo crear el viaje");
    }
  }

  const filteredTrips = useMemo(() => {
    const q = tripQuery.trim().toLowerCase();
    return trips.filter((t) => {
      if (tripTab === "route" && t.status !== "IN_TRANSIT") return false;
      if (
        tripTab === "alerts" &&
        t.status !== "INCIDENT" &&
        t.status !== "PENDING"
      ) {
        return false;
      }
      if (!q) return true;
      const hay = [
        t.code,
        t.origin,
        t.destination,
        t.vehicle?.plate,
        t.driver?.name,
        t.contract?.code,
        t.contract?.name,
        t.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [trips, tripTab, tripQuery]);

  const tripCounts = useMemo(
    () => ({
      all: trips.length,
      route: trips.filter((t) => t.status === "IN_TRANSIT").length,
      alerts: trips.filter(
        (t) => t.status === "INCIDENT" || t.status === "PENDING",
      ).length,
    }),
    [trips],
  );

  function openTripInspector(t: Trip) {
    const preopTime = t.preoperationalAt
      ? new Date(t.preoperationalAt).toLocaleString("es-CO", {
          dateStyle: "short",
          timeStyle: "medium",
        })
      : null;
    openInspector(
      `${t.code} · ficha`,
      <div className="space-y-5">
        <div className="space-y-1 text-sm">
          <p className="font-data text-xs text-[var(--text-primary)]">
            {t.origin} → {t.destination}
          </p>
          <p className="text-xs text-[var(--text-secondary)]">
            {t.vehicle?.plate ? `Unidad ${t.vehicle.plate}` : "Sin unidad"} ·{" "}
            {t.driver?.name || "Sin conductor"}
          </p>
          {preopTime ? (
            <p
              className="font-data text-[11px] text-[var(--accent-primary)]"
              title={`Preoperacional validado por el conductor a las ${preopTime}`}
            >
              Preoperacional validado a las {preopTime}
            </p>
          ) : (
            <p className="text-[11px] text-[var(--accent-metric)]">
              Preoperacional pendiente — GPS bloqueado hasta firmar
            </p>
          )}
        </div>
        <PreoperationalFicha
          tripCode={t.code}
          preoperationalAt={t.preoperationalAt}
          preoperationalJson={t.preoperationalJson}
        />
      </div>,
    );
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <PageIntro module="logistica" title="Centro de control operativo" />
      <HowToBox
        steps={[
          "Cree un viaje y asigne unidad/conductor aptos (semáforo verde).",
          "El conductor firma el preoperacional en la app; sin eso no hay «En vía» ni GPS.",
          "Clic en un viaje abre la ficha preoperacional en el inspector.",
        ]}
      />

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await api("/logistics/drivers", {
            method: "POST",
            body: JSON.stringify(driverForm),
          });
          setDriverForm({ name: "", document: "", phone: "", license: "" });
          await loadOptions();
        }}
        className="fsg-panel grid grid-cols-1 gap-3 p-4 md:grid-cols-5"
      >
        <input
          className="field"
          placeholder="Nombre conductor"
          value={driverForm.name}
          onChange={(e) =>
            setDriverForm({ ...driverForm, name: e.target.value })
          }
          required
        />
        <input
          className="field"
          placeholder="Documento"
          value={driverForm.document}
          onChange={(e) =>
            setDriverForm({ ...driverForm, document: e.target.value })
          }
          required
        />
        <input
          className="field"
          placeholder="Teléfono"
          value={driverForm.phone}
          onChange={(e) =>
            setDriverForm({ ...driverForm, phone: e.target.value })
          }
        />
        <input
          className="field"
          placeholder="Licencia"
          value={driverForm.license}
          onChange={(e) =>
            setDriverForm({ ...driverForm, license: e.target.value })
          }
        />
        <Button type="submit" variant="primary">
          Alta conductor
        </Button>
      </form>

      {driversList.length > 0 ? (
        <div className="fsg-panel data-shell overflow-hidden">
          <div className="border-b border-[var(--brand-line)] px-4 py-3 text-sm font-semibold">
            Conductores ({driversList.length})
          </div>
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="px-4 py-2">Nombre</th>
                <th className="px-4 py-2">Documento</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {driversList.map((d) => (
                <tr key={d.id} className="border-t border-[var(--brand-line)]">
                  <td className="px-4 py-2.5">{d.name}</td>
                  <td className="px-4 py-2.5 font-data text-xs">{d.document}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={d.active ? "emerald" : "slate"}>
                      {d.active ? "Activo" : "Inactivo"}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        await api(`/logistics/drivers/${d.id}`, {
                          method: "PATCH",
                          body: JSON.stringify({ active: !d.active }),
                        });
                        await loadOptions();
                      }}
                    >
                      {d.active ? "Desactivar" : "Activar"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <form
        onSubmit={onCreate}
        className="fsg-panel grid grid-cols-1 gap-3 p-4 md:grid-cols-4"
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
          className="field"
          type="datetime-local"
          value={form.scheduledAt}
          onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
          required
        />
        <input
          className="field"
          type="number"
          placeholder="Valor viaje COP"
          value={form.fareAmount}
          onChange={(e) => setForm({ ...form, fareAmount: e.target.value })}
        />
        <select
          className="field"
          value={form.customerId}
          onChange={(e) => setForm({ ...form, customerId: e.target.value })}
        >
          <option value="">Cliente (opcional)</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          className="field"
          value={form.contractId}
          onChange={(e) => setForm({ ...form, contractId: e.target.value })}
        >
          <option value="">Contrato (opcional)</option>
          {contracts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} — {c.name}
            </option>
          ))}
        </select>
        <select
          className="field"
          value={form.vehicleId}
          onChange={(e) => setForm({ ...form, vehicleId: e.target.value })}
        >
          <option value="">Vehículo (opcional)</option>
          {vehicles.map((v) => {
            const ready = vehicleReady.find((r) => r.vehicleId === v.id);
            const blocked = ready && !ready.dispatchable;
            const warn = ready?.semaphore === "YELLOW";
            return (
              <option key={v.id} value={v.id} disabled={blocked}>
                {v.plate}
                {blocked
                  ? ` — BLOQUEADO`
                  : warn
                    ? ` — por vencer`
                    : ready
                      ? ` — OK`
                      : ""}
              </option>
            );
          })}
        </select>
        <select
          className="field"
          value={form.driverId}
          onChange={(e) => setForm({ ...form, driverId: e.target.value })}
        >
          <option value="">Conductor (opcional)</option>
          {drivers.map((d) => {
            const ready = driverReady.find((r) => r.driverId === d.id);
            const blocked = ready && !ready.dispatchable;
            return (
              <option key={d.id} value={d.id} disabled={blocked}>
                {d.name}
                {blocked ? " — NO DISPONIBLE" : ""}
              </option>
            );
          })}
        </select>
        {createError ? (
          <p className="md:col-span-4 text-sm text-[var(--accent-alert)]">
            {createError}
          </p>
        ) : null}
        {form.vehicleId || form.driverId ? (
          <div className="md:col-span-4 flex flex-wrap gap-2">
            {form.vehicleId
              ? (() => {
                  const r = vehicleReady.find(
                    (x) => x.vehicleId === form.vehicleId,
                  );
                  if (!r) return null;
                  return (
                    <Badge
                      tone={
                        r.semaphore === "RED"
                          ? "rose"
                          : r.semaphore === "YELLOW"
                            ? "amber"
                            : "emerald"
                      }
                    >
                      {r.plate}: {r.semaphore}
                      {r.blockReasons[0] ? ` · ${r.blockReasons[0]}` : ""}
                    </Badge>
                  );
                })()
              : null}
            {form.driverId
              ? (() => {
                  const r = driverReady.find(
                    (x) => x.driverId === form.driverId,
                  );
                  if (!r) return null;
                  return (
                    <Badge tone={r.dispatchable ? "emerald" : "rose"}>
                      {r.name}: {r.dispatchable ? "DISPONIBLE" : "BLOQUEADO"}
                      {r.blockReasons[0] ? ` · ${r.blockReasons[0]}` : ""}
                    </Badge>
                  );
                })()
              : null}
          </div>
        ) : null}
        <Button type="submit" variant="primary" className="md:col-span-4">
          Crear viaje
        </Button>
      </form>

      <p className="text-sm text-[var(--brand-muted)]">
        Torre GPS:{" "}
        <span
          className={
            connected
              ? "font-semibold text-emerald-700"
              : "font-semibold text-[var(--brand-signal)]"
          }
        >
          {connected
            ? "en vivo (Socket.IO — app conductor / PATCH GPS)"
            : "sin conexión WebSocket"}
        </span>
      </p>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!gpsForm.vehicleId) return;
          await api(`/logistics/gps/${gpsForm.vehicleId}`, {
            method: "PATCH",
            body: JSON.stringify({
              lat: Number(gpsForm.lat),
              lng: Number(gpsForm.lng),
            }),
          });
          setGpsForm((f) => ({ ...f, lat: "", lng: "" }));
          api<Gps[]>("/logistics/gps").then(setGps).catch(console.error);
        }}
        className="fsg-panel grid grid-cols-1 gap-3 p-4 md:grid-cols-4"
      >
        <select
          className="field"
          value={gpsForm.vehicleId}
          onChange={(e) =>
            setGpsForm({ ...gpsForm, vehicleId: e.target.value })
          }
          required
        >
          <option value="">Vehículo</option>
          {(vehicles.length > 0 ? vehicles : gps.map((g) => ({ id: g.id, plate: g.plate }))).map(
            (v) => (
              <option key={v.id} value={v.id}>
                {v.plate}
              </option>
            ),
          )}
        </select>
        <input
          className="field"
          type="number"
          step="any"
          placeholder="Latitud"
          value={gpsForm.lat}
          onChange={(e) => setGpsForm({ ...gpsForm, lat: e.target.value })}
          required
        />
        <input
          className="field"
          type="number"
          step="any"
          placeholder="Longitud"
          value={gpsForm.lng}
          onChange={(e) => setGpsForm({ ...gpsForm, lng: e.target.value })}
          required
        />
        <Button type="submit" variant="primary">
          Actualizar GPS
        </Button>
      </form>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="fsg-panel overflow-hidden lg:col-span-1">
          <div className="border-b border-[var(--brand-line)] px-4 py-3 font-display text-sm font-semibold">
            Posiciones GPS ({gps.length})
          </div>
          <div className="max-h-[420px] space-y-2 overflow-y-auto p-3">
            {gps.length === 0 ? (
              <p className="px-1 text-sm text-[var(--brand-muted)]">
                Sin unidades con coordenadas. Abre la app Conductor con un viaje
                en ruta para ver puntos en vivo.
              </p>
            ) : (
              [...gps]
                .sort(
                  (a, b) =>
                    new Date(b.updatedAt).getTime() -
                    new Date(a.updatedAt).getTime(),
                )
                .map((g) => {
                  const ageSec =
                    nowTick > 0
                      ? Math.max(
                          0,
                          Math.round(
                            (nowTick - new Date(g.updatedAt).getTime()) / 1000,
                          ),
                        )
                      : 0;
                  const fresh = ageSec <= 20;
                  const stale = ageSec > 120;
                  return (
                    <div
                      key={g.id}
                      className={`rounded-[10px] border px-3 py-2 ${
                        fresh
                          ? "fsg-panel--active border-[var(--accent-primary)]"
                          : "border-[var(--border-subtle)] bg-[var(--bg-surface-2)]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="plate font-data text-sm font-semibold tracking-wide">
                          {g.plate}
                        </span>
                        <Badge
                          tone={
                            fresh ? "emerald" : stale ? "rose" : "amber"
                          }
                        >
                          {fresh
                            ? "En vivo"
                            : stale
                              ? `Hace ${Math.floor(ageSec / 60)} min`
                              : `Hace ${ageSec}s`}
                        </Badge>
                      </div>
                      <p className="gps-coord mt-1 font-data text-[11px] text-[var(--text-secondary)]">
                        {g.lat.toFixed(5)}, {g.lng.toFixed(5)}
                      </p>
                      <p className="font-data text-[10px] text-[var(--brand-muted)]">
                        Última actualización{" "}
                        {new Date(g.updatedAt).toLocaleString("es-CO")}
                      </p>
                    </div>
                  );
                })
            )}
          </div>
        </div>

        <div className="fsg-panel data-shell overflow-hidden lg:col-span-2">
          <div className="space-y-3 border-b border-[var(--brand-line)] px-4 py-3">
            <div className="font-display text-sm font-semibold">
              Viajes ({filteredTrips.length}/{trips.length})
            </div>
            <WorkbenchToolbar>
              <WorkbenchTabs
                value={tripTab}
                onChange={(id) =>
                  setTripTab(id as "all" | "route" | "alerts")
                }
                tabs={[
                  {
                    id: "all",
                    label: "Todos",
                    count: tripCounts.all,
                    tip: "Muestra todos los viajes del nodo",
                  },
                  {
                    id: "route",
                    label: "En ruta",
                    count: tripCounts.route,
                    tip: "Solo viajes IN_TRANSIT (en vía ahora)",
                  },
                  {
                    id: "alerts",
                    label: "Alertas / pendientes",
                    count: tripCounts.alerts,
                    tip: "Incidentes y viajes pendientes de despacho",
                  },
                ]}
              />
              <WorkbenchSearch
                value={tripQuery}
                onChange={setTripQuery}
                placeholder="Buscar placa, conductor, código o ruta…"
              />
            </WorkbenchToolbar>
          </div>
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="px-4 py-2">Código</th>
                <th className="px-4 py-2">Ruta</th>
                <th className="px-4 py-2">Unidad</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredTrips.map((t) => {
                const preopTip = t.preoperationalAt
                  ? `Preoperacional validado por el conductor a las ${new Date(
                      t.preoperationalAt,
                    ).toLocaleString("es-CO", {
                      dateStyle: "short",
                      timeStyle: "medium",
                    })}`
                  : "Sin preoperacional: no se puede iniciar ruta ni GPS hasta firmar en la app conductor";
                return (
                <tr
                  key={t.id}
                  className="cursor-pointer border-t border-[var(--brand-line)] hover:bg-[color-mix(in_srgb,var(--accent-primary)_6%,transparent)]"
                  onClick={() => openTripInspector(t)}
                  title="Abrir ficha preoperacional en el inspector"
                >
                  <td className="px-4 py-2.5 font-data text-xs">
                    {t.code}
                    {t.contract ? (
                      <div className="text-[10px] text-[var(--brand-muted)]">
                        {t.contract.code}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5">
                    {t.origin} → {t.destination}
                    {t.notes ? (
                      <div className="text-[10px] text-[var(--brand-signal)]">
                        {t.notes}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5">
                    {t.vehicle?.plate ?? "—"}
                    {t.driver ? (
                      <div className="text-[10px] text-[var(--brand-muted)]">
                        {t.driver.name}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <Tooltip content={preopTip} side="top">
                      <span>
                        <Badge
                          tone={
                            t.status === "INCIDENT"
                              ? "rose"
                              : t.status === "IN_TRANSIT"
                                ? "emerald"
                                : "cyan"
                          }
                          title={preopTip}
                        >
                          {STATUS_ES[t.status] || t.status}
                        </Badge>
                      </span>
                    </Tooltip>
                  </td>
                  <td
                    className="px-4 py-2.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex flex-wrap gap-1">
                      <Button
                        variant="ghost"
                        title="Abrir ficha preoperacional"
                        onClick={() => openTripInspector(t)}
                      >
                        Preop.
                      </Button>
                      <Button
                        variant="ghost"
                        title="Marcar viaje en ruta (IN_TRANSIT) — despacho activo"
                        onClick={() => setStatus(t.id, "IN_TRANSIT")}
                      >
                        En vía
                      </Button>
                      <Button
                        variant="ghost"
                        title="Cerrar viaje (COMPLETED) — puede generar odómetro/OT"
                        onClick={() => setStatus(t.id, "COMPLETED")}
                      >
                        Cerrar
                      </Button>
                      <Button
                        variant="ghost"
                        title="Registrar novedad/incidente real en el viaje"
                        onClick={() => reportIncident(t.id)}
                      >
                        Novedad
                      </Button>
                      {t.invoice ? (
                        <Badge
                          tone="emerald"
                          title={`Factura ${t.invoice.number} vinculada a este viaje`}
                        >
                          {t.invoice.number}
                        </Badge>
                      ) : t.status === "COMPLETED" ? (
                        <Button
                          variant="ghost"
                          title="Generar factura CxC desde este viaje cerrado"
                          onClick={() => invoiceTrip(t.id)}
                        >
                          Facturar
                        </Button>
                      ) : null}
                      {t.status !== "CANCELLED" && t.status !== "COMPLETED" ? (
                        <Button
                          variant="ghost"
                          title="Cancelar viaje — no facturable"
                          onClick={() => setStatus(t.id, "CANCELLED")}
                        >
                          Cancelar
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
