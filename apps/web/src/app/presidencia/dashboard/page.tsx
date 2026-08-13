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
} from "lucide-react";
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
} from "recharts";
import { api } from "@/lib/api";
import { EmptyState, KpiCard, Modal, SlideOver } from "@/components/audit";

type Pillars = {
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
      setError((e as Error).message || "Señal perdida — uplink Founder's Canvas");
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
      setError((e as Error).message || "Jarvis sin uplink");
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
      setError((e as Error).message || "Simulación CapEx fallida");
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
      setError((e as Error).message || "DEFCON no activado");
    } finally {
      setBusy(false);
    }
  }

  const p = dash?.pillars;

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
            The Founder&apos;s Canvas
          </h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge tone={defconActive ? "rose" : "emerald"}>
              {defconActive ? "DEFCON 2 · War Room" : "Nominal"}
            </Badge>
            <Badge tone="amber">
              Kill-Switch {dash?.killSwitch?.blockedPct ?? 0}%
            </Badge>
          </div>
        </div>
        <div className="flex w-auto flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            className="w-auto px-4 py-2"
            onClick={() => setCapexOpen(true)}
          >
            Simulador CapEx
          </Button>
          <Button
            type="button"
            variant="primary"
            className="w-auto px-4 py-2 !bg-[#FF2A5F] !text-white"
            onClick={() => setDefconOpen(true)}
          >
            DEFCON · Crisis
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
          label={p?.nps.label || "NPS"}
          value={p ? String(p.nps.value) : "—"}
          delta={p ? `${p.nps.samples} muestras · ${p.nps.hint}` : undefined}
          tone="neutral"
          icon={<HeartPulse />}
        />
      </section>

      <div className="relative z-10 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-800 bg-zinc-900/80 p-4">
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
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
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
                      background: "#121722",
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
              description="Uplink de corredores o cashFlow pendiente."
            />
          )}
          {dash?.cashFlow?.atRiskAmount ? (
            <p className="mt-2 font-mono text-xs text-amber-400 tabular-nums">
              En riesgo: {cop(dash.cashFlow.atRiskAmount)}
            </p>
          ) : null}
        </section>

        <section className="rounded-xl border border-slate-800 bg-zinc-900/80 p-4">
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
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
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
                      background: "#121722",
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
              description="Mapa cifrado vacío — sin uplink de revenueHeat."
            />
          )}
        </section>
      </div>

      <section
        id="jarvis"
        className="relative z-10 flex flex-col items-center rounded-xl border border-slate-800 bg-zinc-900/80 p-6"
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
          <span className="relative font-display text-sm text-white">Jarvis</span>
        </div>
        <textarea
          className="field min-h-[72px] w-full max-w-xl"
          value={utterance}
          onChange={(e) => setUtterance(e.target.value)}
          aria-label="Comando Jarvis"
        />
        <div className="mt-3 flex w-full max-w-xl justify-end">
          <Button
            type="button"
            variant="primary"
            className="w-auto !min-h-[40px] !px-6"
            disabled={busy}
            onClick={() => void askJarvis()}
          >
            Hablar con Jarvis
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
        title="Simulador CapEx"
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
        title="DEFCON · Crisis Master"
        description="Protocolo DEFCON 2 — sirena + blast masivo + War Room"
        footer={
          <Button
            type="button"
            variant="primary"
            className="w-auto px-4 py-2 !bg-[#FF2A5F] !text-white"
            disabled={busy}
            onClick={() => void activarDefcon()}
          >
            Activar DEFCON 2
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
