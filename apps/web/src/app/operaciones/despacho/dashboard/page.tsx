"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { api } from "@/lib/api";
import { HowToBox, PageIntro } from "@/components/page-intro";

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
  blue: "bg-[#2563EB]",
  green: "bg-[#10B981]",
  gray: "bg-[#64748B]",
  red: "bg-[#FF2A5F]",
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
      <PageIntro module="logistica" title="Microdespacho" />
      <HowToBox
        steps={[
          "Triple candado: Tarjeta de Operación + Extintor + Fatiga < 30 / descanso ≥ 8h.",
          "Asignación publica itinerario silencioso a la App del conductor.",
          "Relevo flash: alerta Viaje Descubierto + retén GPS en 1 clic.",
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

      <div className="flex flex-wrap gap-2">
        <Badge tone="emerald">
          Fatiga máx {dash?.rules.dispatchFatigueMax ?? 30}
        </Badge>
        <Badge tone="amber">
          Descanso ≥ {dash?.rules.minLegalRestHours ?? 8}h
        </Badge>
        <Badge tone="emerald">Acuse de app {dash?.stats.ackRate ?? 0}%</Badge>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[240px_1fr]">
        {/* Filtros laterales */}
        <aside className="fsg-panel space-y-4 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            Filtros rápidos
          </h3>
          <label className="block text-sm">
            <span className="text-[var(--text-secondary)]">Cliente</span>
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
          <label className="block text-sm">
            <span className="text-[var(--text-secondary)]">Tipo vehículo</span>
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
          <div className="space-y-2 pt-2 text-xs text-[var(--text-secondary)]">
            <p>
              <span className="inline-block h-2 w-2 rounded-full bg-[#2563EB]" />{" "}
              Asignado {dash?.stats.assigned ?? 0}
            </p>
            <p>
              <span className="inline-block h-2 w-2 rounded-full bg-[#10B981]" />{" "}
              En ruta {dash?.stats.inRoute ?? 0}
            </p>
            <p>
              <span className="inline-block h-2 w-2 rounded-full bg-[#64748B]" />{" "}
              Taller {dash?.stats.workshop ?? 0}
            </p>
            <p>
              <span className="inline-block h-2 w-2 rounded-full bg-[#FF2A5F]" />{" "}
              Bloqueado {dash?.stats.blocked ?? 0}
            </p>
          </div>
        </aside>

        {/* Gantt */}
        <section id="gantt" className="fsg-panel p-4">
          <header className="mb-4">
            <h3 className="font-display text-lg text-[var(--text-primary)]">
              Cronograma diario
            </h3>
            <p className="text-sm text-[var(--text-secondary)]">
              Velocidad táctica · por vehículo
            </p>
          </header>
          <div className="space-y-2">
            {plates.length === 0 ? (
              <p className="py-10 text-center text-sm text-[var(--text-secondary)]">
                Sin servicios en el día operativo
              </p>
            ) : (
              plates.map((plate) => (
                <div key={plate} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 font-mono text-xs text-[var(--accent-primary)]">
                    {plate}
                  </span>
                  <div className="relative h-11 flex-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)]">
                    {(dash?.gantt ?? [])
                      .filter((g) => g.plate === plate)
                      .map((g) => (
                        <div
                          key={g.id}
                          className={`absolute top-1 flex h-9 items-center gap-1 overflow-hidden rounded px-2 text-[10px] text-white ${COLOR_CLASS[g.color]}`}
                          style={barStyle(g)}
                          title={`${g.code} · ${COLOR_LABEL[g.color]} · ${g.driverName || "—"} · ${g.customerName || ""}`}
                        >
                          <span className="truncate font-mono">{g.code}</span>
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
        </section>
      </div>

      {/* Monitor App + relevo */}
      <section id="relevo" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="fsg-panel overflow-hidden">
          <header className="border-b border-[var(--border-subtle)] px-4 py-3">
            <h3 className="font-display text-base">Monitor de estado de la app</h3>
            <p className="text-xs text-[var(--text-secondary)]">
              Confirmación de lectura del itinerario
            </p>
          </header>
          <ul className="max-h-[280px] divide-y divide-[var(--border-subtle)] overflow-y-auto">
            {(dash?.gantt ?? [])
              .filter((g) => g.appMonitor.published || g.status === "ASSIGNED")
              .slice(0, 20)
              .map((g) => (
                <li
                  key={`ack-${g.id}`}
                  className="flex items-center justify-between gap-2 px-4 py-2 text-sm"
                >
                  <div>
                    <p className="font-mono text-xs text-[var(--accent-primary)]">
                      {g.code}
                    </p>
                    <p className="text-[var(--text-primary)]">
                      {g.driverName || "Sin conductor"}
                    </p>
                  </div>
                  <Badge
                    tone={
                      g.appMonitor.acknowledged
                        ? "emerald"
                        : g.appMonitor.published
                          ? "amber"
                          : "rose"
                    }
                  >
                    {g.appMonitor.acknowledged
                      ? "Leído"
                      : g.appMonitor.published
                        ? "Pendiente ack"
                        : "Sin publicar"}
                  </Badge>
                </li>
              ))}
          </ul>
        </div>

        <div className="fsg-panel p-4">
          <h3 className="font-display text-base">Relevo flash</h3>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Viaje descubierto → retén GPS → Push 1-clic
          </p>
          <ul className="mt-4 max-h-[220px] space-y-2 overflow-y-auto">
            {(dash?.gantt ?? [])
              .filter((g) => g.color === "red" || !g.driverName)
              .slice(0, 8)
              .map((g) => (
                <li
                  key={`flash-${g.id}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] px-3 py-2"
                >
                  <div>
                    <p className="font-mono text-xs">{g.code}</p>
                    <p className="text-sm text-[var(--text-secondary)]">
                      {g.plate} · {g.customerName || "—"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="primary"
                    disabled={busy}
                    onClick={() => void relevoFlash(g.id)}
                  >
                    Flash
                  </Button>
                </li>
              ))}
            {(dash?.gantt ?? []).filter((g) => g.color === "red" || !g.driverName)
              .length === 0 ? (
              <li className="py-6 text-center text-sm text-[var(--text-secondary)]">
                Sin viajes descubiertos
              </li>
            ) : null}
          </ul>
        </div>
      </section>
    </div>
  );
}
