"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { Filter, Flashlight, Smartphone } from "lucide-react";
import { api } from "@/lib/api";
import { BentoPanel } from "@/components/nexa/bento-panel";
import { NexaTable, NexaRow, NexaCell } from "@/components/nexa/nexa-table";

type GanttItem = {
  id: string;
  code: string;
  plate: string;
  vehicleLabel?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  driverName?: string | null;
  fatigueScore?: number;
  departAt: string;
  arriveAt?: string | null;
  status: string;
  color: "blue" | "green" | "gray" | "red";
  appMonitor: {
    published: boolean;
    publishedAt: string | null;
    acknowledged: boolean;
    ackAt: string | null;
  };
};

type Dash = {
  gantt: GanttItem[];
  filters: {
    customers: Array<{ id: string; name: string }>;
    vehicleTypes: string[];
  };
  stats: {
    assigned: number;
    inRoute: number;
    workshop: number;
    blocked: number;
    ackRate: number;
  };
  rules: { dispatchFatigueMax: number; minLegalRestHours: number };
};

const COLOR_LABEL: Record<GanttItem["color"], string> = {
  blue: "Asignado",
  green: "En ruta",
  gray: "Taller",
  red: "Bloqueado",
};

const COLOR_CLASS: Record<GanttItem["color"], string> = {
  blue: "bg-brand-secondary",
  green: "bg-brand-success",
  gray: "bg-brand-info",
  red: "bg-brand-danger",
};

