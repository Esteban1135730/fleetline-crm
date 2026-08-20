"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import {
  Wallet,
  Gauge,
  ShieldAlert,
  HeartPulse,
  LineChart as LineChartIcon,
  Flame,
  TrendingUp,
  Truck,
  FileSearch,
  Gavel,
} from "lucide-react";
import Link from "next/link";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
  AreaChart,
  Area,
  Legend,
} from "recharts";
import { api } from "@/lib/api";
import { EmptyState, KpiCard, Modal, SlideOver } from "@/components/audit";

type Pillars = {
  growth?: { label: string; valuePct: number; hint: string };
  fleetAlerts?: { label: string; immobilized: number; hint: string };
  margin?: { label: string; valuePct: number; hint: string };
  compliance?: { label: string; valuePct: number; hint: string };
  liquidity: { label: string; valueCop: number; hint: string };
  sla: { label: string; valuePct: number; hint: string };
  legalPesv: { label: string; level: string; blockedUnits: number; hint: string };
  nps: { label: string; value: number; samples: number; hint: string };
};

type Dash = {
  canvas: string;
  pillars: Pillars;
  revenueHeat: Array<{
    corridor: string;
    revenue: number;
    trips: number;
    heat: number;
  }>;
  fleetHealth?: {
    enRuta: number;
    enPatio: number;
    enTaller: number;
    pctRuta: number;
    pctPatio: number;
    pctTaller: number;
  };
  complianceAlerts?: Array<{ source: string; message: string; severity: string }>;
  commercialPipeline?: {
    quotedCop: number;
    closedCop: number;
    weeks: Array<{ label: string; cotizado: number; cerrado: number }>;
  };
  cashFlowHistory?: Array<{ mes: string; ingresos: number; costos: number }>;
  pendingMarginExceptions?: number;
  killSwitch?: { blockedPct: number; blockedUnits: number };
  cashFlow?: { atRiskAmount: number };
};

