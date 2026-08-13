"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { api } from "@/lib/api";
import { HowToBox, PageIntro } from "@/components/page-intro";

type Dash = {
  kpis: {
    carteraAbierta: number;
    carteraCount: number;
    gastosRutaPendientes: number;
    gastosRutaCount: number;
    lotesCfoPendientes: number;
    cfoMfaThreshold: number;
  };
  approvalTray: Array<{
    id: string;
    amount: number;
    counterparty: string;
    invoiceNumber?: string;
    requiresCfoMfa: boolean;
    status: string;
  }>;
  highValueLots: Array<{
    id: string;
    amount: number;
    counterparty: string;
  }>;
  quotesPending: Array<{
    id: string;
    code: string;
    amount: number;
    status: string;
    customer: string;
  }>;
  cashProjection7d: {
    expectedInflowCxc: number;
    queuedOutflow: number;
    projectedBalance: number;
    alert: string;
  };
  ebitdaSeries: Array<{ label: string; ebitda: number; revenue: number }>;
  alerts: Array<{ kind: string; message: string; severity: string }>;
};

type SimResult = {
  simulation: {
    ebitda: number;
    margin: number;
    minMargin: number;
    semaphore: string;
    decision: string;
    canSign: boolean;
    counterOfferSuggested: number | null;
    totalCosts: number;
  };
  message: string;
};

type Costeo = {
  plate: string;
  revenue: number;
  costs: { routeAndFuel: number; partsAndWorkshop: number; total: number };
  contribution: number;
  margin: number;
  semaphore: string;
  fleetDecisionHint: string;
};

function cop(n: number) {
  return `$${Math.round(n).toLocaleString("es-CO")}`;
}

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