export default function DespachoDashboardPage() {
  const [dash, setDash] = useState<Dash | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const q = new URLSearchParams();
      if (customerId) q.set("customerId", customerId);
      if (vehicleType) q.set("vehicleType", vehicleType);
      const path = `/api/v1/operaciones/despacho/dashboard${
        q.toString() ? `?${q}` : ""
      }`;
      setDash(await api<Dash>(path));
    } catch (e) {
      setError((e as Error).message || "Señal perdida — reintentando conexión");
    }
  }, [customerId, vehicleType]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15_000);
    return () => clearInterval(t);
  }, [load]);

  const plates = useMemo(() => {
    return [...new Set((dash?.gantt ?? []).map((g) => g.plate))].sort();
  }, [dash]);

  const windowStart = useMemo(() => {
    const times = (dash?.gantt ?? []).map((g) => +new Date(g.departAt));
    if (!times.length) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return +d;
    }
    const day = new Date(Math.min(...times));
    day.setHours(0, 0, 0, 0);
    return +day;
  }, [dash]);
  const windowEnd = windowStart + 24 * 60 * 60 * 1000;

  function barStyle(g: GanttItem) {
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

  async function relevoFlash(tripId: string) {
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const res = await api<{
        alert: { message: string };
        candidates: Array<{ name: string; distanceKm: number }>;
        assigned: { message?: string } | null;
      }>("/api/v1/operaciones/despacho/buscar-relevo-flash", {
        method: "POST",
        body: JSON.stringify({
          tripId,
          radiusKm: 12,
          assignBest: true,
        }),
      });
      setMsg(
        `${res.alert.message}${res.assigned?.message ? ` · ${res.assigned.message}` : ""}`,
      );
      await load();
    } catch (e) {
      setError((e as Error).message || "Relevo flash fallido");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-border pb-4">
        <div>
          <p className="font-data text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-primary">
            Operaciones · Despacho
          </p>
          <h1 className="font-sans text-2xl font-semibold tracking-tight text-brand-text-primary md:text-3xl">
            Microdespacho
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="success">
            Fatiga máx {dash?.rules.dispatchFatigueMax ?? 30}
          </Badge>
          <Badge tone="warning">
            Descanso ≥ {dash?.rules.minLegalRestHours ?? 8}h
          </Badge>
          <Badge tone="success">Acuse app {dash?.stats.ackRate ?? 0}%</Badge>
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

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 lg:gap-4">
        <BentoPanel
          title="Filtros tácticos"
          subtitle="Cliente · tipo unidad"
          icon={<Filter />}
          className="lg:col-span-3"
        >
          <label className="block font-sans text-sm">
            <span className="font-data text-[10px] uppercase tracking-wider text-brand-text-secondary">
              Cliente
            </span>
            <select
              className="field mt-1 w-full"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              <option value="">Todos</option>
              {(dash?.filters.customers ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-3 block font-sans text-sm">
            <span className="font-data text-[10px] uppercase tracking-wider text-brand-text-secondary">
              Tipo vehículo
            </span>
            <select
              className="field mt-1 w-full"
              value={vehicleType}
              onChange={(e) => setVehicleType(e.target.value)}
            >
              <option value="">Todos</option>
              {(dash?.filters.vehicleTypes ?? []).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-4 space-y-2 font-data text-[11px] text-brand-text-secondary">
            <p>
              <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-brand-secondary" />
              Asignado {dash?.stats.assigned ?? 0}
            </p>
            <p>
              <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-brand-success" />
              En ruta {dash?.stats.inRoute ?? 0}
            </p>
            <p>
              <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-brand-info" />
              Taller {dash?.stats.workshop ?? 0}
            </p>
            <p>
              <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-brand-danger" />
              Bloqueado {dash?.stats.blocked ?? 0}
            </p>
          </div>
        </BentoPanel>

        <BentoPanel
          id="gantt"
          title="Cronograma diario"
          subtitle="Velocidad táctica · por vehículo"
          className="lg:col-span-9"
        >
          <div className="space-y-2">
            {plates.length === 0 ? (
              <p className="py-10 text-center font-sans text-sm text-brand-text-secondary">
                Sin servicios en el día operativo
              </p>
            ) : (
              plates.map((plate) => (
                <div key={plate} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 font-data text-xs text-brand-primary">
                    {plate}
                  </span>
                  <div className="relative h-11 flex-1 rounded-md border border-brand-border bg-brand-canvas">
                    {(dash?.gantt ?? [])
                      .filter((g) => g.plate === plate)
                      .map((g) => (
                        <div
                          key={g.id}
                          className={`absolute top-1 flex h-9 items-center gap-1 overflow-hidden rounded px-2 text-[10px] text-white ${COLOR_CLASS[g.color]}`}
                          style={barStyle(g)}
                          title={`${g.code} · ${COLOR_LABEL[g.color]} · ${g.driverName || "—"} · ${g.customerName || ""}`}
                        >
                          <span className="truncate font-data">{g.code}</span>
                          {g.appMonitor.published ? (
                            <span
                              className={`h-2 w-2 shrink-0 rounded-full ${
                                g.appMonitor.acknowledged
                                  ? "bg-white"
                                  : "bg-white/40"
                              }`}
                              title={
                                g.appMonitor.acknowledged
                                  ? "Itinerario leído"
                                  : "Publicado — pendiente ack"
                              }
                            />
                          ) : null}
                        </div>
                      ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </BentoPanel>

        <BentoPanel
          title="Monitor de estado de la app"
          subtitle="Confirmación de lectura del itinerario"
          icon={<Smartphone />}
          className="lg:col-span-6"
        >
          <NexaTable columns={["Código", "Conductor", "Ack"]}>
            {(dash?.gantt ?? [])
              .filter((g) => g.appMonitor.published || g.status === "ASSIGNED")
              .slice(0, 20)
              .map((g) => (
                <NexaRow key={`ack-${g.id}`}>
                  <NexaCell mono className="text-brand-primary">
                    {g.code}
                  </NexaCell>
                  <NexaCell>{g.driverName || "Sin conductor"}</NexaCell>
                  <NexaCell>
                    <Badge
                      tone={
                        g.appMonitor.acknowledged
                          ? "success"
                          : g.appMonitor.published
                            ? "warning"
                            : "danger"
                      }
                    >
                      {g.appMonitor.acknowledged
                        ? "Leído"
                        : g.appMonitor.published
                          ? "Pendiente ack"
                          : "Sin publicar"}
                    </Badge>
                  </NexaCell>
                </NexaRow>
              ))}
          </NexaTable>
        </BentoPanel>

        <BentoPanel
          id="relevo"
          title="Relevo flash"
          subtitle="Viaje descubierto → retén GPS → Push 1-clic"
          icon={<Flashlight />}
          className="lg:col-span-6"
        >
          <ul className="max-h-[280px] space-y-2 overflow-y-auto">
            {(dash?.gantt ?? [])
              .filter((g) => g.color === "red" || !g.driverName)
              .slice(0, 8)
              .map((g) => (
                <li
                  key={`flash-${g.id}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-brand-border px-3 py-2 transition-colors hover:border-brand-border-active"
                >
                  <div>
                    <p className="font-data text-xs">{g.code}</p>
                    <p className="font-data text-[11px] text-brand-text-secondary">
                      {g.plate} · {g.customerName || "—"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="primary"
                    className="w-auto px-3 py-1.5 text-xs"
                    disabled={busy}
                    onClick={() => void relevoFlash(g.id)}
                  >
                    Flash
                  </Button>
                </li>
              ))}
            {(dash?.gantt ?? []).filter((g) => g.color === "red" || !g.driverName)
              .length === 0 ? (
              <li className="py-6 text-center font-sans text-sm text-brand-text-secondary">
                Sin viajes descubiertos
              </li>
            ) : null}
          </ul>
        </BentoPanel>
      </div>
    </div>
  );
}