function cop(n: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

const HEAT_COLORS = [
  "#0D9488",
  "#10B981",
  "#D97706",
  "#FFB800",
  "#FF2A5F",
  "#94A3B8",
];

export default function PresidenciaDashboardPage() {
  const [dash, setDash] = useState<Dash | null>(null);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [utterance, setUtterance] = useState(
    "Briefing: estatus operativo, saldo en bancos y flota bloqueada",
  );
  const [jarvisOut, setJarvisOut] = useState<string | null>(null);
  const [capexOut, setCapexOut] = useState<string | null>(null);
  const [defconOut, setDefconOut] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [units, setUnits] = useState(5);
  const [unitCost, setUnitCost] = useState(280_000_000);
  const [zones, setZones] = useState("Sur Bogotá, Soacha");
  const [defconActive, setDefconActive] = useState(false);
  const [capexOpen, setCapexOpen] = useState(false);
  const [defconOpen, setDefconOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setDash(await api<Dash>("/api/v1/presidencia/dashboard"));
    } catch (e) {
      setError((e as Error).message || "Señal perdida — conexión de presidencia");
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 25_000);
    return () => clearInterval(t);
  }, [load]);

  const cashFlowSeries = useMemo(() => {
    const heat = dash?.revenueHeat ?? [];
    if (heat.length > 0) {
      let running = 0;
      return heat.map((h, i) => {
        running += h.revenue;
        return {
          name: h.corridor.slice(0, 12) || `C${i + 1}`,
          flujo: Math.round(running / 1_000_000),
          ingreso: Math.round(h.revenue / 1_000_000),
        };
      });
    }
    const atRisk = Math.round((dash?.cashFlow?.atRiskAmount ?? 0) / 1_000_000);
    const base = Math.round((dash?.pillars?.liquidity.valueCop ?? 0) / 1_000_000);
    return [
      { name: "T-4", flujo: Math.max(0, base - atRisk * 0.4), ingreso: base * 0.2 },
      { name: "T-3", flujo: Math.max(0, base - atRisk * 0.25), ingreso: base * 0.22 },
      { name: "T-2", flujo: Math.max(0, base - atRisk * 0.1), ingreso: base * 0.24 },
      { name: "T-1", flujo: base, ingreso: base * 0.26 },
      { name: "Hoy", flujo: Math.max(0, base - atRisk * 0.05), ingreso: base * 0.28 },
    ];
  }, [dash]);

  const heatBars = useMemo(() => {
    return (dash?.revenueHeat ?? []).map((h) => ({
      corridor: h.corridor,
      heat: h.heat,
      revenue: h.revenue,
      trips: h.trips,
    }));
  }, [dash]);

  async function askJarvis() {
    setBusy(true);
    setListening(true);
    setJarvisOut(null);
    try {
      const res = await api<{ spokenSummary: string; message: string }>(
        "/api/v1/presidencia/jarvis/voice-query",
        {
          method: "POST",
          body: JSON.stringify({
            utterance,
            alertDirectors: true,
          }),
        },
      );
      setJarvisOut(res.spokenSummary || res.message);
    } catch (e) {
      setError((e as Error).message || "Asistente sin conexión");
    } finally {
      setBusy(false);
      setTimeout(() => setListening(false), 1200);
    }
  }

  async function simularCapex() {
    setBusy(true);
    setCapexOut(null);
    try {
      const res = await api<{ message: string }>(
        "/api/v1/presidencia/capex/simular",
        {
          method: "POST",
          body: JSON.stringify({
            unitsToAcquire: units,
            unitCostCop: unitCost,
            horizonMonths: 36,
          }),
        },
      );
      setCapexOut(res.message);
    } catch (e) {
      setError((e as Error).message || "Simulación de inversión fallida");
    } finally {
      setBusy(false);
    }
  }

  async function exportForensic() {
    setBusy(true);
    setError(null);
    try {
      const data = await api<{
        exportedAt: string;
        count: number;
        rows: unknown[];
      }>("/api/v1/presidencia/forensic-export");
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `auditoria-forense-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message || "Export forense fallida");
    } finally {
      setBusy(false);
    }
  }

  async function activarDefcon() {
    setBusy(true);
    setDefconOut(null);
    try {
      const res = await api<{
        message: string;
        notified: { drivers: number; customers: number; parents: number };
      }>("/api/v1/presidencia/defcon/activar", {
        method: "POST",
        body: JSON.stringify({
          defconLevel: 2,
          conflictZones: zones
            .split(",")
            .map((z) => z.trim())
            .filter(Boolean),
          notifyDrivers: true,
          notifyCustomers: true,
          notifyParents: true,
          openWarRoom: true,
        }),
      });
      setDefconActive(true);
      setDefconOut(
        `${res.message} · conductores ${res.notified.drivers} · clientes ${res.notified.customers} · padres ${res.notified.parents}`,
      );
      setDefconOpen(false);
    } catch (e) {
      setError((e as Error).message || "Protocolo de crisis no activado");
    } finally {
      setBusy(false);
    }
  }

  const p = dash?.pillars;

  const fleetDonut = useMemo(() => {
    const f = dash?.fleetHealth;
    if (!f) return [];
    return [
      { name: "En ruta", value: f.enRuta, color: "#10B981" },
      { name: "En patio", value: f.enPatio, color: "#64748B" },
      { name: "En taller", value: f.enTaller, color: "#FF2A5F" },
    ].filter((d) => d.value > 0);
  }, [dash?.fleetHealth]);

  const burnRateSeries = dash?.cashFlowHistory?.length
    ? dash.cashFlowHistory
    : cashFlowSeries.map((d) => ({
        mes: d.name,
        ingresos: d.ingreso,
        costos: Math.max(0, d.flujo - d.ingreso),
      }));

  return (
    <div
      className={`fade-in relative mx-auto min-h-[100dvh] max-w-[1400px] space-y-5 p-4 md:p-6 ${
        defconActive
          ? "bg-[#1a0508] text-[#F8FAFC]"
          : "bg-[#F4F6F9] text-[#0F172A] dark:bg-[#0A0D14] dark:text-[#F8FAFC]"
      }`}
    >
      {defconActive ? (
        <div className="pointer-events-none fixed inset-0 z-0 animate-pulse bg-[#FF2A5F]/15" />
      ) : null}

      <header className="relative z-10 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">
            Lienzo de presidencia
          </h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge tone={defconActive ? "rose" : "emerald"}>
              {defconActive ? "Alerta máxima · Sala de crisis" : "Nominal"}
            </Badge>
            <Badge tone="amber">
              Bloqueo operativo {dash?.killSwitch?.blockedPct ?? 0}%
            </Badge>
          </div>
        </div>
        <div className="flex w-auto flex-wrap justify-end gap-2">
          <Link href="/gerencia/dashboard">
            <Button type="button" variant="secondary" className="w-auto px-4 py-2">
              <Gavel className="mr-1.5 inline h-4 w-4" aria-hidden />
              Excepciones margen
              {(dash?.pendingMarginExceptions ?? 0) > 0
                ? ` (${dash?.pendingMarginExceptions})`
                : ""}
            </Button>
          </Link>
          <Button
            type="button"
            variant="secondary"
            className="w-auto px-4 py-2"
            disabled={busy}
            onClick={() => void exportForensic()}
          >
            <FileSearch className="mr-1.5 inline h-4 w-4" aria-hidden />
            Auditoría forense
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="w-auto px-4 py-2"
            onClick={() => setCapexOpen(true)}
          >
            Simulador de inversión
          </Button>
          <Button
            type="button"
            variant="primary"
            className="w-auto px-4 py-2 !bg-[#FF2A5F] !text-white"
            onClick={() => setDefconOpen(true)}
          >
            Protocolo de crisis
          </Button>
        </div>
      </header>

      {error ? (
        <p className="relative z-10 rounded-xl border border-[#DC2626]/40 bg-[#DC2626]/10 px-4 py-3 text-sm text-[#DC2626]">
          {error}
        </p>
      ) : null}

      <section className="relative z-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label={p?.growth?.label || "Crecimiento comercial"}
          value={p?.growth ? `${p.growth.valuePct >= 0 ? "+" : ""}${p.growth.valuePct}%` : "—"}
          delta={p?.growth?.hint}
          tone={(p?.growth?.valuePct ?? 0) >= 0 ? "ok" : "danger"}
          icon={<TrendingUp />}
        />
        <KpiCard
          label={p?.fleetAlerts?.label || "Alertas de flota"}
          value={p?.fleetAlerts?.immobilized ?? "—"}
          delta={p?.fleetAlerts?.hint}
          tone={(p?.fleetAlerts?.immobilized ?? 0) > 0 ? "danger" : "ok"}
          icon={<Truck />}
        />
        <KpiCard
          label={p?.margin?.label || "Margen operativo"}
          value={p?.margin ? `${p.margin.valuePct}%` : "—"}
          delta={p?.margin?.hint}
          tone="ok"
          icon={<Wallet />}
        />
        <KpiCard
          label={p?.compliance?.label || "Cumplimiento normativo"}
          value={p?.compliance ? `${p.compliance.valuePct}%` : "—"}
          delta={p?.compliance?.hint}
          tone={(p?.compliance?.valuePct ?? 100) < 95 ? "warn" : "ok"}
          icon={<ShieldAlert />}
        />
      </section>

      <section className="relative z-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label={p?.liquidity.label || "Caja Libre"}
          value={p ? cop(p.liquidity.valueCop) : "—"}
          delta={p?.liquidity.hint}
          tone="ok"
          icon={<Wallet />}
          spark={cashFlowSeries.map((d) => d.flujo)}
        />
        <KpiCard
          label={p?.sla.label || "Cumplimiento SLA"}
          value={p ? `${p.sla.valuePct}%` : "—"}
          delta={p?.sla.hint}
          tone={p && p.sla.valuePct < 90 ? "warn" : "ok"}
          icon={<Gauge />}
        />
        <KpiCard
          label={p?.legalPesv.label || "Riesgo Legal / PESV"}
          value={
            p ? `${p.legalPesv.level} · ${p.legalPesv.blockedUnits}` : "—"
          }
          delta={p?.legalPesv.hint}
          tone={p && p.legalPesv.blockedUnits > 0 ? "danger" : "ok"}
          icon={<ShieldAlert />}
        />
        <KpiCard
          label={p?.nps.label || "Satisfacción"}
          value={p ? String(p.nps.value) : "—"}
          delta={p ? `${p.nps.samples} muestras · ${p.nps.hint}` : undefined}
          tone="neutral"
          icon={<HeartPulse />}
        />
      </section>

      <div className="relative z-10 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-4">
          <div className="mb-3 flex items-center gap-2">
            <LineChartIcon className="h-4 w-4 text-emerald-500/70" aria-hidden />
            <h3 className="text-sm font-semibold text-slate-100">
              Burn rate · ingresos vs costos (M COP)
            </h3>
          </div>
          {burnRateSeries.length > 0 ? (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={burnRateSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis dataKey="mes" tick={{ fill: "#94A3B8", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} width={48} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--bg-surface-1)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="ingresos"
                    name="Ingresos"
                    stackId="1"
                    stroke="#10B981"
                    fill="#10B981"
                    fillOpacity={0.35}
                  />
                  <Area
                    type="monotone"
                    dataKey="costos"
                    name="Costos"
                    stackId="2"
                    stroke="#FF2A5F"
                    fill="#FF2A5F"
                    fillOpacity={0.25}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="Sin serie financiera" description="Sin datos de burn rate." />
          )}
        </section>

        <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-emerald-500/70" aria-hidden />
              <h3 className="text-sm font-semibold text-slate-100">
                Salud de flota
              </h3>
            </div>
            <Link
              href="/taller"
              className="text-xs font-semibold text-emerald-500 hover:underline"
            >
              Ir a taller →
            </Link>
          </div>
          {fleetDonut.length > 0 ? (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={fleetDonut}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={78}
                    paddingAngle={2}
                  >
                    {fleetDonut.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "var(--bg-surface-1)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="Sin flota indexada" description="Registre unidades en Taller." />
          )}
        </section>

        <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-4">
          <div className="mb-3 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-500/70" aria-hidden />
            <h3 className="text-sm font-semibold text-slate-100">
              Termómetro de cumplimiento
            </h3>
          </div>
          {(dash?.complianceAlerts?.length ?? 0) > 0 ? (
            <ul className="space-y-2">
              {dash!.complianceAlerts!.map((a, i) => (
                <li
                  key={`${a.source}-${i}`}
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    a.severity === "CRITICAL" || a.severity === "HIGH"
                      ? "border-[#FF2A5F]/40 bg-[#FF2A5F]/10 text-[#FECDD3]"
                      : "border-amber-500/30 bg-amber-500/10 text-amber-100"
                  }`}
                >
                  <span className="font-mono text-[10px] uppercase tracking-wider opacity-80">
                    {a.source}
                  </span>
                  <p className="mt-0.5 font-medium">{a.message}</p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="Sin alertas críticas"
              description="Normatividad al día en QHSE, SARLAFT y Trámites."
            />
          )}
        </section>

        <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-4">
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-500/70" aria-hidden />
            <h3 className="text-sm font-semibold text-slate-100">
              Pipeline comercial
            </h3>
          </div>
          {(dash?.commercialPipeline?.weeks?.length ?? 0) > 0 ? (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dash!.commercialPipeline!.weeks}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis dataKey="label" tick={{ fill: "#94A3B8", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} width={48} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--bg-surface-1)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Legend />
                  <Bar dataKey="cotizado" name="Cotizado" fill="#64748B" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="cerrado" name="Cerrado" fill="#10B981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              title="Sin pipeline comercial"
              description="Cotizaciones y contratos del mes aparecerán aquí."
            />
          )}
        </section>
      </div>

      <div className="relative z-10 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-4">
          <div className="mb-3 flex items-center gap-2">
            <LineChartIcon className="h-4 w-4 text-emerald-500/70" aria-hidden />
            <h3 className="text-sm font-semibold text-slate-100">
              Flujo de caja · M COP
            </h3>
          </div>
          {cashFlowSeries.length > 0 ? (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={cashFlowSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: "#94A3B8", fontSize: 11 }}
                    axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                  />
                  <YAxis
                    tick={{ fill: "#94A3B8", fontSize: 11 }}
                    axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                    width={48}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--bg-surface-1)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(v: number) => [`${v} M`, ""]}
                  />
                  <Line
                    type="monotone"
                    dataKey="flujo"
                    name="Acumulado"
                    stroke="#10B981"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#10B981" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="ingreso"
                    name="Ingreso"
                    stroke="#FFB800"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              title="Sin serie de flujo"
              description="Sin datos de corredores o flujo de caja."
            />
          )}
          {dash?.cashFlow?.atRiskAmount ? (
            <p className="mt-2 font-mono text-xs text-amber-400 tabular-nums">
              En riesgo: {cop(dash.cashFlow.atRiskAmount)}
            </p>
          ) : null}
        </section>

        <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-4">
          <div className="mb-3 flex items-center gap-2">
            <Flame className="h-4 w-4 text-amber-500/70" aria-hidden />
            <h3 className="text-sm font-semibold text-slate-100">
              Mapa de calor · corredores
            </h3>
          </div>
          {heatBars.length > 0 ? (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={heatBars} layout="vertical" margin={{ left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    tick={{ fill: "#94A3B8", fontSize: 11 }}
                    axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                  />
                  <YAxis
                    type="category"
                    dataKey="corridor"
                    width={88}
                    tick={{ fill: "#94A3B8", fontSize: 10 }}
                    axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--bg-surface-1)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(v: number, _n, item) => {
                      const row = item?.payload as {
                        revenue?: number;
                        trips?: number;
                      };
                      return [
                        `${v}% · ${cop(row?.revenue ?? 0)} · ${row?.trips ?? 0} viajes`,
                        "Calor",
                      ];
                    }}
                  />
                  <Bar dataKey="heat" name="Calor %" radius={[0, 4, 4, 0]}>
                    {heatBars.map((h, i) => (
                      <Cell
                        key={h.corridor}
                        fill={HEAT_COLORS[i % HEAT_COLORS.length]}
                        fillOpacity={Math.max(0.35, h.heat / 100)}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              title="Sin corredores de ingreso"
              description="Mapa cifrado vacío — sin datos de calor de ingresos."
            />
          )}
        </section>
      </div>

      <section
        id="jarvis"
        className="relative z-10 flex flex-col items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-6"
      >
        <div
          className={`relative mb-4 flex h-28 w-28 items-center justify-center rounded-full border-2 ${
            listening
              ? "animate-pulse border-[#0D9488] shadow-[0_0_40px_rgba(13,148,136,0.45)]"
              : "border-slate-700"
          }`}
        >
          <div
            className={`h-16 w-16 rounded-full bg-gradient-to-br from-[#0D9488] to-[#10B981] ${
              listening ? "absolute animate-ping opacity-40" : ""
            }`}
          />
          <span className="relative font-display text-sm text-white">Asistente</span>
        </div>
        <textarea
          className="field min-h-[72px] w-full max-w-xl"
          value={utterance}
          onChange={(e) => setUtterance(e.target.value)}
          aria-label="Comando del asistente"
        />
        <div className="mt-3 flex w-full max-w-xl justify-end">
          <Button
            type="button"
            variant="primary"
            className="w-auto !min-h-[40px] !px-6"
            disabled={busy}
            onClick={() => void askJarvis()}
          >
            Hablar con el asistente
          </Button>
        </div>
        {jarvisOut ? (
          <p className="mt-4 max-w-2xl text-center text-sm text-slate-300">
            {jarvisOut}
          </p>
        ) : null}
      </section>

      <Modal
        open={capexOpen}
        onClose={() => setCapexOpen(false)}
        title="Simulador de inversión"
        description="Compra de flota vs mapa de utilización"
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              className="w-auto px-4 py-2"
              onClick={() => setCapexOpen(false)}
            >
              Cerrar
            </Button>
            <Button
              type="button"
              variant="primary"
              className="w-auto px-4 py-2"
              disabled={busy}
              onClick={() => void simularCapex()}
            >
              Simular inversión
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-slate-400">
            Unidades
            <input
              type="number"
              className="field mt-1 w-full"
              value={units}
              onChange={(e) => setUnits(Number(e.target.value) || 1)}
            />
          </label>
          <label className="text-xs text-slate-400">
            Costo unitario COP
            <input
              type="number"
              className="field mt-1 w-full"
              value={unitCost}
              onChange={(e) => setUnitCost(Number(e.target.value) || 0)}
            />
          </label>
        </div>
        {capexOut ? (
          <p className="mt-4 text-sm text-slate-200">{capexOut}</p>
        ) : null}
      </Modal>

      <SlideOver
        open={defconOpen}
        onClose={() => setDefconOpen(false)}
        title="Protocolo de crisis"
        description="Protocolo de alerta máxima — sirena + aviso masivo + sala de crisis"
        footer={
          <Button
            type="button"
            variant="primary"
            className="w-auto px-4 py-2 !bg-[#FF2A5F] !text-white"
            disabled={busy}
            onClick={() => void activarDefcon()}
          >
            Activar alerta máxima
          </Button>
        }
      >
        <label className="block text-xs text-slate-400">
          Zonas de conflicto
          <input
            className="field mt-1 w-full"
            placeholder="Sur Bogotá, Soacha"
            value={zones}
            onChange={(e) => setZones(e.target.value)}
          />
        </label>
        {defconOut ? (
          <p className="mt-4 text-sm text-rose-300">{defconOut}</p>
        ) : null}
      </SlideOver>
    </div>
  );
}
