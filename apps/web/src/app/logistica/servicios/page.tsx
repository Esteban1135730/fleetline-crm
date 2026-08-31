"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Button } from "@fsg/ui";
import {
  AlertOctagon,
  Bell,
  FileText,
  MapPin,
  MessageSquare,
  Plus,
  Radio,
  ShieldAlert,
} from "lucide-react";
import { api } from "@/lib/api";
import { statusEs } from "@fsg/shared";
import {
  EmptyState,
  SlideOver,
  StatusPulseBadge,
} from "@/components/audit";
import { BentoPanel } from "@/components/nexa/bento-panel";
import { FleetHud } from "@/components/nexa/fleet-hud";
import { NexaTable, NexaRow, NexaCell } from "@/components/nexa/nexa-table";
import {
  LogisticaToolbar,
  type FleetStatusFilter,
} from "@/components/logistica/logistica-toolbar";
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
      <div className="flex h-full items-center justify-center bg-brand-canvas text-sm text-[var(--brand-text-secondary)]">
        Cargando mapaÃ¢â‚¬Â¦
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
  authorizedVehicleIds?: string[];
  primaryVehicleId?: string | null;
};

type PoolVehicle = {
  id: string;
  plate: string;
  status: string;
  complianceBlocked: boolean;
  ready: boolean;
  blockers: string[];
  authorizedDriverIds?: string[];
};

type CreateResult = Servicio & {
  message?: string;
  assigned?: boolean;
  dispatchNotes?: string[];
};

function blockerLabel(code: string) {
  return code
    .replace(/_/g, " ")
    .replace(/\bSOAT\b/i, "SOAT")
    .replace(/\bTECNOMECANICA\b/i, "TecnomecÃƒÂ¡nica");
}