export default function CfoDashboardPage() {
  const [dash, setDash] = useState<Dash | null>(null);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [otp, setOtp] = useState("");
  const [selectedLot, setSelectedLot] = useState<string>("");
  const [simForm, setSimForm] = useState({
    fareAmount: "1200000",
    fuelProjected: "280000",
    tireWear: "45000",
    driverSalary: "350000",
    insurancePolicies: "80000",
  });
  const [sim, setSim] = useState<SimResult | null>(null);
  const [placa, setPlaca] = useState("BOG-892");
  const [costeo, setCosteo] = useState<Costeo | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const d = await api<Dash>("/api/v1/finanzas/cfo/dashboard");
      setDash(d);
      if (!selectedLot && d.highValueLots[0]) {
        setSelectedLot(d.highValueLots[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Uplink CFO fallido");
    }
  }, [selectedLot]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onMfaDisburse(e: FormEvent) {
    e.preventDefault();
    setError("");
    setOk("");
    if (!selectedLot) {
      setError("Seleccione un lote de alto valor");
      return;
    }
    try {
      await api("/api/v1/finanzas/cfo/dispersar/mfa-verify", {
        method: "POST",
        body: JSON.stringify({
          paymentScheduleIds: [selectedLot],
          mfaToken: otp,
        }),
      });
      setOk("Lote liberado — OTP CFO verificado");
      setOtp("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dispersión bloqueada");
    }
  }

  async function onSimulate(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const res = await api<SimResult>(
        "/api/v1/finanzas/cfo/contratos/simular-rentabilidad",
        {
          method: "POST",
          body: JSON.stringify({
            fareAmount: Number(simForm.fareAmount),
            fuelProjected: Number(simForm.fuelProjected),
            tireWear: Number(simForm.tireWear),
            driverSalary: Number(simForm.driverSalary),
            insurancePolicies: Number(simForm.insurancePolicies),
          }),
        },
      );
      setSim(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Simulación fallida");
    }
  }

  async function onCosteo(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const res = await api<Costeo>(
        `/api/v1/finanzas/cfo/flota/costeo-placa/${encodeURIComponent(placa)}`,
      );
      setCosteo(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Costeo fallido");
    }
  }

  const maxEbitda = Math.max(
    1,
    ...(dash?.ebitdaSeries.map((x) => x.ebitda) || [1]),
  );

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-5">
      <PageIntro
        module="tesoreria"
        title="CFO Hub · Dirección Financiera"
      />
      <HowToBox
        steps={[
          "Apruebe lotes > tope Tesorería con OTP de 6 dígitos (doble candado).",
          "Simule rentabilidad de cotizaciones — firma bloqueada si EBITDA < 15%.",
          "Revise costeo por placa para bajas de flota y fugas de capital.",
        ]}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="emerald">
          Cartera {cop(dash?.kpis.carteraAbierta ?? 0)}
        </Badge>
        <Badge tone="amber">
          Lotes CFO {dash?.kpis.lotesCfoPendientes ?? 0}
        </Badge>
        <Badge tone="rose">
          Gastos ruta pend. {cop(dash?.kpis.gastosRutaPendientes ?? 0)}
        </Badge>
        <Button
          type="button"
          variant="ghost"
          className="text-xs"
          onClick={() => void load()}
        >
          Refrescar
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-[var(--accent-alert)]">{error}</p>
      ) : null}
      {ok ? (
        <p className="text-sm text-[var(--accent-primary)]">{ok}</p>
      ) : null}

      {/* Bandeja MFA */}
      <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
        <h2 className="font-display text-sm font-semibold text-[var(--text-primary)]">
          Bandeja de aprobación · OTP CFO
        </h2>
        <p className="mt-1 font-data text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
          Tope MFA Dirección:{" "}
          {cop(dash?.kpis.cfoMfaThreshold ?? 20_000_000)}
        </p>
        <form
          onSubmit={onMfaDisburse}
          className="mt-3 grid gap-3 md:grid-cols-[1fr_140px_auto]"
        >
          <select
            className="rounded-lg border border-[var(--border-subtle)] bg-transparent px-3 py-2 font-data text-xs"
            value={selectedLot}
            onChange={(e) => setSelectedLot(e.target.value)}
          >
            <option value="">Seleccionar lote</option>
            {(dash?.approvalTray || []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.counterparty} · {cop(l.amount)}
                {l.requiresCfoMfa ? " · CFO MFA" : ""}
              </option>
            ))}
          </select>
          <input
            className="rounded-lg border border-[var(--border-subtle)] bg-transparent px-3 py-2 font-data text-xs tracking-[0.2em]"
            placeholder="OTP 000000"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            maxLength={6}
            required
          />
          <Button type="submit" variant="primary">
            Liberar lote
          </Button>
        </form>
        {!dash?.highValueLots.length ? (
          <p className="mt-3 text-xs text-[var(--text-secondary)]">
            Sin lotes sobre el tope CFO en cola.
          </p>
        ) : null}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* EBITDA chart */}
        <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
          <h2 className="font-display text-sm font-semibold">
            EBITDA mensual (comando)
          </h2>
          <div className="mt-4 flex h-40 items-end gap-2">
            {(dash?.ebitdaSeries || []).map((b) => (
              <div
                key={b.label}
                className="flex flex-1 flex-col items-center gap-1"
              >
                <div
                  className="w-full rounded-t bg-[var(--accent-primary)]/80"
                  style={{
                    height: `${Math.max(8, (b.ebitda / maxEbitda) * 100)}%`,
                  }}
                  title={cop(b.ebitda)}
                />
                <span className="font-data text-[9px] text-[var(--text-secondary)]">
                  {b.label}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-[var(--text-secondary)]">
            Flujo 7d: ingreso CxC {cop(dash?.cashProjection7d.expectedInflowCxc ?? 0)}{" "}
            · salida cola {cop(dash?.cashProjection7d.queuedOutflow ?? 0)} ·{" "}
            {dash?.cashProjection7d.alert}
          </p>
        </section>

        {/* Alertas */}
        <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
          <h2 className="font-display text-sm font-semibold">
            Alertas financieras
          </h2>
          <ul className="mt-3 space-y-2">
            {(dash?.alerts || []).map((a, i) => (
              <li
                key={`${a.kind}-${i}`}
                className="flex items-start gap-2 rounded-lg border border-[var(--border-subtle)] px-3 py-2"
              >
                <Badge
                  tone={
                    a.severity === "RED"
                      ? "rose"
                      : a.severity === "AMBER"
                        ? "amber"
                        : "emerald"
                  }
                >
                  {a.severity}
                </Badge>
                <span className="text-xs text-[var(--text-primary)]">
                  {a.message}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Simulador */}
        <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
          <h2 className="font-display text-sm font-semibold">
            Simulador de rentabilidad
          </h2>
          <form onSubmit={onSimulate} className="mt-3 grid grid-cols-2 gap-2">
            {(
              [
                ["fareAmount", "Tarifa"],
                ["fuelProjected", "Combustible"],
                ["tireWear", "Llantas"],
                ["driverSalary", "Salario conductor"],
                ["insurancePolicies", "Pólizas"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="text-[10px] text-[var(--text-secondary)]">
                {label}
                <input
                  className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-transparent px-2 py-1.5 font-data text-xs"
                  value={simForm[key]}
                  onChange={(e) =>
                    setSimForm((f) => ({ ...f, [key]: e.target.value }))
                  }
                />
              </label>
            ))}
            <div className="col-span-2">
              <Button type="submit" variant="secondary" className="w-full">
                Evaluar margen
              </Button>
            </div>
          </form>
          {sim ? (
            <div className="mt-3 space-y-1 rounded-lg border border-[var(--border-subtle)] p-3 text-xs">
              <div className="flex items-center gap-2">
                <Badge
                  tone={
                    sim.simulation.semaphore === "GREEN"
                      ? "emerald"
                      : sim.simulation.semaphore === "AMBER"
                        ? "amber"
                        : "rose"
                  }
                >
                  {sim.simulation.semaphore}
                </Badge>
                <span className="font-data">
                  EBITDA {cop(sim.simulation.ebitda)} ·{" "}
                  {pct(sim.simulation.margin)}
                </span>
              </div>
              <p>{sim.message}</p>
              {!sim.simulation.canSign &&
              sim.simulation.counterOfferSuggested ? (
                <p className="font-data text-[var(--accent-metric)]">
                  Contraoferta sugerida:{" "}
                  {cop(sim.simulation.counterOfferSuggested)}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>

        {/* Costeo placa */}
        <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
          <h2 className="font-display text-sm font-semibold">
            Costeo por placa (Rayos X)
          </h2>
          <form onSubmit={onCosteo} className="mt-3 flex gap-2">
            <input
              className="flex-1 rounded-lg border border-[var(--border-subtle)] bg-transparent px-3 py-2 font-data text-xs uppercase"
              value={placa}
              onChange={(e) => setPlaca(e.target.value)}
              placeholder="BOG-892"
            />
            <Button type="submit" variant="secondary">
              Consolidar
            </Button>
          </form>
          {costeo ? (
            <div className="mt-3 space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-data text-sm font-semibold">
                  {costeo.plate}
                </span>
                <Badge
                  tone={
                    costeo.semaphore === "GREEN"
                      ? "emerald"
                      : costeo.semaphore === "AMBER"
                        ? "amber"
                        : "rose"
                  }
                >
                  {pct(costeo.margin)}
                </Badge>
              </div>
              <p>Ingresos: {cop(costeo.revenue)}</p>
              <p>
                Costos ruta/combustible: {cop(costeo.costs.routeAndFuel)} ·
                Taller: {cop(costeo.costs.partsAndWorkshop)}
              </p>
              <p className="font-data">
                Contribución: {cop(costeo.contribution)}
              </p>
              <p className="text-[var(--text-secondary)]">
                {costeo.fleetDecisionHint}
              </p>
            </div>
          ) : null}
        </section>
      </div>

      {/* Cotizaciones pendientes */}
      <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
        <h2 className="font-display text-sm font-semibold">
          Cotizaciones comerciales · revisión financiera
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="font-data text-[10px] uppercase text-[var(--text-secondary)]">
                <th className="px-2 py-1">Código</th>
                <th className="px-2 py-1">Cliente</th>
                <th className="px-2 py-1">Monto</th>
                <th className="px-2 py-1">Estado</th>
              </tr>
            </thead>
            <tbody>
              {(dash?.quotesPending || []).map((q) => (
                <tr
                  key={q.id}
                  className="border-t border-[var(--border-subtle)]"
                >
                  <td className="px-2 py-2 font-data text-xs">{q.code}</td>
                  <td className="px-2 py-2 text-xs">{q.customer}</td>
                  <td className="px-2 py-2 font-data text-xs">
                    {cop(q.amount)}
                  </td>
                  <td className="px-2 py-2">
                    <Badge tone="amber">{q.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!dash?.quotesPending?.length ? (
            <p className="py-4 text-center text-xs text-[var(--text-secondary)]">
              Sin cotizaciones en bandeja
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
