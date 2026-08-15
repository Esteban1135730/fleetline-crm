"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@fsg/ui";
import { Calendar, Users } from "lucide-react";
import { api } from "@/lib/api";
import { PageIntro } from "@/components/page-intro";
import { EmptyState, KpiCard, Modal } from "@/components/audit";
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

export default function LogisticaConductoresPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [clock, setClock] = useState<string>("—");
  const [error, setError] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [calendar, setCalendar] = useState<CalendarPayload | null>(null);
  const [substitutes, setSubstitutes] = useState<Substitute[]>([]);
  const [impacted, setImpacted] = useState<Servicio[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [detailTripId, setDetailTripId] = useState<string | null>(null);
  const [liquidacion, setLiquidacion] = useState<{
    totals: Record<string, number>;
    daily: unknown[];
    driver: { name: string };
  } | null>(null);
  const [totalExtrasHours, setTotalExtrasHours] = useState(0);
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

  useEffect(() => {
    void Promise.all([loadDrivers(), loadClock()]).catch((e) =>
      setError(e instanceof Error ? e.message : "Uplink fallido"),
    );
    const t = setInterval(() => void loadClock(), 1000);
    return () => clearInterval(t);
  }, [loadDrivers, loadClock]);

  useEffect(() => {
    void loadCalendar().catch((e) =>
      setError(e instanceof Error ? e.message : "Calendario fallido"),
    );
  }, [loadCalendar]);

  useEffect(() => {
    const mes = `${calMonth.year}-${String(calMonth.month).padStart(2, "0")}`;
    void api<{ metrics: { totalExtrasHours: number } }>(
      `/nomina/reporte-general?mes=${encodeURIComponent(mes)}`,
    )
      .then((r) => setTotalExtrasHours(Number(r.metrics?.totalExtrasHours) || 0))
      .catch(() => setTotalExtrasHours(0));
  }, [calMonth]);

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
      await loadCalendar();
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
    }>(`/logistica/conductores/${driverId}/liquidacion-extras`);
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

  const driverRows = drivers.length
    ? drivers
    : (calendar?.drivers ?? []);

  function shiftMonth(delta: number) {
    setCalMonth((m) => {
      const d = new Date(m.year, m.month - 1 + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() + 1 };
    });
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <PageIntro
        module="logistica"
        title="Gestión de Conductores y Nómina de Extras"
        subtitle="Gestión de novedades de nómina, control de fatiga y liquidación de horas extras operativas"
        action={<ServerClockBadge clock={clock} />}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <KpiCard
          label="Total Horas Extras Mes"
          value={totalExtrasHours.toFixed(1)}
          tone="warn"
          delta="HED+HEN+RN…"
        />
        <KpiCard
          label="Conductores en Incapacidad"
          value={incapacityCount}
          tone="danger"
          delta="Novedades activas"
        />
      </div>

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

      <section className="space-y-4" data-testid="panel-conductores">
        <form
          onSubmit={onNovelty}
          className="fsg-panel grid grid-cols-1 gap-3 p-4 md:grid-cols-5"
        >
          <select
            className="field"
            value={novelty.driverId}
            onChange={(e) =>
              setNovelty({ ...novelty, driverId: e.target.value })
            }
            required
          >
            <option value="">Conductor…</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <select
            className="field"
            value={novelty.kind}
            onChange={(e) => setNovelty({ ...novelty, kind: e.target.value })}
          >
            {NOVELTY_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
          <input
            type="date"
            className="field font-data"
            value={novelty.dateFrom}
            onChange={(e) =>
              setNovelty({ ...novelty, dateFrom: e.target.value })
            }
            required
          />
          <input
            type="date"
            className="field font-data"
            value={novelty.dateTo}
            onChange={(e) => setNovelty({ ...novelty, dateTo: e.target.value })}
            required
          />
          <div className="flex justify-end">
            <Button type="submit" variant="primary" className="w-auto px-4 py-2">
              Registrar novedad
            </Button>
          </div>
        </form>

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

        <div className="fsg-panel data-shell overflow-x-auto">
          {driverRows.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<Users className="h-7 w-7" aria-hidden />}
                title="Sin conductores"
                description="No hay conductores cargados en el uplink de flota."
              />
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="px-3 py-2">Conductor</th>
                  <th className="px-3 py-2">Documento</th>
                  <th className="px-3 py-2">Fatiga</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2">Calendario / extras</th>
                </tr>
              </thead>
              <tbody>
                {driverRows.map((dr) => {
                  const activeNov = calendar?.novelties.find(
                    (n) =>
                      n.driverId === dr.id &&
                      new Date(n.dateFrom) <= new Date() &&
                      new Date(n.dateTo) >= new Date(),
                  );
                  return (
                    <tr
                      key={dr.id}
                      className={`border-t border-[var(--brand-line)] ${
                        selectedDriverId === dr.id
                          ? "bg-[var(--brand-primary)]/10"
                          : ""
                      }`}
                    >
                      <td className="px-3 py-2">{dr.name}</td>
                      <td className="px-3 py-2 font-data text-xs">
                        {dr.document}
                      </td>
                      <td className="px-3 py-2 font-data text-xs">
                        {dr.fatigueScore}
                      </td>
                      <td className="px-3 py-2">
                        {activeNov ? (
                          <span
                            className={`rounded px-2 py-0.5 text-[10px] ${noveltyColor(activeNov.kind)}`}
                          >
                            {NOVELTY_KINDS.find(
                              (k) => k.value === activeNov.kind,
                            )?.label ?? activeNov.kind}
                          </span>
                        ) : (
                          <span className="text-xs text-[var(--brand-muted)]">
                            Disponible
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => void openDriverCalendar(dr.id)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-slate-600 bg-transparent px-2.5 py-1 text-xs font-medium text-slate-200 transition-colors duration-150 hover:border-emerald-500/50 hover:bg-emerald-500/10"
                        >
                          <Calendar className="h-3.5 w-3.5" aria-hidden />
                          Calendario
                        </button>
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
              ? `Calendario · ${selectedDriver.name}`
              : "Calendario"
          }
          description="Servicios, novedades y liquidación de extras del mes."
          size="xl"
        >
          {selectedDriver && calendar ? (
            <div className="space-y-4">
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
              {liquidacion ? (
                <div className="rounded-lg border border-slate-800 p-4 font-data text-xs">
                  <p className="mb-2 text-sm font-semibold text-slate-100">
                    Liquidación extras · {liquidacion.driver.name}
                  </p>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                    {Object.entries(liquidacion.totals).map(([k, v]) => (
                      <div key={k}>
                        <div className="text-slate-500">{k}</div>
                        <div className="text-slate-200">
                          {typeof v === "number" ? v.toFixed(2) : v}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
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
    </div>
  );
}
