"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@fsg/ui";
import { HARD_RULES } from "@fsg/shared";
import {
  Activity,
  AlertTriangle,
  Calendar,
  Clock,
  Search,
  ShieldAlert,
  Users,
} from "lucide-react";
import { api } from "@/lib/api";
import { PageIntro } from "@/components/page-intro";
import {
  EmptyState,
  KpiCard,
  Modal,
  SlideOver,
  StatusPulseBadge,
} from "@/components/audit";
import { DriverMonthCalendar } from "@/components/logistica/driver-month-calendar";
import { ServicioDetailDrawer } from "@/components/logistica/servicio-detail-drawer";
import {
  NOVELTY_KINDS,
  noveltyColor,
  ServerClockBadge,
  type CalendarPayload,
  type Driver,
  type Servicio,
  type Substitute,
} from "@/components/logistica/logistica-shared";

/** Referencia legal orientativa — termómetro mensual de HED/HEN. */
const MONTHLY_OVERTIME_LIMIT_H = 48;

type NominaRow = {
  empleadoId: string;
  name: string;
  totalExtrasHours: number;
  totalExtrasAmount: number;
};

type NominaGeneral = {
  metrics: {
    totalExtrasHours: number;
    totalExtrasAmount: number;
    employeeCount: number;
  };
  rows: NominaRow[];
};

