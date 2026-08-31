"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import {
  AlertTriangle,
  BarChart3,
  RefreshCw,
  Shield,
  TrendingUp,
  Truck,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/lib/api";
import { statusEs } from "@fsg/shared";
import { useThemeColors } from "@/lib/use-theme-colors";
import { EmptyState, SlideOver } from "@/components/audit";
import { BentoPanel } from "@/components/nexa/bento-panel";
import { NexaTable, NexaRow, NexaCell } from "@/components/nexa/nexa-table";

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
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Math.round(n));
}

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

export default function CfoDashboardPage() {
  const colors = useThemeColors();
  const [dash, setDash] = useState<Dash | null>(null);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [otp, setOtp] = useState("");
  const [selectedLot, setSelectedLot] = useState<string>("");
  const [simOpen, setSimOpen] = useState(false);
  const [costeoOpen, setCosteoOpen] = useState(false);
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
      setError(e instanceof Error ? e.message : "Conexión financiera fallida");
    }
  }, [selectedLot]);

  useEffect(() => {
    void load();
  }, [load]);

  const tipStyle = useMemo(
    () => ({
      borderRadius: 12,
      border: `1px solid ${colors.border}`,
      background: colors.surface,
      color: colors.textPrimary,
      fontSize: 12,
    }),
    [colors],
  );

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

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-border pb-4">
        <div>
          <p className="font-data text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-primary">
            Finanzas · Dirección
          </p>
          <h1 className="font-sans text-2xl font-semibold tracking-tight text-brand-text-primary md:text-3xl">
            Dirección financiera
          </h1>
          <p className="mt-1 font-sans text-sm text-brand-text-secondary">
            MFA dispersión · EBITDA · costeo por placa
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="success">
            Cartera {cop(dash?.kpis.carteraAbierta ?? 0)}
          </Badge>
          <Badge tone="warning">
            Lotes CFO {dash?.kpis.lotesCfoPendientes ?? 0}
          </Badge>
          <Badge tone="danger">
            Gastos ruta {cop(dash?.kpis.gastosRutaPendientes ?? 0)}
          </Badge>
          <Button
            type="button"
            variant="ghost"
            className="w-auto px-3 py-1.5 text-xs"
            onClick={() => void load()}
          >
            <RefreshCw className="mr-1 inline h-3 w-3" aria-hidden />
            Refrescar
          </Button>
        </div>
      </header>

      {error ? (
        <p className="rounded-lg border border-brand-danger/30 bg-brand-danger/10 px-3 py-2 text-sm text-brand-danger">
          {error}
        </p>
      ) : null}
      {ok ? (
        <p className="rounded-lg border border-brand-primary/30 bg-brand-primary/10 px-3 py-2 text-sm text-brand-primary">
          {ok}
        </p>
      ) : null}

      <BentoPanel
        title="Bandeja de aprobación · OTP CFO"
        subtitle={`Tope MFA: ${cop(dash?.kpis.cfoMfaThreshold ?? 20_000_000)}`}
        icon={<Shield aria-hidden />}
      >
        <form
          onSubmit={onMfaDisburse}
          className="grid gap-3 md:grid-cols-[1fr_140px_auto]"
        >
          <select
            className="field font-data text-xs"
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
            className="field font-data text-xs tracking-[0.2em]"
            placeholder="OTP 000000"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            maxLength={6}
            required
          />
          <Button type="submit" variant="primary" className="w-auto px-4 py-2">
            Liberar lote
          </Button>
        </form>
        {!dash?.highValueLots.length ? (
          <p className="mt-3 text-xs text-brand-text-secondary">
            Sin lotes sobre el tope CFO en cola.
          </p>
        ) : (
          <div className="mt-4">
            <NexaTable columns={["Contraparte", "Monto", "Estado", "MFA"]}>
              {(dash?.approvalTray || []).map((l) => (
                <NexaRow
                  key={l.id}
                  active={selectedLot === l.id}
                  onClick={() => setSelectedLot(l.id)}
                >
                  <NexaCell>{l.counterparty}</NexaCell>
                  <NexaCell mono>{cop(l.amount)}</NexaCell>
                  <NexaCell>{statusEs(l.status)}</NexaCell>
                  <NexaCell>
                    {l.requiresCfoMfa ? (
                      <Badge tone="warning">CFO MFA</Badge>
                    ) : (
                      "—"
                    )}
                  </NexaCell>
                </NexaRow>
              ))}
            </NexaTable>
          </div>
        )}
      </BentoPanel>

      <div className="grid gap-4 lg:grid-cols-2">
        <BentoPanel
          title="EBITDA mensual"
          subtitle="Comando financiero"
          icon={<BarChart3 aria-hidden />}
        >
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dash?.ebitdaSeries || []}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={colors.chartGrid}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: colors.textSecondary }}
                />
                <YAxis tick={{ fontSize: 10, fill: colors.textSecondary }} />
                <Tooltip
                  formatter={(v: number) => [cop(v), "EBITDA"]}
                  contentStyle={tipStyle}
                />
                <Bar
                  dataKey="ebitda"
                  name="EBITDA"
                  fill={colors.primary}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-3 text-xs text-brand-text-secondary">
            Flujo 7d: ingreso CxC{" "}
            {cop(dash?.cashProjection7d.expectedInflowCxc ?? 0)} · salida cola{" "}
            {cop(dash?.cashProjection7d.queuedOutflow ?? 0)} ·{" "}
            {dash?.cashProjection7d.alert}
          </p>
        </BentoPanel>

        <BentoPanel
          title="Alertas financieras"
          subtitle="Semáforo de riesgo"
          icon={<AlertTriangle aria-hidden />}
        >
          {!dash?.alerts?.length ? (
            <EmptyState title="Sin alertas activas" description="Sistema nominal." />
          ) : (
            <ul className="space-y-2">
              {(dash?.alerts || []).map((a, i) => (
                <li
                  key={`${a.kind}-${i}`}
                  className="flex items-start gap-2 rounded-lg border border-brand-border px-3 py-2"
                >
                  <Badge
                    tone={
                      a.severity === "RED"
                        ? "danger"
                        : a.severity === "AMBER"
                          ? "warning"
                          : "success"
                    }
                  >
                    {a.severity}
                  </Badge>
                  <span className="text-xs text-brand-text-primary">
                    {a.message}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </BentoPanel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <BentoPanel
          title="Simulador de rentabilidad"
          subtitle="EBITDA mínimo 15% · firma bloqueada"
          icon={<TrendingUp aria-hidden />}
          action={
            <Button
              type="button"
              variant="secondary"
              className="w-auto px-3 py-1.5 text-xs"
              onClick={() => setSimOpen(true)}
            >
              Abrir simulador
            </Button>
          }
        >
          {sim ? (
            <div className="space-y-1 rounded-lg border border-brand-border p-3 text-xs">
              <div className="flex items-center gap-2">
                <Badge
                  tone={
                    sim.simulation.semaphore === "GREEN"
                      ? "success"
                      : sim.simulation.semaphore === "AMBER"
                        ? "warning"
                        : "danger"
                  }
                >
                  {sim.simulation.semaphore}
                </Badge>
                <span className="font-data tabular-nums">
                  EBITDA {cop(sim.simulation.ebitda)} ·{" "}
                  {pct(sim.simulation.margin)}
                </span>
              </div>
              <p>{sim.message}</p>
              {!sim.simulation.canSign &&
              sim.simulation.counterOfferSuggested ? (
                <p className="font-data tabular-nums text-brand-warning">
                  Contraoferta sugerida:{" "}
                  {cop(sim.simulation.counterOfferSuggested)}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-brand-text-secondary">
              Evalúe margen de cotizaciones antes de firmar contrato.
            </p>
          )}
        </BentoPanel>

        <BentoPanel
          title="Costeo por placa"
          subtitle="Rayos X · fugas de capital"
          icon={<Truck aria-hidden />}
          action={
            <Button
              type="button"
              variant="secondary"
              className="w-auto px-3 py-1.5 text-xs"
              onClick={() => setCosteoOpen(true)}
            >
              Consolidar placa
            </Button>
          }
        >
          {costeo ? (
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-data text-sm font-semibold tabular-nums">
                  {costeo.plate}
                </span>
                <Badge
                  tone={
                    costeo.semaphore === "GREEN"
                      ? "success"
                      : costeo.semaphore === "AMBER"
                        ? "warning"
                        : "danger"
                  }
                >
                  {pct(costeo.margin)}
                </Badge>
              </div>
              <p className="font-data tabular-nums">
                Ingresos: {cop(costeo.revenue)}
              </p>
              <p className="font-data tabular-nums">
                Ruta/combustible: {cop(costeo.costs.routeAndFuel)} · Taller:{" "}
                {cop(costeo.costs.partsAndWorkshop)}
              </p>
              <p className="font-data tabular-nums">
                Contribución: {cop(costeo.contribution)}
              </p>
              <p className="text-brand-text-secondary">
                {costeo.fleetDecisionHint}
              </p>
            </div>
          ) : (
            <p className="text-sm text-brand-text-secondary">
              Consolide ingresos y costos por unidad de flota.
            </p>
          )}
        </BentoPanel>
      </div>

      <BentoPanel
        title="Cotizaciones comerciales"
        subtitle="Revisión financiera pendiente"
      >
        {!dash?.quotesPending?.length ? (
          <EmptyState
            title="Sin cotizaciones en bandeja"
            description="Comercial sin pendientes de revisión."
          />
        ) : (
          <NexaTable columns={["Código", "Cliente", "Monto", "Estado"]}>
            {(dash?.quotesPending || []).map((q) => (
              <NexaRow key={q.id}>
                <NexaCell mono className="text-xs">
                  {q.code}
                </NexaCell>
                <NexaCell className="text-xs">{q.customer}</NexaCell>
                <NexaCell mono>{cop(q.amount)}</NexaCell>
                <NexaCell>
                  <Badge tone="warning">{statusEs(q.status)}</Badge>
                </NexaCell>
              </NexaRow>
            ))}
          </NexaTable>
        )}
      </BentoPanel>

      <SlideOver
        open={simOpen}
        onClose={() => setSimOpen(false)}
        title="Simulador de rentabilidad"
        description="Firma bloqueada si EBITDA < 15%"
        widthClass="max-w-md"
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              className="w-auto px-4 py-2"
              onClick={() => setSimOpen(false)}
            >
              Cerrar
            </Button>
            <Button
              type="submit"
              form="cfo-sim-form"
              variant="primary"
              className="w-auto px-4 py-2"
            >
              Evaluar margen
            </Button>
          </>
        }
      >
        <form id="cfo-sim-form" onSubmit={onSimulate} className="grid grid-cols-2 gap-3">
          {(
            [
              ["fareAmount", "Tarifa"],
              ["fuelProjected", "Combustible"],
              ["tireWear", "Llantas"],
              ["driverSalary", "Salario conductor"],
              ["insurancePolicies", "Pólizas"],
            ] as const
          ).map(([key, label]) => (
            <label
              key={key}
              className="font-data text-[10px] uppercase text-brand-text-secondary"
            >
              {label}
              <input
                className="field mt-1 w-full font-data tabular-nums"
                value={simForm[key]}
                onChange={(e) =>
                  setSimForm((f) => ({ ...f, [key]: e.target.value }))
                }
              />
            </label>
          ))}
        </form>
      </SlideOver>

      <SlideOver
        open={costeoOpen}
        onClose={() => setCosteoOpen(false)}
        title="Costeo por placa"
        description="Consolidado ingresos · ruta · taller"
        widthClass="max-w-md"
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              className="w-auto px-4 py-2"
              onClick={() => setCosteoOpen(false)}
            >
              Cerrar
            </Button>
            <Button
              type="submit"
              form="cfo-costeo-form"
              variant="primary"
              className="w-auto px-4 py-2"
            >
              Consolidar
            </Button>
          </>
        }
      >
        <form id="cfo-costeo-form" onSubmit={onCosteo} className="space-y-3">
          <label className="flex flex-col gap-1 font-data text-[10px] uppercase tracking-wider text-brand-text-secondary">
            Placa
            <input
              className="field font-data uppercase tabular-nums"
              value={placa}
              onChange={(e) => setPlaca(e.target.value)}
              placeholder="BOG-892"
            />
          </label>
        </form>
      </SlideOver>
    </div>
  );
}