function KillSwitchCard({ blockers }: { blockers: string[] }) {
  if (!blockers.length) return null;
  return (
    <div
      className="rounded-lg border border-[var(--brand-danger)]/50 bg-[color-mix(in_srgb,var(--brand-danger)_12%,transparent)] p-3"
      data-testid="kill-switch-card"
    >
      <div className="mb-2 flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 animate-pulse text-[var(--brand-danger)]" />
        <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--brand-danger)]">
          Despacho bloqueado Ã‚Â· Kill-Switch
        </h4>
      </div>
      <p className="mb-2 text-xs text-[var(--brand-text-secondary)]">
        La validaciÃƒÂ³n normativa denegÃƒÂ³ la asignaciÃƒÂ³n. Corrija el expediente
        antes de despachar.
      </p>
      <ul className="space-y-1 rounded-md bg-[color-mix(in_srgb,var(--brand-danger)_8%,transparent)] p-2 font-data text-[10px] text-[var(--brand-danger)]">
        {blockers.map((b) => (
          <li key={b} className="flex items-center gap-1.5">
            <AlertOctagon className="h-3 w-3 shrink-0" />
            {blockerLabel(b)}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function LogisticaServiciosPage() {
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [drivers, setDrivers] = useState<PoolDriver[]>([]);
  const [vehicles, setVehicles] = useState<PoolVehicle[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tracking, setTracking] = useState<Tracking | null>(null);
  const [clock, setClock] = useState<string>("Ã¢â‚¬â€");
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
  const [commsOpen, setCommsOpen] = useState(false);
  const [geoQuery, setGeoQuery] = useState("");
  const [geoHits, setGeoHits] = useState<PlacePin[]>([]);
  const [geoMode, setGeoMode] = useState<"origin" | "dest">("origin");
  const [geoBusy, setGeoBusy] = useState(false);
  const [statusFilter, setStatusFilter] = useState<FleetStatusFilter>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
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

  const vehicleById = useMemo(
    () => new Map(vehicles.map((v) => [v.id, v])),
    [vehicles],
  );

  const filteredServicios = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    return servicios.filter((s) => {
      const v = s.vehicle?.id ? vehicleById.get(s.vehicle.id) : undefined;
      if (statusFilter === "IN_TRANSIT" && s.status !== "IN_TRANSIT") return false;
      if (
        statusFilter === "WORKSHOP" &&
        !(v?.status === "MAINTENANCE" || v?.status === "OUT_OF_SERVICE")
      ) {
        return false;
      }
      if (
        statusFilter === "STOPPED" &&
        !(
          s.status === "COMPLETED" ||
          v?.complianceBlocked ||
          v?.status === "OUT_OF_SERVICE"
        )
      ) {
        return false;
      }
      if (!needle) return true;
      return (
        s.code.toLowerCase().includes(needle) ||
        s.origin.toLowerCase().includes(needle) ||
        s.destination.toLowerCase().includes(needle) ||
        (s.driver?.name ?? "").toLowerCase().includes(needle) ||
        (s.vehicle?.plate ?? "").toLowerCase().includes(needle)
      );
    });
  }, [servicios, statusFilter, searchQuery, vehicleById]);

  const hudAlerts = useMemo(() => {
    if (!selected) return [];
    const alerts: string[] = [];
    const v = selected.vehicle?.id
      ? vehicleById.get(selected.vehicle.id)
      : undefined;
    if (v?.complianceBlocked) alerts.push("Kill-Switch documental activo");
    if (selected.driver?.dispatchBlocked) alerts.push("Conductor bloqueado");
    if (!selected.driver || !selected.vehicle) alerts.push("Sin pareja despacho");
    return alerts;
  }, [selected, vehicleById]);

  const selectedDriver = drivers.find((d) => d.id === form.driverId);
  const selectedVehicle = vehicles.find((v) => v.id === form.vehicleId);
  const assignDriver = drivers.find((d) => d.id === assignDriverId);
  const assignVehicle = vehicles.find((v) => v.id === assignVehicleId);

  const suggestedDispatch = useMemo(() => {
    const driver = [...drivers]
      .filter((d) => d.ready)
      .sort((a, b) => a.fatigueScore - b.fatigueScore)[0];
    if (!driver) return { driver: undefined, vehicle: undefined };
    const authIds = driver.authorizedVehicleIds ?? [];
    const vehicle =
      (driver.primaryVehicleId
        ? vehicles.find((v) => v.id === driver.primaryVehicleId && v.ready)
        : undefined) ||
      vehicles.find(
        (v) =>
          v.ready && (authIds.length === 0 || authIds.includes(v.id)),
      ) ||
      vehicles.find((v) => v.ready);
    return { driver, vehicle };
  }, [drivers, vehicles]);

  const vehiclesForAssign = useMemo(() => {
    const authIds = assignDriver?.authorizedVehicleIds ?? [];
    if (!assignDriver || authIds.length === 0) return vehicles;
    return vehicles.filter((v) => authIds.includes(v.id));
  }, [vehicles, assignDriver]);

  const vehiclesForCreate = useMemo(() => {
    const d = drivers.find((x) => x.id === form.driverId);
    const authIds = d?.authorizedVehicleIds ?? [];
    if (!d || authIds.length === 0) return vehicles;
    return vehicles.filter((v) => authIds.includes(v.id));
  }, [vehicles, drivers, form.driverId]);

  const liveSpeed = useMemo(() => {
    const pts = tracking?.history ?? [];
    for (let i = pts.length - 1; i >= 0; i--) {
      const s = pts[i]?.speedKph;
      if (s != null && Number(s) > 0) return Number(s);
    }
    return null;
  }, [tracking]);

  const tickerEvents = useMemo(() => {
    const fromAudit = (tracking?.audit ?? [])
      .slice(0, 8)
      .map((a) => a.message);
    if (statusMsg) return [statusMsg, ...fromAudit];
    return fromAudit;
  }, [tracking, statusMsg]);

  const createBlockers = useMemo(() => {
    const list: string[] = [];
    if (selectedDriver && !selectedDriver.ready) {
      list.push(...selectedDriver.blockers);
    }
    if (selectedVehicle && !selectedVehicle.ready) {
      list.push(...selectedVehicle.blockers);
    }
    return list;
  }, [selectedDriver, selectedVehicle]);

  const assignBlockers = useMemo(() => {
    const list: string[] = [];
    if (assignDriver && !assignDriver.ready) list.push(...assignDriver.blockers);
    if (assignVehicle && !assignVehicle.ready)
      list.push(...assignVehicle.blockers);
    return list;
  }, [assignDriver, assignVehicle]);

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
      setError(e instanceof Error ? e.message : "ConexiÃƒÂ³n fallida"),
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
        /* silent Ã¢â‚¬â€ campana sin badge */
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
      setError("Elige conductor y vehÃƒÂ­culo aptos para asignar");
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
      setStatusMsg(
        "Servicio asignado Ã¢â‚¬â€ FUEC digital emitido a la App del conductor",
      );
      setAssignDriverId("");
      setAssignVehicleId("");
      await loadServicios();
    } catch (err) {
      setError(err instanceof Error ? err.message : "AsignaciÃƒÂ³n fallida");
    }
  }

  async function iniciar(id: string) {
    try {
      await api(`/logistica/servicios/${id}/iniciar`, {
        method: "POST",
        body: "{}",
      });
      setStatusMsg("Servicio EN PROCESO Ã¢â‚¬â€ GPS en vivo");
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
      setStatusMsg("Servicio cerrado Ã¢â‚¬â€ extras liquidados");
      await loadServicios();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cerrar");
    }
  }

  const canConfirm =
    Boolean(originPin && destPin && form.departAt) &&
    createBlockers.length === 0;
  const step1 = Boolean(originPin && destPin);
  const step2 = Boolean(form.departAt);
  const step3Ready =
    Boolean(form.driverId && form.vehicleId) &&
    Boolean(selectedDriver?.ready && selectedVehicle?.ready);

  function openCreate() {
    setCreateOpen(true);
    setError("");
  }

  function applySmartAssign(target: "create" | "pending") {
    if (!suggestedDispatch.driver || !suggestedDispatch.vehicle) {
      setError(
        "Sin recursos aptos Ã¢â‚¬â€ Kill-Switch: revise fatiga, SOAT y tecnomecÃƒÂ¡nica",
      );
      return;
    }
    if (target === "create") {
      setForm((f) => ({
        ...f,
        driverId: suggestedDispatch.driver!.id,
        vehicleId: suggestedDispatch.vehicle!.id,
      }));
    } else {
      setAssignDriverId(suggestedDispatch.driver.id);
      setAssignVehicleId(suggestedDispatch.vehicle.id);
    }
    setStatusMsg(
      `Sugerido: ${suggestedDispatch.driver.name} Ã‚Â· ${suggestedDispatch.vehicle.plate} (menor fatiga + cumplimiento 100%)`,
    );
  }

  async function runGeoSearch() {
    if (geoQuery.trim().length < 3) return;
    setGeoBusy(true);
    try {
      const rows = await api<PlacePin[]>(
        `/logistica/servicios/geocode?q=${encodeURIComponent(geoQuery.trim())}`,
      );
      setGeoHits(rows);
    } catch {
      setGeoHits([]);
    } finally {
      setGeoBusy(false);
    }
  }

  return (
    <div
      className="fade-in flex h-[calc(100vh-5.5rem)] min-h-[560px] flex-col gap-3"
      data-testid="panel-servicios"
    >
      <header className="shrink-0 space-y-3 border-b border-brand-border pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-data text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-primary">
              Logística · Torre de control
            </p>
            <h1 className="font-sans text-xl font-semibold tracking-tight text-brand-text-primary md:text-2xl">
              Monitoreo en vivo · Despachos y FUEC
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <ServerClockBadge clock={clock} />
            <Button
              type="button"
              variant="ghost"
              className="w-auto px-3"
              onClick={() => setCommsOpen(true)}
            >
              <MessageSquare className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="relative w-auto px-3"
              aria-label="Desviaciones pendientes"
              onClick={() => setDeviationsOpen(true)}
            >
              <Bell className="h-4 w-4" />
              {deviationCount > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-danger px-1 font-data text-[10px] font-bold text-white tabular-nums">
                  {deviationCount}
                </span>
              ) : null}
            </Button>
            <Button type="button" variant="primary" className="w-auto" onClick={openCreate}>
              <Plus className="mr-1 h-4 w-4" />
              Nueva ruta
            </Button>
          </div>
        </div>
        <LogisticaToolbar
          statusFilter={statusFilter}
          onStatusFilter={setStatusFilter}
          search={searchQuery}
          onSearch={setSearchQuery}
        />
      </header>

      {focusCode && !focusMissing ? (
        <p className="rounded border border-[var(--brand-primary)]/30 bg-[var(--brand-primary)]/10 px-3 py-2 text-sm text-[var(--brand-primary)]">
          Enfocado {focusCode} Ã¢â‚¬â€ borrador desde Comercial. Asigne conductor y
          placa para despachar. El mapa queda vacÃƒÂ­o hasta georreferenciar la
          ruta.
        </p>
      ) : null}
      {focusMissing && focusCode ? (
        <p
          role="alert"
          className="rounded border border-[var(--brand-danger)]/40 bg-[var(--brand-danger)]/10 px-3 py-2 text-sm text-[var(--brand-danger)]"
        >
          {focusCode} no estÃƒÂ¡ en ProgramaciÃƒÂ³n de Servicios. Vuelva a Comercial y
          pulse Generar viaje en esa cotizaciÃƒÂ³n.
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
          className="rounded border border-[var(--brand-danger)]/40 bg-[var(--brand-danger)]/10 px-3 py-2 text-sm text-[var(--brand-danger)]"
        >
          {error}
        </p>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-12">
        <aside className="relative z-10 flex min-h-0 flex-col gap-3 overflow-hidden lg:col-span-4">
          <BentoPanel
            title="Despachos activos"
            subtitle={`${filteredServicios.length} de ${servicios.length} · planillas FUEC`}
            className={`flex min-h-0 flex-col overflow-hidden ${
              createOpen ? "max-h-[220px] shrink-0" : "min-h-[220px] flex-1"
            }`}
            action={
              <StatusPulseBadge
                tone={
                  servicios.some((s) => s.status === "IN_TRANSIT")
                    ? "active"
                    : "neutral"
                }
                pulse={servicios.some((s) => s.status === "IN_TRANSIT")}
              >
                {servicios.some((s) => s.status === "IN_TRANSIT")
                  ? "En tránsito"
                  : "Nominal"}
              </StatusPulseBadge>
            }
          >
            <div className="min-h-0 flex-1 overflow-auto">
              {!filteredServicios.length ? (
                <EmptyState
                  icon={<MapPin className="h-7 w-7" />}
                  title={
                    servicios.length
                      ? "Sin coincidencias"
                      : "Sin servicios indexados"
                  }
                  description={
                    servicios.length
                      ? "Ajuste filtros o búsqueda táctica."
                      : "Crea una ruta en el mapa para despachar la flota."
                  }
                  actionLabel={servicios.length ? undefined : "Nueva ruta"}
                  onAction={servicios.length ? undefined : openCreate}
                />
              ) : (
                <NexaTable
                  columns={["Código", "Ruta", "Tripulación", "Estado"]}
                >
                  {filteredServicios.map((s) => (
                    <NexaRow
                      key={s.id}
                      active={selectedId === s.id || s.code === focusCode}
                      onClick={() => setSelectedId(s.id)}
                    >
                      <NexaCell mono className="text-brand-primary">
                        {s.code}
                      </NexaCell>
                      <NexaCell>
                        <span className="line-clamp-1 text-xs">
                          {s.origin} → {s.destination}
                        </span>
                      </NexaCell>
                      <NexaCell mono className="text-[11px] text-brand-text-secondary">
                        {s.driver?.name ?? "—"} · {s.vehicle?.plate ?? "—"}
                      </NexaCell>
                      <NexaCell>
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
                      </NexaCell>
                    </NexaRow>
                  ))}
                </NexaTable>
              )}
            </div>
            {selected ? (
              <div className="mt-2 flex flex-wrap justify-end gap-1 border-t border-brand-border pt-2">
                <Button
                  variant="ghost"
                  className="w-auto px-2 py-1 text-xs"
                  onClick={() => setCommsOpen(true)}
                >
                  <MessageSquare className="mr-1 h-3 w-3" />
                  Chat
                </Button>
                {selected.status !== "IN_TRANSIT" &&
                selected.status !== "COMPLETED" ? (
                  <Button
                    variant="ghost"
                    className="w-auto px-2 py-1 text-xs"
                    onClick={() => void iniciar(selected.id)}
                  >
                    Iniciar
                  </Button>
                ) : null}
                {selected.status === "IN_TRANSIT" ? (
                  <Button
                    variant="primary"
                    className="w-auto px-2 py-1 text-xs"
                    onClick={() => void cerrar(selected.id)}
                  >
                    Cerrar
                  </Button>
                ) : null}
              </div>
            ) : null}
          </BentoPanel>

          {createOpen ? (
            <form
              id="crear-servicio"
              onSubmit={onCreateServicio}
              className="nexa-panel max-h-[min(52vh,28rem)] shrink-0 space-y-3 overflow-y-auto p-3"
              data-testid="servicio-form"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-[var(--brand-text-primary)]">
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
                  { ok: step1, label: "1 Ã‚Â· Ruta AÃ¢â€ â€™B" },
                  { ok: step2, label: "2 Ã‚Â· Salida" },
                  { ok: step3Ready, label: "3 Ã‚Â· AsignaciÃƒÂ³n" },
                ].map((s) => (
                  <li
                    key={s.label}
                    className={`rounded border px-2 py-0.5 ${
                      s.ok
                        ? "border-[var(--brand-primary)]/40 bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]"
                        : "border-[var(--brand-border)] text-[var(--brand-text-secondary)]"
                    }`}
                  >
                    {s.label}
                  </li>
                ))}
              </ol>

              <p className="text-xs text-[var(--brand-text-secondary)]">
                Marca A/B en el mapa o busca la direcciÃƒÂ³n aquÃƒÂ­ (el mapa queda
                despejado).
              </p>
              <div className="flex gap-1">
                <button
                  type="button"
                  className={`rounded-md px-2 py-1 text-[10px] font-semibold ${
                    geoMode === "origin"
                      ? "bg-[var(--brand-warning)] text-brand-on-warning"
                      : "border border-[var(--brand-border)] text-[var(--brand-text-secondary)]"
                  }`}
                  onClick={() => setGeoMode("origin")}
                >
                  A
                </button>
                <button
                  type="button"
                  className={`rounded-md px-2 py-1 text-[10px] font-semibold ${
                    geoMode === "dest"
                      ? "bg-[var(--brand-danger)] text-white"
                      : "border border-[var(--brand-border)] text-[var(--brand-text-secondary)]"
                  }`}
                  onClick={() => setGeoMode("dest")}
                >
                  B
                </button>
                <input
                  className="field flex-1"
                  placeholder={
                    geoMode === "origin"
                      ? "Buscar origenÃ¢â‚¬Â¦"
                      : "Buscar destinoÃ¢â‚¬Â¦"
                  }
                  value={geoQuery}
                  onChange={(e) => setGeoQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void runGeoSearch();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  className="w-auto px-2"
                  onClick={() => void runGeoSearch()}
                >
                  {geoBusy ? "Ã¢â‚¬Â¦" : "Ir"}
                </Button>
              </div>
              {geoHits.length ? (
                <ul className="max-h-28 overflow-auto rounded-md border border-[var(--brand-border)]">
                  {geoHits.map((h, i) => (
                    <li key={`${h.lat}-${h.lng}-${i}`}>
                      <button
                        type="button"
                        className="w-full px-2 py-1.5 text-left text-[11px] hover:bg-[color-mix(in_srgb,var(--brand-primary)_8%,transparent)]"
                        onClick={() => {
                          if (geoMode === "origin") {
                            setOriginPin(h);
                            setGeoMode("dest");
                          } else {
                            setDestPin(h);
                          }
                          setGeoHits([]);
                          setGeoQuery("");
                        }}
                      >
                        {h.label}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="grid gap-1.5 text-xs">
                <div className="rounded-md border border-[var(--brand-border)] px-2 py-1.5">
                  <span className="font-data text-[10px] uppercase tracking-[0.1em] text-[var(--brand-warning)]">
                    A Ã‚Â· Origen
                  </span>
                  <p className="mt-0.5 text-[var(--brand-text-primary)]">
                    {originPin?.label ?? "Sin marcar"}
                  </p>
                </div>
                <div className="rounded-md border border-[var(--brand-border)] px-2 py-1.5">
                  <span className="font-data text-[10px] uppercase tracking-[0.1em] text-[var(--brand-danger)]">
                    B Ã‚Â· Destino
                  </span>
                  <p className="mt-0.5 text-[var(--brand-text-primary)]">
                    {destPin?.label ?? "Sin marcar"}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2">
                <label className="text-xs text-[var(--brand-text-secondary)]">
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
                <label className="text-xs text-[var(--brand-text-secondary)]">
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

              <label className="block text-xs text-[var(--brand-text-secondary)]">
                Conductor (opcional)
                <select
                  className="field mt-1 w-full"
                  data-testid="dispatch-driver"
                  value={form.driverId}
                  onChange={(e) =>
                    setForm({ ...form, driverId: e.target.value })
                  }
                >
                  <option value="">Sin asignar ahoraÃ¢â‚¬Â¦</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.ready ? "Ã¢Å“â€œ " : "Ã¢Å¡Â  "}
                      {d.name} Ã‚Â· fatiga {d.fatigueScore}
                      {!d.ready ? ` Ã‚Â· ${d.blockers[0] ?? "revisar"}` : ""}
                    </option>
                  ))}
                </select>
                {selectedDriver && !selectedDriver.ready ? (
                  <p className="mt-1 text-[11px] text-[var(--brand-danger)]">
                    Kill-Switch conductor.
                  </p>
                ) : null}
              </label>

              <label className="block text-xs text-[var(--brand-text-secondary)]">
                VehÃƒÂ­culo / placa (opcional)
                <select
                  className="field mt-1 w-full"
                  data-testid="dispatch-vehicle"
                  value={form.vehicleId}
                  onChange={(e) =>
                    setForm({ ...form, vehicleId: e.target.value })
                  }
                >
                  <option value="">Sin asignar ahoraÃ¢â‚¬Â¦</option>
                  {vehiclesForCreate.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.ready ? "Ã¢Å“â€œ " : "Ã¢Å¡Â  "}
                      {v.plate}
                      {!v.ready ? ` Ã‚Â· ${v.blockers[0] ?? "revisar"}` : ""}
                    </option>
                  ))}
                </select>
                {selectedVehicle && !selectedVehicle.ready ? (
                  <p className="mt-1 text-[11px] text-[var(--brand-danger)]">
                    Kill-Switch vehÃƒÂ­culo.
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
                  placeholder="CÃƒÂ©dula funcionario"
                  value={form.officerDocument}
                  onChange={(e) =>
                    setForm({ ...form, officerDocument: e.target.value })
                  }
                />
              </div>

              <KillSwitchCard blockers={createBlockers} />

              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="w-auto"
                  onClick={() => applySmartAssign("create")}
                >
                  Sugerir asignaciÃƒÂ³n
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  className="w-auto"
                  disabled={!canConfirm}
                >
                  {createBlockers.length
                    ? "AsignaciÃƒÂ³n restringida"
                    : form.driverId || form.vehicleId
                      ? "Crear y emitir FUEC"
                      : "Crear sin asignaciÃƒÂ³n"}
                </Button>
              </div>
            </form>
          ) : null}

          {selected &&
          (!selected.driver || !selected.vehicle) &&
          selected.status !== "COMPLETED" ? (
            <div className="nexa-panel shrink-0 space-y-2 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--brand-warning)]">
                Asignar Ã‚Â· {selected.code}
              </p>
              <div className="grid gap-2">
                <select
                  className="field"
                  value={assignDriverId}
                  onChange={(e) => {
                    setAssignDriverId(e.target.value);
                    setAssignVehicleId("");
                  }}
                >
                  <option value="">ConductorÃ¢â‚¬Â¦</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.ready ? "Ã¢Å“â€œ " : "Ã¢Å¡Â  "}
                      {d.name} Ã‚Â· fatiga {d.fatigueScore}
                    </option>
                  ))}
                </select>
                <select
                  className="field"
                  value={assignVehicleId}
                  onChange={(e) => setAssignVehicleId(e.target.value)}
                >
                  <option value="">PlacaÃ¢â‚¬Â¦</option>
                  {vehiclesForAssign.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.ready ? "Ã¢Å“â€œ " : "Ã¢Å¡Â  "}
                      {v.plate}
                    </option>
                  ))}
                </select>
                {assignDriver &&
                (assignDriver.authorizedVehicleIds?.length ?? 0) > 0 &&
                vehiclesForAssign.length === 0 ? (
                  <p className="text-[11px] text-[var(--brand-danger)]">
                    Sin placas autorizadas para este conductor. Vincule en
                    Unidades autorizadas.
                  </p>
                ) : null}
              </div>
              <KillSwitchCard blockers={assignBlockers} />
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="w-auto"
                  onClick={() => applySmartAssign("pending")}
                >
                  Sugerir
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  className="w-auto"
                  disabled={assignBlockers.length > 0 || !assignDriverId || !assignVehicleId}
                  onClick={() => void asignarPendiente()}
                >
                  {assignBlockers.length ? (
                    <>
                      <AlertOctagon className="mr-1 h-3.5 w-3.5" />
                      Restringida
                    </>
                  ) : (
                    <>
                      <FileText className="mr-1 h-3.5 w-3.5" />
                      Asignar y emitir FUEC
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : null}

          {tracking && !createOpen ? (
            <div className="nexa-panel max-h-[100px] shrink-0 overflow-auto p-3">
              <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--brand-text-secondary)]">
                <Radio className="h-3 w-3" />
                BitÃƒÂ¡cora
              </p>
              <ul className="space-y-1 font-data text-[11px]">
                {tracking.audit.slice(0, 4).map((a) => (
                  <li key={a.id}>
                    <span className="text-[var(--brand-text-secondary)]">
                      {new Date(a.serverTime).toLocaleTimeString("es-CO")}
                    </span>{" "}
                    {a.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>

        <BentoPanel
          title="Mapa operativo"
          subtitle={
            tracking && selectedId && !createOpen
              ? "Telemetría GPS en vivo"
              : "Planificador de ruta A→B"
          }
          icon={<Radio className="h-4 w-4" />}
          className="relative isolate min-h-[320px] overflow-hidden !p-0 lg:col-span-8 lg:min-h-0"
        >
          <div className="relative min-h-[320px] flex-1 lg:min-h-0 lg:h-full">
            {tracking && selectedId && !createOpen ? (
              <div className="absolute inset-0">
                <RouteMap
                  mode={tracking.mode}
                  suggested={tracking.suggestedRoute}
                  history={tracking.history}
                  live={tracking.live}
                  fillHeight
                  embedded
                />
              </div>
            ) : (
              <ServicioMapPlanner
                origin={originPin}
                dest={destPin}
                onOriginChange={setOriginPin}
                onDestChange={setDestPin}
                fillHeight
                showChrome={false}
              />
            )}
            {selected && tracking && !createOpen ? (
              <FleetHud
                className="absolute right-3 top-3"
                plate={selected.vehicle?.plate}
                driverName={selected.driver?.name}
                speedKph={liveSpeed}
                fuelLabel={
                  selected.status === "IN_TRANSIT" ? "Telemetría uplink" : "N/A"
                }
                fatigueScore={selected.driver?.fatigueScore}
                lat={tracking.live?.lat ?? tracking.history.at(-1)?.lat}
                lng={tracking.live?.lng ?? tracking.history.at(-1)?.lng}
                uplink={
                  tracking.mode === "LIVE_GPS" ? "LIVE GPS" : tracking.mode
                }
                alerts={hudAlerts}
                statusLabel={statusEs(selected.status)}
                statusTone={
                  selected.status === "IN_TRANSIT"
                    ? "active"
                    : hudAlerts.length
                      ? "danger"
                      : "neutral"
                }
              />
            ) : null}
          </div>
        </BentoPanel>
      </div>

      {tickerEvents.length ? (
        <div className="overflow-hidden rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-1.5">
          <p className="animate-pulse truncate font-data text-[11px] text-[var(--brand-text-secondary)]">
            {tickerEvents.join("  Ã‚Â·  ")}
          </p>
        </div>
      ) : null}

      <SlideOver
        open={commsOpen}
        onClose={() => setCommsOpen(false)}
        title="Comunicaciones operativas"
        description="Chat del servicio y soporte flota Ã‚Â· canal App"
        widthClass="max-w-lg"
      >
        <div className="space-y-3">
          <OpsChatPanel
            mode="trip"
            tripId={selectedId}
            tripCode={selected?.code}
            heightClass="h-[280px]"
          />
          <OpsChatPanel mode="support" heightClass="h-[240px]" />
        </div>
      </SlideOver>

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