function FatigueBar({
  score,
  blocked,
}: {
  score: number;
  blocked?: boolean;
}) {
  const max = HARD_RULES.FATIGUE_BLOCK_SCORE;
  const pct = Math.min(100, Math.round((score / max) * 100));
  const tone =
    blocked || score >= max
      ? "bg-[var(--accent-alert)]"
      : score >= HARD_RULES.FATIGUE_YELLOW_MIN
        ? "bg-[var(--accent-metric)]"
        : "bg-[var(--accent-primary)]";
  return (
    <div className="min-w-[7rem]">
      <div className="flex items-center justify-between gap-2">
        <span className="font-data text-xs tabular-nums">{score}</span>
        {(blocked || score >= max) && (
          <ShieldAlert className="h-3.5 w-3.5 text-[var(--accent-alert)]" />
        )}
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--border-subtle)]">
        <div
          className={`h-full transition-all duration-150 ${tone}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function OvertimeBar({ hours }: { hours: number }) {
  const pct = Math.min(
    100,
    Math.round((hours / MONTHLY_OVERTIME_LIMIT_H) * 100),
  );
  const tone =
    pct >= 90
      ? "bg-[var(--accent-alert)]"
      : pct >= 70
        ? "bg-[var(--accent-metric)]"
        : "bg-[var(--accent-primary)]";
  return (
    <div className="min-w-[5rem]">
      <span className="font-data text-xs tabular-nums">{hours.toFixed(1)}h</span>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--border-subtle)]">
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function LogisticaConductoresPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [clock, setClock] = useState<string>("—");
  const [error, setError] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [calendar, setCalendar] = useState<CalendarPayload | null>(null);
  const [nomina, setNomina] = useState<NominaGeneral | null>(null);
  const [substitutes, setSubstitutes] = useState<Substitute[]>([]);
  const [impacted, setImpacted] = useState<Servicio[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [detailTripId, setDetailTripId] = useState<string | null>(null);
  const [noveltyOpen, setNoveltyOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [liquidacion, setLiquidacion] = useState<{
    totals: Record<string, number>;
    daily: unknown[];
    driver: { name: string };
    period?: { month: number; year: number };
  } | null>(null);
  const [novelty, setNovelty] = useState({
    driverId: "",
    kind: "INCAPACITY",
    dateFrom: "",
    dateTo: "",
    notes: "",
  });
  const [calMonth, setCalMonth] = useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() + 1 };
  });

  const loadDrivers = useCallback(async () => {
    const d = await api<Driver[]>("/logistica/conductores");
    setDrivers(d);
  }, []);

  const loadClock = useCallback(async () => {
    const c = await api<{ iso: string }>("/logistica/reloj");
    setClock(new Date(c.iso).toLocaleTimeString("es-CO", { hour12: false }));
  }, []);

  const loadCalendar = useCallback(async () => {
    const cal = await api<CalendarPayload>(
      `/logistica/conductores/calendario?year=${calMonth.year}&month=${calMonth.month}`,
    );
    setCalendar(cal);
  }, [calMonth]);

  const loadNomina = useCallback(async () => {
    const mes = `${calMonth.year}-${String(calMonth.month).padStart(2, "0")}`;
    try {
      const r = await api<NominaGeneral>(
        `/nomina/reporte-general?mes=${encodeURIComponent(mes)}`,
      );
      setNomina(r);
    } catch {
      setNomina(null);
    }
  }, [calMonth]);

  useEffect(() => {
    void Promise.all([loadDrivers(), loadClock()]).catch((e) =>
      setError(e instanceof Error ? e.message : "Conexión fallida"),
    );
    const t = setInterval(() => void loadClock(), 1000);
    return () => clearInterval(t);
  }, [loadDrivers, loadClock]);

  useEffect(() => {
    void loadCalendar().catch((e) =>
      setError(e instanceof Error ? e.message : "Calendario fallido"),
    );
    void loadNomina();
  }, [loadCalendar, loadNomina]);

  const extrasByDriver = useMemo(() => {
    const map = new Map<string, NominaRow>();
    for (const row of nomina?.rows ?? []) {
      map.set(row.empleadoId, row);
    }
    return map;
  }, [nomina]);

  const incapacityCount = useMemo(() => {
    if (!calendar) return 0;
    const now = new Date();
    const ids = new Set(
      calendar.novelties
        .filter(
          (n) =>
            n.kind === "INCAPACITY" &&
            new Date(n.dateFrom) <= now &&
            new Date(n.dateTo) >= now,
        )
        .map((n) => n.driverId),
    );
    return ids.size;
  }, [calendar]);

  const blockedCount = useMemo(
    () =>
      drivers.filter(
        (d) =>
          d.dispatchBlocked ||
          d.fatigueScore >= HARD_RULES.FATIGUE_BLOCK_SCORE,
      ).length,
    [drivers],
  );

  const totalExtrasHours = nomina?.metrics.totalExtrasHours ?? 0;
  const overtimePct = Math.min(
    100,
    Math.round((totalExtrasHours / MONTHLY_OVERTIME_LIMIT_H) * 100),
  );

  const filteredDrivers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = drivers.length ? drivers : (calendar?.drivers ?? []);
    if (!q) return base;
    return base.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.document.toLowerCase().includes(q),
    );
  }, [drivers, calendar, search]);

  function openNoveltyFor(driverId: string) {
    setNovelty((n) => ({ ...n, driverId }));
    setNoveltyOpen(true);
  }

  async function onNovelty(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const res = await api<{
        substitutes: Substitute[];
        impactedServices: Servicio[];
        warning?: string | null;
      }>("/logistica/conductores/novedades", {
        method: "POST",
        body: JSON.stringify({
          driverId: novelty.driverId,
          kind: novelty.kind,
          dateFrom: new Date(novelty.dateFrom).toISOString(),
          dateTo: new Date(novelty.dateTo + "T23:59:59").toISOString(),
          notes: novelty.notes || undefined,
        }),
      });
      setSubstitutes(res.substitutes);
      setImpacted(res.impactedServices as Servicio[]);
      setStatusMsg(
        res.warning ||
          `Novedad registrada · ${res.substitutes.length} sustitutos`,
      );
      setNoveltyOpen(false);
      await Promise.all([loadCalendar(), loadNomina()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Novedad fallida");
    }
  }

  async function reasignar(tripId: string, newDriverId: string) {
    await api("/logistica/servicios/reasignar", {
      method: "POST",
      body: JSON.stringify({ tripId, newDriverId }),
    });
    setStatusMsg("Relevo aplicado — ambas partes notificadas");
    await loadCalendar();
  }

  async function openDriverCalendar(driverId: string) {
    setSelectedDriverId(driverId);
    const liq = await api<{
      totals: Record<string, number>;
      daily: unknown[];
      driver: { name: string };
      period?: { month: number; year: number };
    }>(
      `/logistica/conductores/${driverId}/liquidacion-extras?month=${calMonth.month}&year=${calMonth.year}`,
    );
    setLiquidacion(liq);
  }

  function closeCalendar() {
    setSelectedDriverId(null);
    setLiquidacion(null);
    setDetailTripId(null);
  }

  const selectedDriver =
    (calendar?.drivers ?? drivers).find((d) => d.id === selectedDriverId) ??
    null;

  function shiftMonth(delta: number) {
    setCalMonth((m) => {
      const d = new Date(m.year, m.month - 1 + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() + 1 };
    });
  }

  const drivenHoursMonth = liquidacion
    ? Number(liquidacion.totals.ordinaryHours ?? 0) +
      Number(liquidacion.totals.hedHours ?? 0) +
      Number(liquidacion.totals.henHours ?? 0) +
      Number(liquidacion.totals.hedfHours ?? 0) +
      Number(liquidacion.totals.henfHours ?? 0)
    : 0;

  const extrasHoursDriver = liquidacion
    ? Number(liquidacion.totals.hedHours ?? 0) +
      Number(liquidacion.totals.henHours ?? 0) +
      Number(liquidacion.totals.hedfHours ?? 0) +
      Number(liquidacion.totals.henfHours ?? 0)
    : 0;

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <PageIntro
        module="logistica"
        title="Conductores y nómina operativa"
        subtitle="Liquidación por telemetría · monitor PESV · kill-switch logística"
        action={<ServerClockBadge clock={clock} />}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Horas extras mes"
          value={totalExtrasHours.toFixed(1)}
          delta={`${overtimePct}% del límite ${MONTHLY_OVERTIME_LIMIT_H}h`}
          tone={
            overtimePct >= 90 ? "danger" : overtimePct >= 70 ? "warn" : "ok"
          }
          icon={<Clock className="h-10 w-10" />}
        />
        <KpiCard
          label="Costo extras"
          value={`$${Math.round(nomina?.metrics.totalExtrasAmount ?? 0).toLocaleString("es-CO")}`}
          tone="warn"
          icon={<Activity className="h-10 w-10" />}
        />
        <KpiCard
          label="Bloqueo PESV"
          value={blockedCount}
          delta="Fatiga ≥80 · kill-switch logística"
          tone={blockedCount > 0 ? "danger" : "ok"}
          icon={<ShieldAlert className="h-10 w-10" />}
        />
        <KpiCard
          label="Incapacidades activas"
          value={incapacityCount}
          tone={incapacityCount > 0 ? "danger" : "ok"}
          icon={<Users className="h-10 w-10" />}
        />
      </div>

      <div className="fsg-panel p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
            Termómetro horas extras · flota
          </span>
          <span
            className={`font-data text-sm font-bold tabular-nums ${
              overtimePct >= 90
                ? "text-[var(--accent-alert)]"
                : overtimePct >= 70
                  ? "text-[var(--accent-metric)]"
                  : "text-[var(--accent-primary)]"
            }`}
          >
            {totalExtrasHours.toFixed(1)} / {MONTHLY_OVERTIME_LIMIT_H}h
          </span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-[var(--border-subtle)]">
          <div
            className={`h-full transition-all duration-150 ${
              overtimePct >= 90
                ? "bg-[var(--accent-alert)]"
                : overtimePct >= 70
                  ? "bg-[var(--accent-metric)]"
                  : "bg-[var(--accent-primary)]"
            }`}
            style={{ width: `${overtimePct}%` }}
          />
        </div>
        {overtimePct >= 70 ? (
          <p className="mt-2 flex items-center gap-1 text-xs text-[var(--accent-metric)]">
            <AlertTriangle className="h-3.5 w-3.5" />
            Alerta de sobrecosto — revise turnos y telemetría GPS
          </p>
        ) : null}
      </div>

      {statusMsg ? (
        <p
          role="status"
          className="rounded-lg border border-[color-mix(in_srgb,var(--accent-primary)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent-primary)_8%,transparent)] px-3 py-2 text-sm text-[var(--accent-primary)]"
        >
          {statusMsg}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-[var(--brand-signal)]">
          {error}
        </p>
      ) : null}

      <section className="space-y-4" data-testid="panel-conductores">
        {substitutes.length ? (
          <div className="fsg-panel space-y-3 p-4">
            <p className="text-sm font-semibold">Sustitutos sugeridos (relevo)</p>
            {impacted.length ? (
              <p className="text-xs text-[var(--brand-amber)]">
                {impacted.length} servicio(s) impactado(s)
              </p>
            ) : null}
            <ul className="space-y-2">
              {substitutes.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--brand-line)] py-2"
                >
                  <div>
                    <div className="text-sm">{s.name}</div>
                    <div className="font-data text-[10px] text-[var(--brand-muted)]">
                      Fatiga {s.fatigueScore}
                      {s.fatigueWarning ? (
                        <span className="ml-2 text-[var(--brand-signal)]">
                          · {s.pesvMessage}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {impacted[0] ? (
                    <Button
                      variant="primary"
                      className="w-auto"
                      onClick={() => void reasignar(impacted[0].id, s.id)}
                    >
                      Reasignar 1 clic
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="fsg-panel flex flex-wrap items-end gap-3 p-4">
          <label className="min-w-[220px] flex-1 text-xs text-[var(--text-secondary)]">
            Buscar conductor
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-secondary)]" />
              <input
                className="field w-full pl-9"
                placeholder="Nombre o documento"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </label>
          <Button
            type="button"
            variant="primary"
            className="w-auto px-4 py-2"
            onClick={() => {
              setNovelty((n) => ({ ...n, driverId: "" }));
              setNoveltyOpen(true);
            }}
          >
            Registrar novedad
          </Button>
        </div>

        <div className="fsg-panel data-shell overflow-x-auto">
          {filteredDrivers.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<Users className="h-7 w-7" aria-hidden />}
                title="Sin conductores"
                description="No hay conductores cargados en la flota."
              />
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="px-3 py-2">Conductor</th>
                  <th className="px-3 py-2">Fatiga PESV</th>
                  <th className="px-3 py-2">Extras mes</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2">Despacho</th>
                  <th className="px-3 py-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredDrivers.map((dr) => {
                  const activeNov = calendar?.novelties.find(
                    (n) =>
                      n.driverId === dr.id &&
                      new Date(n.dateFrom) <= new Date() &&
                      new Date(n.dateTo) >= new Date(),
                  );
                  const extras = extrasByDriver.get(dr.id);
                  const blocked =
                    dr.dispatchBlocked ||
                    dr.fatigueScore >= HARD_RULES.FATIGUE_BLOCK_SCORE;
                  return (
                    <tr
                      key={dr.id}
                      className={`border-t border-[var(--brand-line)] ${
                        selectedDriverId === dr.id
                          ? "bg-[color-mix(in_srgb,var(--accent-primary)_8%,transparent)]"
                          : ""
                      }`}
                    >
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-[var(--text-primary)]">
                          {dr.name}
                        </div>
                        <div className="font-data text-[10px] text-[var(--text-secondary)]">
                          {dr.document}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <FatigueBar
                          score={dr.fatigueScore}
                          blocked={dr.dispatchBlocked}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <OvertimeBar
                          hours={extras?.totalExtrasHours ?? 0}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        {activeNov ? (
                          <span
                            className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${noveltyColor(activeNov.kind)}`}
                          >
                            {NOVELTY_KINDS.find(
                              (k) => k.value === activeNov.kind,
                            )?.label ?? activeNov.kind}
                          </span>
                        ) : (
                          <StatusPulseBadge tone="active" pulse={false}>
                            Disponible
                          </StatusPulseBadge>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {blocked ? (
                          <StatusPulseBadge tone="danger" pulse>
                            Bloqueado
                          </StatusPulseBadge>
                        ) : (
                          <StatusPulseBadge tone="active" pulse={false}>
                            Liberado
                          </StatusPulseBadge>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          <Button
                            variant="ghost"
                            className="w-auto"
                            onClick={() => openNoveltyFor(dr.id)}
                          >
                            Novedad
                          </Button>
                          <Button
                            variant="ghost"
                            className="w-auto"
                            onClick={() => void openDriverCalendar(dr.id)}
                          >
                            <Calendar className="mr-1 h-3.5 w-3.5" />
                            Calendario
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <Modal
          open={Boolean(selectedDriver && calendar)}
          onClose={closeCalendar}
          title={
            selectedDriver
              ? `Auditoría de turnos · ${selectedDriver.name}`
              : "Calendario"
          }
          description="Heatmap GPS · novedades · liquidación telemétrica del mes."
          size="xl"
        >
          {selectedDriver && calendar ? (
            <div className="space-y-4">
              {liquidacion ? (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <KpiCard
                    label="Horas conducidas"
                    value={`${drivenHoursMonth.toFixed(0)}h`}
                    tone="neutral"
                  />
                  <KpiCard
                    label="Horas extras"
                    value={`${extrasHoursDriver.toFixed(1)}h`}
                    tone="warn"
                  />
                  <KpiCard
                    label="Recargo nocturno"
                    value={`${Number(liquidacion.totals.rnHours ?? 0).toFixed(1)}h`}
                    tone="neutral"
                  />
                  <KpiCard
                    label="Liquidación COP"
                    value={`$${Math.round(Number(liquidacion.totals.totalAmount ?? 0)).toLocaleString("es-CO")}`}
                    tone="ok"
                  />
                </div>
              ) : null}
              <DriverMonthCalendar
                calendar={calendar}
                driverId={selectedDriver.id}
                driverName={selectedDriver.name}
                year={calMonth.year}
                month={calMonth.month}
                onPrev={() => shiftMonth(-1)}
                onNext={() => shiftMonth(1)}
                onToday={() => {
                  const n = new Date();
                  setCalMonth({
                    year: n.getFullYear(),
                    month: n.getMonth() + 1,
                  });
                }}
                onClose={closeCalendar}
                onTripClick={(tripId) => setDetailTripId(tripId)}
              />
            </div>
          ) : null}
        </Modal>

        {detailTripId ? (
          <ServicioDetailDrawer
            tripId={detailTripId}
            onClose={() => setDetailTripId(null)}
          />
        ) : null}
      </section>

      <SlideOver
        open={noveltyOpen}
        onClose={() => setNoveltyOpen(false)}
        title="Registrar novedad"
        description="Sellado inmutable · relevo automático si impacta servicios"
        widthClass="max-w-md"
        footer={
          <Button
            type="submit"
            form="conductores-novelty-form"
            variant="primary"
            className="w-auto px-4 py-2"
          >
            Registrar novedad
          </Button>
        }
      >
        <form
          id="conductores-novelty-form"
          onSubmit={onNovelty}
          className="grid gap-3"
        >
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--text-secondary)]">
            Conductor
            <select
              className="field"
              value={novelty.driverId}
              onChange={(e) =>
                setNovelty({ ...novelty, driverId: e.target.value })
              }
              required
            >
              <option value="">Seleccionar…</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--text-secondary)]">
            Tipo
            <select
              className="field"
              value={novelty.kind}
              onChange={(e) =>
                setNovelty({ ...novelty, kind: e.target.value })
              }
            >
              {NOVELTY_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--text-secondary)]">
              Desde
              <input
                type="date"
                className="field font-data"
                value={novelty.dateFrom}
                onChange={(e) =>
                  setNovelty({ ...novelty, dateFrom: e.target.value })
                }
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--text-secondary)]">
              Hasta
              <input
                type="date"
                className="field font-data"
                value={novelty.dateTo}
                onChange={(e) =>
                  setNovelty({ ...novelty, dateTo: e.target.value })
                }
                required
              />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--text-secondary)]">
            Notas
            <textarea
              className="field"
              rows={3}
              placeholder="Observaciones RRHH / soporte"
              value={novelty.notes}
              onChange={(e) =>
                setNovelty({ ...novelty, notes: e.target.value })
              }
            />
          </label>
        </form>
      </SlideOver>
    </div>
  );
}
