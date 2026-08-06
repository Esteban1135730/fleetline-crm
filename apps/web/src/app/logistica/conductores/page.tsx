"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Button } from "@fsg/ui";
import { api } from "@/lib/api";
import { HowToBox, PageIntro } from "@/components/page-intro";
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

  const selectedDriver =
    (calendar?.drivers ?? drivers).find((d) => d.id === selectedDriverId) ??
    null;

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
        action={<ServerClockBadge clock={clock} />}
      />
      <HowToBox
        steps={[
          "Pulsa Ver en un conductor para abrir su calendario mensual.",
          "Haz clic en un servicio del día para ver el detalle completo, mapa y audit log.",
          "Casillas amarillas = Festivo (domingos y festivos CO).",
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
          <Button type="submit" variant="primary">
            Registrar novedad
          </Button>
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
              {(calendar?.drivers ?? drivers).map((dr) => {
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
                          {NOVELTY_KINDS.find((k) => k.value === activeNov.kind)
                            ?.label ?? activeNov.kind}
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--brand-muted)]">
                          Disponible
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Button
                        variant="primary"
                        onClick={() => void openDriverCalendar(dr.id)}
                      >
                        Ver
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {selectedDriver && calendar ? (
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
            onClose={() => {
              setSelectedDriverId(null);
              setLiquidacion(null);
              setDetailTripId(null);
            }}
            onTripClick={(tripId) => setDetailTripId(tripId)}
          />
        ) : null}

        {detailTripId ? (
          <ServicioDetailDrawer
            tripId={detailTripId}
            onClose={() => setDetailTripId(null)}
          />
        ) : null}

        {liquidacion ? (
          <div className="fsg-panel p-4 font-data text-xs">
            <p className="mb-2 text-sm font-semibold text-[var(--brand-fg)]">
              Liquidación extras · {liquidacion.driver.name}
            </p>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {Object.entries(liquidacion.totals).map(([k, v]) => (
                <div key={k}>
                  <div className="text-[var(--brand-muted)]">{k}</div>
                  <div>{typeof v === "number" ? v.toFixed(2) : v}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
