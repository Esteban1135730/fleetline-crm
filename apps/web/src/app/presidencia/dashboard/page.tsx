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
import { useThemeColors } from "@/lib/use-theme-colors";
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
  Legend,
} from "recharts";
import { api } from "@/lib/api";
import { CRISIS_ZONE_PRESETS } from "@fsg/shared";
import { EmptyState, KpiCard, Modal, SlideOver } from "@/components/audit";
import { BentoPanel } from "@/components/nexa/bento-panel";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { useShell } from "@/lib/shell-context";
import { useRouter } from "next/navigation";

type Pillars = {
  growth?: { label: string; valuePct: number | null; hint: string };
  fleetAlerts?: { label: string; immobilized: number; hint: string; href?: string };
  margin?: { label: string; valuePct: number | null; hint: string };
  compliance?: { label: string; valuePct: number | null; hint: string; href?: string };
  liquidity: { label: string; valueCop: number; hint: string; href?: string };
  sla: { label: string; valuePct: number; hint: string };
  legalPesv: { label: string; level: string; blockedUnits: number; hint: string };
  nps: {
    label: string;
    value: number | null;
    samples: number;
    display?: string;
    hint: string;
  };
};

type MarginRow = {
  tripId: string;
  code: string;
  customer: string;
  driver: string;
  fare: number;
  cost: number | null;
  costUnknown: boolean;
  marginPct: number | null;
  unbilledExtras: number;
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
    bloqueado?: number;
    pctRuta: number;
    pctPatio: number;
    pctTaller: number;
    pctBloqueado?: number;
  };
  complianceAlerts?: Array<{ source: string; message: string; severity: string }>;
  commercialPipeline?: {
    quotedCop: number;
    closedCop: number;
    hasData?: boolean;
    weeks: Array<{ label: string; cotizado: number; cerrado: number }>;
  };
  cashFlowHistory?: Array<{
    mes: string;
    yearMonth?: string;
    ingresos: number;
    costos: number;
    ingresosCop?: number;
    costosCop?: number;
  }>;
  cashFlowForecast?: {
    hasData?: boolean;
    weeks: Array<{
      name: string;
      ingreso: number;
      egreso: number;
      flujo: number;
    }>;
  };
  pendingMarginExceptions?: number;
  killSwitch?: { blockedPct: number; blockedUnits: number };
  cashFlow?: {
    atRiskAmount: number;
    receivableAtRiskAmount?: number;
    receivableAtRiskCount?: number;
  };
  opsStatus?: {
    opsStatus: "NOMINAL" | "CRITICAL";
    blockedVehicles: number;
    sarlaftBlocks: number;
    reason: string;
    href: string | null;
  };
};

type BurnMonthDetail = {
  yearMonth: string;
  mes: string;
  ingresosCop: number;
  costosCop: number;
  topCustomers: Array<{
    customerId: string | null;
    name: string;
    nit: string | null;
    amount: number;
  }>;
  topPurchaseOrders: Array<{
    id: string;
    code: string;
    description: string | null;
    supplier: string;
    amount: number;
    status: string;
  }>;
};

type CashBreakdown = {
  asOf: string;
  accounts: Array<{
    id: string;
    code: string;
    name: string;
    label: string;
    balance: number;
  }>;
  accountsTotal: number;
  upcomingPayments: Array<{
    id: string;
    counterparty: string;
    amount: number;
    dueDate: string | null;
    status: string;
    source?: "SCHEDULE" | "INVOICE";
    overdue?: boolean;
    invoiceNumber?: string;
  }>;
  upcomingPaymentsTotal: number;
  freeCash: number;
  formula: string;
};

type ArAtRisk = {
  asOf: string;
  invoices: Array<{
    id: string;
    number: string;
    customer: string;
    nit: string | null;
    amount: number;
    dueDate: string | null;
    status: string;
    daysOverdue: number;
  }>;
  count: number;
  total: number;
};

function cop(n: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

/** Colores NEXA para gráficas del lienzo (sin neón). */
const NEXA_CHART = {
  ingresos: "#00E5FF",
  costos: "#FF2A55",
  nominal: "#10B981",
  patio: "#64748B",
} as const;

export default function PresidenciaDashboardPage() {
  const colors = useThemeColors();
  const router = useRouter();
  const { crisisActive: defconActive, setCrisisActive } = useShell();
  const heatColors = useMemo(
    () => [
      colors.secondary,
      colors.success,
      colors.warning,
      colors.warning,
      colors.danger,
      colors.chartNeutral,
    ],
    [colors],
  );
  const chartTipStyle = useMemo(
    () => ({
      borderRadius: 12,
      border: `1px solid ${colors.border}`,
      background: colors.surface,
      color: colors.textPrimary,
      fontSize: 12,
    }),
    [colors],
  );

  const [dash, setDash] = useState<Dash | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [marginOpen, setMarginOpen] = useState(false);
  const [marginRows, setMarginRows] = useState<MarginRow[] | null>(null);
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
  const [unitCostDraft, setUnitCostDraft] = useState("280000000");
  const [zones, setZones] = useState<string[]>(["Sur Bogotá", "Soacha"]);
  const [zoneError, setZoneError] = useState("");
  const [capexOpen, setCapexOpen] = useState(false);
  const [defconOpen, setDefconOpen] = useState(false);
  const [cashOpen, setCashOpen] = useState(false);
  const [cashDetail, setCashDetail] = useState<CashBreakdown | null>(null);
  const [cashLoading, setCashLoading] = useState(false);
  const [arOpen, setArOpen] = useState(false);
  const [arDetail, setArDetail] = useState<ArAtRisk | null>(null);
  const [arLoading, setArLoading] = useState(false);
  const [burnOpen, setBurnOpen] = useState(false);
  const [burnDetail, setBurnDetail] = useState<BurnMonthDetail | null>(null);
  const [burnLoading, setBurnLoading] = useState(false);

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
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  const cashFlowSeries = useMemo(() => {
    const forecast = dash?.cashFlowForecast;
    if (!forecast?.hasData) return [];
    return forecast.weeks ?? [];
  }, [dash?.cashFlowForecast]);

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
        generatedAt?: string;
        exportedAt: string;
        windowHours?: number;
        sha256?: string;
        count: number;
        events?: unknown[];
        rows: unknown[];
        note?: string | null;
      }>("/api/v1/presidencia/forensic-export?hours=24");
      setNotice(data.count === 0 ? "Sin mutaciones en 24h" : "");
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
    if (zones.length < 1) {
      setZoneError("Seleccione al menos una zona de crisis");
      return;
    }
    setBusy(true);
    setDefconOut(null);
    setZoneError("");
    try {
      const res = await api<{
        message: string;
        session?: { code?: string };
        notified: { drivers: number; customers: number; parents: number };
      }>("/api/v1/presidencia/defcon/activar", {
        method: "POST",
        body: JSON.stringify({
          defconLevel: 2,
          conflictZones: zones,
          notifyDrivers: true,
          notifyCustomers: true,
          notifyParents: true,
          openWarRoom: true,
        }),
      });
      setCrisisActive(true, res.session?.code ?? null);
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

  async function desactivarDefcon() {
    setBusy(true);
    setDefconOut(null);
    setZoneError("");
    try {
      const res = await api<{ message: string; closed: number }>(
        "/api/v1/presidencia/defcon/desactivar",
        { method: "POST", body: "{}" },
      );
      setCrisisActive(false);
      setDefconOut(res.message || "Protocolo de crisis desactivado");
    } catch (e) {
      setError((e as Error).message || "No se pudo apagar el protocolo");
    } finally {
      setBusy(false);
    }
  }

  async function openMarginExceptions() {
    setMarginOpen(true);
    setMarginRows(null);
    try {
      const res = await api<{ rows: MarginRow[] }>(
        "/api/v1/presidencia/margin-exceptions?threshold=0.20",
      );
      setMarginRows(res.rows ?? []);
    } catch (e) {
      setMarginRows([]);
      setError((e as Error).message || "No se pudieron cargar las excepciones");
    }
  }

  function pctOrNa(value: number | null | undefined) {
    return value == null ? "N/A" : `${value}%`;
  }

  async function openCashDetail() {
    setCashOpen(true);
    setCashLoading(true);
    setCashDetail(null);
    try {
      setCashDetail(
        await api<CashBreakdown>("/api/v1/presidencia/cash-breakdown"),
      );
    } catch (e) {
      setError((e as Error).message || "No se pudo cargar el detalle de caja");
      setCashOpen(false);
    } finally {
      setCashLoading(false);
    }
  }

  async function openArDetail() {
    setArOpen(true);
    setArLoading(true);
    setArDetail(null);
    try {
      setArDetail(await api<ArAtRisk>("/api/v1/presidencia/ar-at-risk"));
    } catch (e) {
      setError((e as Error).message || "No se pudo cargar la cartera en riesgo");
      setArOpen(false);
    } finally {
      setArLoading(false);
    }
  }

  async function openBurnDetail(yearMonth: string) {
    setBurnOpen(true);
    setBurnLoading(true);
    setBurnDetail(null);
    try {
      setBurnDetail(
        await api<BurnMonthDetail>(
          `/api/v1/presidencia/burn-rate-detail?month=${encodeURIComponent(yearMonth)}`,
        ),
      );
    } catch (e) {
      setError((e as Error).message || "No se pudo cargar el detalle del mes");
      setBurnOpen(false);
    } finally {
      setBurnLoading(false);
    }
  }

  function toggleZone(zone: string) {
    setZoneError("");
    setZones((prev) =>
      prev.includes(zone) ? prev.filter((z) => z !== zone) : [...prev, zone],
    );
  }

  const p = dash?.pillars;

  const fleetDonut = useMemo(() => {
    const f = dash?.fleetHealth;
    if (!f) return [];
    return [
      { name: "En ruta", value: f.enRuta, color: NEXA_CHART.nominal, href: "/taller" },
      { name: "Patio", value: f.enPatio, color: NEXA_CHART.patio, href: "/taller" },
      { name: "Taller", value: f.enTaller, color: NEXA_CHART.costos, href: "/taller" },
      {
        name: "Bloqueado",
        value: f.bloqueado ?? 0,
        color: "#FF2A55",
        href: "/tramites",
      },
    ].filter((d) => d.value > 0);
  }, [dash?.fleetHealth]);

  const burnRateSeries = useMemo(() => {
    const rows = dash?.cashFlowHistory ?? [];
    if (!rows.some((r) => (r.ingresos ?? 0) > 0 || (r.costos ?? 0) > 0)) {
      return [];
    }
    return rows;
  }, [dash?.cashFlowHistory]);

  const pipelineWeeks = useMemo(() => {
    const weeks = dash?.commercialPipeline?.weeks ?? [];
    if (dash?.commercialPipeline?.hasData === false) return [];
    if (!weeks.some((w) => w.cotizado > 0 || w.cerrado > 0)) return [];
    return weeks;
  }, [dash?.commercialPipeline]);

  return (
    <div
      className={`fade-in relative mx-auto min-h-[100dvh] max-w-[1400px] space-y-5 ${
        defconActive
          ? "bg-brand-canvas text-brand-text-primary"
          : "bg-brand-canvas text-brand-text-primary dark:bg-brand-canvas dark:text-brand-text-primary"
      }`}
    >
      {defconActive ? (
        <div className="pointer-events-none fixed inset-0 z-0 animate-pulse bg-brand-danger/15" />
      ) : null}

      <header className="relative z-10 flex flex-wrap items-start justify-between gap-3 border-b border-brand-border pb-4">
        <div>
          <p className="font-data text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-primary">
            Presidencia
          </p>
          <h1 className="font-sans text-2xl font-semibold tracking-tight text-brand-text-primary md:text-3xl">
            Lienzo de presidencia
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {defconActive ? (
              <Badge tone="danger">Alerta máxima · Sala de crisis</Badge>
            ) : null}
            {(() => {
              const ops = dash?.opsStatus;
              const critical =
                (ops?.opsStatus ?? "NOMINAL") === "CRITICAL" ||
                (ops?.blockedVehicles ?? 0) + (ops?.sarlaftBlocks ?? 0) > 0;
              const total =
                (ops?.blockedVehicles ?? 0) + (ops?.sarlaftBlocks ?? 0);
              const href =
                ops?.href ||
                (ops && ops.blockedVehicles > 0
                  ? "/tramites"
                  : ops && ops.sarlaftBlocks > 0
                    ? "/sarlaft/bloqueos"
                    : null);
              const label = critical
                ? `BLOQUEO CRÍTICO · ${total}`
                : "NOMINAL";
              const className = critical
                ? "inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-data text-[11px] font-bold uppercase tracking-[0.12em] text-white"
                : "inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-data text-[11px] font-bold uppercase tracking-[0.12em] text-white";
              const style = {
                backgroundColor: critical ? "#FF2A55" : "#10B981",
              } as const;
              const title =
                ops?.reason ||
                (critical
                  ? "Hay bloqueos activos en flota o SARLAFT"
                  : "Sin bloqueos activos");
              if (href) {
                return (
                  <Link
                    href={href}
                    className={className}
                    style={style}
                    title={title}
                  >
                    {label}
                    {ops?.reason && critical ? (
                      <span className="ml-1 font-normal normal-case tracking-normal opacity-90">
                        · {ops.reason}
                      </span>
                    ) : null}
                  </Link>
                );
              }
              return (
                <span className={className} style={style} title={title}>
                  {label}
                </span>
              );
            })()}
          </div>
        </div>
        <div className="flex w-auto flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            className="w-auto px-4 py-2"
            onClick={() => void openMarginExceptions()}
          >
            <Gavel className="mr-1.5 inline h-4 w-4" aria-hidden />
            Excepciones margen
          </Button>
          <PermissionGuard capability="audit_forense:READ">
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
          </PermissionGuard>
          <PermissionGuard capability="capex_approve:CREATE">
            <Button
              type="button"
              variant="secondary"
              className="w-auto px-4 py-2"
              onClick={() => setCapexOpen(true)}
            >
              Simulador de inversión
            </Button>
          </PermissionGuard>
          <PermissionGuard capability="defcon_crisis:CREATE">
            <Button
              type="button"
              variant="primary"
              className="w-auto px-4 py-2 !bg-brand-danger !text-white"
              onClick={() => setDefconOpen(true)}
            >
              Protocolo de crisis
            </Button>
          </PermissionGuard>
        </div>
      </header>

      {error ? (
        <p className="relative z-10 rounded-xl border border-brand-danger/40 bg-brand-danger/10 px-4 py-3 text-sm text-brand-danger">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="relative z-10 rounded-xl border border-brand-border px-4 py-3 text-sm text-brand-text-secondary">
          {notice}
        </p>
      ) : null}

      <section className="relative z-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label={p?.growth?.label || "Crecimiento comercial"}
          value={
            p?.growth
              ? p.growth.valuePct == null
                ? "N/A"
                : `${p.growth.valuePct >= 0 ? "+" : ""}${p.growth.valuePct}%`
              : "—"
          }
          delta={p?.growth?.hint}
          tone={
            p?.growth?.valuePct == null
              ? "neutral"
              : p.growth.valuePct >= 0
                ? "ok"
                : "danger"
          }
          icon={<TrendingUp />}
        />
        <Link href={p?.fleetAlerts?.href || "/logistica"} className="block">
          <KpiCard
            label={p?.fleetAlerts?.label || "Alertas de flota"}
            value={p?.fleetAlerts?.immobilized ?? "—"}
            delta={p?.fleetAlerts?.hint}
            tone={(p?.fleetAlerts?.immobilized ?? 0) > 0 ? "danger" : "ok"}
            icon={<Truck />}
          />
        </Link>
        <KpiCard
          label={p?.margin?.label || "Margen operativo"}
          value={p?.margin ? pctOrNa(p.margin.valuePct) : "—"}
          delta={p?.margin?.hint}
          tone={p?.margin?.valuePct == null ? "neutral" : "ok"}
          icon={<Wallet />}
        />
        <Link href={p?.compliance?.href || "/tramites"} className="block">
          <KpiCard
            label={p?.compliance?.label || "Cumplimiento normativo"}
            value={p?.compliance ? pctOrNa(p.compliance.valuePct) : "—"}
            delta={p?.compliance?.hint}
            tone={
              (p?.compliance?.valuePct ?? 100) < 95 ? "warn" : "ok"
            }
            icon={<ShieldAlert />}
          />
        </Link>
      </section>

      <section className="relative z-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label={p?.liquidity.label || "Caja Libre"}
          value={p ? cop(p.liquidity.valueCop) : "—"}
          delta={p?.liquidity.hint || "Clic para ver cuentas y pagos"}
          tone={p && p.liquidity.valueCop < 0 ? "danger" : "ok"}
          icon={<Wallet />}
          spark={burnRateSeries.map((d) => d.ingresos)}
          tip="Saldos de caja/bancos menos pagos programados a 7 días"
          onClick={() => void openCashDetail()}
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
          value={p ? (p.nps.display ?? (p.nps.value == null ? "N/A" : String(p.nps.value))) : "—"}
          delta={
            p
              ? p.nps.samples === 0
                ? "Sin encuestas"
                : `${p.nps.samples} muestras · ${p.nps.hint}`
              : undefined
          }
          tone="neutral"
          icon={<HeartPulse />}
        />
      </section>

      <div className="relative z-10 grid grid-cols-1 gap-3 lg:grid-cols-12 lg:gap-4">
        <BentoPanel
          title="Burn rate · ingresos vs costos"
          subtitle="M COP · clic en mes para detalle"
          icon={<LineChartIcon />}
          className="lg:col-span-7"
          action={
            <Link
              href="/tesoreria"
              className="font-data text-[10px] font-semibold uppercase tracking-wider text-brand-primary hover:underline"
            >
              Ir a tesorería →
            </Link>
          }
        >
          {burnRateSeries.length > 0 ? (
            <div className="h-56 w-full cursor-pointer">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={burnRateSeries}
                  onClick={(state) => {
                    const ym = (
                      state?.activePayload?.[0]?.payload as {
                        yearMonth?: string;
                      }
                    )?.yearMonth;
                    if (ym) void openBurnDetail(ym);
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={colors.chartGrid} />
                  <XAxis dataKey="mes" tick={{ fill: colors.textSecondary, fontSize: 11 }} />
                  <YAxis tick={{ fill: colors.textSecondary, fontSize: 11 }} width={48} />
                  <Tooltip contentStyle={chartTipStyle} />
                  <Legend />
                  <Bar
                    dataKey="ingresos"
                    name="Ingresos"
                    fill={NEXA_CHART.ingresos}
                    radius={[4, 4, 0, 0]}
                    cursor="pointer"
                  />
                  <Bar
                    dataKey="costos"
                    name="Costos"
                    fill={NEXA_CHART.costos}
                    radius={[4, 4, 0, 0]}
                    cursor="pointer"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              title="Sin serie financiera"
              description="Sin viajes completados ni órdenes de compra en los últimos meses."
            />
          )}
        </BentoPanel>

        <BentoPanel
          title="Salud de flota"
          subtitle="En ruta · patio · taller · bloqueado"
          icon={<Truck />}
          className="lg:col-span-5"
          action={
            <Link
              href="/taller"
              className="font-data text-[10px] font-semibold uppercase tracking-wider text-brand-primary hover:underline"
            >
              Ir a taller →
            </Link>
          }
        >
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
                    cursor="pointer"
                    onClick={(_, index) => {
                      const seg = fleetDonut[index];
                      if (seg?.href) router.push(seg.href);
                    }}
                  >
                    {fleetDonut.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={chartTipStyle} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="Sin flota indexada" description="Registre unidades en Taller." />
          )}
        </BentoPanel>

        <BentoPanel
          title="Termómetro de cumplimiento"
          subtitle="QHSE · SARLAFT · trámites"
          icon={<ShieldAlert />}
          className="lg:col-span-4"
        >
          {(dash?.complianceAlerts?.length ?? 0) > 0 ? (
            <ul className="space-y-2">
              {dash!.complianceAlerts!.map((a, i) => (
                <li
                  key={`${a.source}-${i}`}
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    a.severity === "CRITICAL" || a.severity === "HIGH"
                      ? "border-brand-danger/40 bg-brand-danger/10 text-brand-danger"
                      : "border-brand-warning/30 bg-brand-warning/10 text-brand-on-warning"
                  }`}
                >
                  <span className="font-data text-[10px] uppercase tracking-wider opacity-80">
                    {a.source}
                  </span>
                  <p className="mt-0.5 font-sans font-medium">{a.message}</p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="Sin alertas críticas"
              description="Normatividad al día en QHSE, SARLAFT y Trámites."
            />
          )}
        </BentoPanel>

        <BentoPanel
          title="Pipeline comercial"
          subtitle="Cotizado vs ganado · M COP / semana"
          icon={<TrendingUp />}
          className="lg:col-span-8"
          action={
            <Link
              href="/comercial"
              className="font-data text-[10px] font-semibold uppercase tracking-wider text-brand-primary hover:underline"
            >
              Ir a comercial →
            </Link>
          }
        >
          {pipelineWeeks.length > 0 ? (
            <div
              className="h-56 w-full cursor-pointer"
              onClick={() => router.push("/comercial")}
              onKeyDown={(e) => {
                if (e.key === "Enter") router.push("/comercial");
              }}
              role="link"
              tabIndex={0}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pipelineWeeks}>
                  <CartesianGrid strokeDasharray="3 3" stroke={colors.chartGrid} />
                  <XAxis dataKey="label" tick={{ fill: colors.textSecondary, fontSize: 11 }} />
                  <YAxis tick={{ fill: colors.textSecondary, fontSize: 11 }} width={48} />
                  <Tooltip contentStyle={chartTipStyle} />
                  <Legend />
                  <Bar
                    dataKey="cotizado"
                    name="Cotizado"
                    fill={NEXA_CHART.ingresos}
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="cerrado"
                    name="Ganado"
                    fill={NEXA_CHART.nominal}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              title="Sin pipeline comercial"
              description="Oportunidades y cierres de las últimas semanas aparecerán aquí."
            />
          )}
        </BentoPanel>

        <BentoPanel
          title="Flujo de caja"
          subtitle="M COP · CxC / CxP por semana"
          icon={<LineChartIcon />}
          className="lg:col-span-6"
          action={
            <Link
              href="/tesoreria"
              className="font-data text-[10px] font-semibold uppercase tracking-wider text-brand-primary hover:underline"
            >
              Ir a tesorería →
            </Link>
          }
        >
          {cashFlowSeries.length > 0 ? (
            <div
              className="h-56 w-full cursor-pointer"
              onClick={() => router.push("/tesoreria")}
              onKeyDown={(e) => {
                if (e.key === "Enter") router.push("/tesoreria");
              }}
              role="link"
              tabIndex={0}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={cashFlowSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke={colors.chartGrid} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: colors.textSecondary, fontSize: 11 }}
                    axisLine={{ stroke: colors.border }}
                  />
                  <YAxis
                    tick={{ fill: colors.textSecondary, fontSize: 11 }}
                    axisLine={{ stroke: colors.border }}
                    width={48}
                  />
                  <Tooltip
                    contentStyle={chartTipStyle}
                    formatter={(v: number) => [`${v} M`, ""]}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="flujo"
                    name="Neto"
                    stroke={NEXA_CHART.nominal}
                    strokeWidth={2}
                    dot={{ r: 3, fill: NEXA_CHART.nominal }}
                  />
                  <Line
                    type="monotone"
                    dataKey="ingreso"
                    name="CxC"
                    stroke={NEXA_CHART.ingresos}
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="egreso"
                    name="CxP"
                    stroke={NEXA_CHART.costos}
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              title="Sin datos de flujo"
              description="No hay facturas CxC/CxP con vencimiento en las próximas semanas."
            />
          )}
          {(dash?.cashFlow?.receivableAtRiskAmount ?? 0) > 0 ? (
            <button
              type="button"
              onClick={() => void openArDetail()}
              className="mt-3 inline-flex w-auto items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--brand-warning)_55%,transparent)] bg-[color-mix(in_srgb,var(--brand-warning)_18%,transparent)] px-4 py-2.5 font-data text-xs font-semibold tabular-nums text-brand-warning shadow-[0_0_0_1px_color-mix(in_srgb,var(--brand-warning)_20%,transparent)] transition hover:bg-[color-mix(in_srgb,var(--brand-warning)_28%,transparent)] hover:border-[color-mix(in_srgb,var(--brand-warning)_70%,transparent)]"
            >
              Cartera en riesgo ·{" "}
              {cop(dash?.cashFlow?.receivableAtRiskAmount ?? 0)}
              {(dash?.cashFlow?.receivableAtRiskCount ?? 0) > 0
                ? ` · ${dash?.cashFlow?.receivableAtRiskCount} factura(s)`
                : ""}
              <span className="ml-1 opacity-90">Ver detalle →</span>
            </button>
          ) : (
            <Button
              type="button"
              variant="secondary"
              className="mt-3 w-auto px-4 py-2 text-xs"
              onClick={() => void openArDetail()}
            >
              Cartera en riesgo · sin mora · Ver detalle →
            </Button>
          )}
        </BentoPanel>

        <BentoPanel
          title="Mapa de calor"
          subtitle="Corredores de ingreso"
          icon={<Flame />}
          className="lg:col-span-6"
        >
          {heatBars.length > 0 ? (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={heatBars} layout="vertical" margin={{ left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={colors.chartGrid} />
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    tick={{ fill: colors.textSecondary, fontSize: 11 }}
                    axisLine={{ stroke: colors.border }}
                  />
                  <YAxis
                    type="category"
                    dataKey="corridor"
                    width={88}
                    tick={{ fill: colors.textSecondary, fontSize: 10 }}
                    axisLine={{ stroke: colors.border }}
                  />
                  <Tooltip
                    contentStyle={chartTipStyle}
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
                        fill={heatColors[i % heatColors.length]}
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
        </BentoPanel>
      </div>

      <BentoPanel
        id="jarvis"
        title="Asistente directivo"
        subtitle="Briefing por voz · solo lectura operativa"
        className="relative z-10"
      >
        <div className="flex flex-col items-center">
          <div
            className={`relative mb-4 flex h-28 w-28 items-center justify-center rounded-full border-2 ${
              listening
                ? "animate-pulse border-brand-secondary shadow-[0_0_40px_var(--brand-primary-glow)]"
                : "border-brand-border"
            }`}
          >
            <div
              className={`h-16 w-16 rounded-full bg-gradient-to-br from-brand-secondary to-brand-success ${
                listening ? "absolute animate-ping opacity-40" : ""
              }`}
            />
            <span className="relative font-sans text-sm text-brand-text-primary">Asistente</span>
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
            <p className="mt-4 max-w-2xl text-center font-sans text-sm text-brand-text-secondary">
              {jarvisOut}
            </p>
          ) : null}
        </div>
      </BentoPanel>

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
          <label className="text-xs text-brand-text-secondary">
            Unidades
            <input
              type="number"
              className="field mt-1 w-full"
              value={units}
              onChange={(e) => setUnits(Number(e.target.value) || 1)}
            />
          </label>
          <label className="text-xs text-brand-text-secondary">
            Costo unitario COP
            <input
              type="text"
              inputMode="numeric"
              className="field mt-1 w-full font-data"
              value={unitCostDraft}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "");
                if (digits === "") {
                  setUnitCostDraft("");
                  setUnitCost(0);
                  return;
                }
                // Evita "025" al partir de 0: el primer dígito útil reemplaza el cero
                const normalized = digits.replace(/^0+(?=\d)/, "");
                setUnitCostDraft(normalized);
                setUnitCost(Number(normalized) || 0);
              }}
              onBlur={() => {
                if (unitCostDraft === "") {
                  setUnitCostDraft("0");
                  setUnitCost(0);
                }
              }}
            />
          </label>
        </div>
        {capexOut ? (
          <p className="mt-4 text-sm text-brand-text-primary">{capexOut}</p>
        ) : null}
      </Modal>

      <SlideOver
        open={defconOpen}
        onClose={() => setDefconOpen(false)}
        title="Protocolo de crisis"
        description="Protocolo de alerta máxima — sirena + aviso masivo + sala de crisis"
        footer={
          <div className="flex w-full flex-wrap justify-end gap-2">
            {defconActive ? (
              <Button
                type="button"
                variant="secondary"
                className="w-auto px-4 py-2"
                disabled={busy}
                onClick={() => void desactivarDefcon()}
              >
                Apagar protocolo
              </Button>
            ) : null}
            <Button
              type="button"
              variant="primary"
              className="w-auto px-4 py-2 !bg-brand-danger !text-white"
              disabled={busy}
              onClick={() => void activarDefcon()}
            >
              Activar alerta máxima
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-text-secondary">
              Zonas de crisis
            </p>
            <p className="mt-1 text-xs leading-relaxed text-brand-text-secondary">
              Seleccione una o más zonas predefinidas donde aplica el protocolo
              (sirena a conductores y avisos a clientes/padres).
            </p>
          </div>
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-brand-border bg-brand-surface p-2">
            {CRISIS_ZONE_PRESETS.map((zone) => {
              const checked = zones.includes(zone);
              return (
                <label
                  key={zone}
                  className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition ${
                    checked
                      ? "bg-[color-mix(in_srgb,var(--brand-danger)_12%,transparent)] text-brand-text-primary"
                      : "text-brand-text-secondary hover:bg-brand-surface-elevated"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="accent-[var(--brand-danger)]"
                    checked={checked}
                    onChange={() => toggleZone(zone)}
                  />
                  <span>{zone}</span>
                </label>
              );
            })}
          </div>
          {zones.length > 0 ? (
            <p className="font-data text-[11px] text-brand-text-secondary">
              Seleccionadas ({zones.length}): {zones.join(" · ")}
            </p>
          ) : null}
          {zoneError ? (
            <p role="alert" className="text-sm text-brand-danger">
              {zoneError}
            </p>
          ) : null}
        </div>
        {defconOut ? (
          <p className="mt-4 text-sm text-brand-danger">{defconOut}</p>
        ) : null}
      </SlideOver>

      <SlideOver
        open={marginOpen}
        onClose={() => setMarginOpen(false)}
        title="Fugas de rentabilidad"
        description="Viajes completados del mes con margen bajo 20%. Umbral fijo, sin modelo predictivo."
        widthClass="max-w-xl"
      >
        {marginRows == null ? (
          <p className="font-data text-xs text-brand-text-secondary">Cargando…</p>
        ) : marginRows.length === 0 ? (
          <EmptyState
            title="Sin excepciones bajo 20%"
            description="Ningún viaje completado del mes quedó bajo el umbral."
          />
        ) : (
          <ul className="space-y-2">
            {marginRows.map((row) => (
              <li
                key={row.tripId}
                className="rounded-lg border border-brand-border px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-data text-xs text-brand-primary">{row.code}</p>
                  <p className="font-data text-sm tabular-nums text-brand-text-primary">
                    {row.costUnknown ? "Costo desconocido" : pctOrNa(row.marginPct)}
                  </p>
                </div>
                <p className="mt-1 text-sm text-brand-text-primary">
                  {row.customer} · {row.driver}
                </p>
                <p className="mt-1 font-data text-[11px] tabular-nums text-brand-text-secondary">
                  Tarifa {cop(row.fare)}
                  {row.cost != null ? ` · costo ${cop(row.cost)}` : ""}
                  {row.unbilledExtras > 0
                    ? ` · extras ${cop(row.unbilledExtras)}`
                    : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </SlideOver>

      <SlideOver
        open={cashOpen}
        onClose={() => setCashOpen(false)}
        title="Detalle · Caja Libre"
        description={
          cashDetail?.formula ||
          "Saldos de caja/bancos menos pagos programados (7 días)"
        }
        widthClass="max-w-xl"
      >
        {cashLoading ? (
          <p className="text-sm text-brand-text-secondary">Cargando…</p>
        ) : cashDetail ? (
          <div className="space-y-5">
            <div className="rounded-lg border border-brand-border bg-brand-surface p-3">
              <p className="font-data text-[11px] uppercase tracking-wide text-brand-text-secondary">
                Caja Libre
              </p>
              <p className="mt-1 font-data text-2xl font-bold tabular-nums text-brand-primary">
                {cop(cashDetail.freeCash)}
              </p>
              <p className="mt-1 text-xs text-brand-text-secondary">
                Cuentas {cop(cashDetail.accountsTotal)} − CxP{" "}
                {cop(cashDetail.upcomingPaymentsTotal)}
              </p>
              {dash?.pillars?.liquidity &&
              Math.round(dash.pillars.liquidity.valueCop) !==
                Math.round(cashDetail.freeCash) ? (
                <p className="mt-2 text-xs text-brand-warning">
                  KPI en lienzo: {cop(dash.pillars.liquidity.valueCop)} · el
                  detalle usa el cálculo al momento de abrir.
                </p>
              ) : null}
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-text-secondary">
                Cuentas
              </p>
              {cashDetail.accounts.length === 0 ? (
                <EmptyState
                  title="Sin cuentas de caja"
                  description="No hay cuentas PUC 11xx / caja / banco registradas."
                />
              ) : (
                <div className="overflow-x-auto rounded-lg border border-brand-border">
                  <table className="w-full min-w-[280px] text-left text-sm">
                    <thead className="bg-brand-surface-elevated font-data text-[10px] uppercase tracking-wide text-brand-text-secondary">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Cuenta</th>
                        <th className="px-3 py-2 text-right font-semibold">
                          Saldo
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {cashDetail.accounts.map((a) => (
                        <tr
                          key={a.id}
                          className="border-t border-brand-border"
                        >
                          <td className="px-3 py-2 text-brand-text-primary">
                            {a.label}
                          </td>
                          <td className="px-3 py-2 text-right font-data tabular-nums">
                            {cop(a.balance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-brand-border bg-brand-surface-elevated">
                        <td className="px-3 py-2 text-xs font-semibold">
                          Total cuentas
                        </td>
                        <td className="px-3 py-2 text-right font-data text-xs font-semibold tabular-nums">
                          {cop(cashDetail.accountsTotal)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-text-secondary">
                CxP · vencidas y próximos 7 días
              </p>
              {cashDetail.upcomingPayments.length === 0 ? (
                <EmptyState
                  title="Sin CxP en ventana"
                  description="No hay pagos en cola ni facturas por pagar vencidas o con vencimiento en 7 días."
                />
              ) : (
                <div className="overflow-x-auto rounded-lg border border-brand-border">
                  <table className="w-full min-w-[360px] text-left text-sm">
                    <thead className="bg-brand-surface-elevated font-data text-[10px] uppercase tracking-wide text-brand-text-secondary">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Contraparte</th>
                        <th className="px-3 py-2 text-right font-semibold">
                          Monto
                        </th>
                        <th className="px-3 py-2 font-semibold">Fecha</th>
                        <th className="px-3 py-2 font-semibold">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cashDetail.upcomingPayments.map((pmt) => (
                        <tr
                          key={`${pmt.source ?? "p"}-${pmt.id}`}
                          className="border-t border-brand-border"
                        >
                          <td className="px-3 py-2">
                            {pmt.counterparty}
                            {pmt.invoiceNumber ? (
                              <span className="mt-0.5 block font-data text-[10px] text-brand-text-secondary">
                                {pmt.invoiceNumber}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-right font-data tabular-nums">
                            {cop(pmt.amount)}
                          </td>
                          <td className="px-3 py-2 font-data text-xs text-brand-text-secondary">
                            {pmt.dueDate
                              ? new Date(pmt.dueDate).toLocaleDateString(
                                  "es-CO",
                                )
                              : "—"}
                          </td>
                          <td className="px-3 py-2">
                            {pmt.overdue ? (
                              <span className="font-data text-[10px] font-bold uppercase text-brand-danger">
                                Vencida
                              </span>
                            ) : (
                              <span className="font-data text-[10px] uppercase text-brand-text-secondary">
                                {pmt.status}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-brand-border bg-brand-surface-elevated">
                        <td className="px-3 py-2 text-xs font-semibold">
                          Total CxP
                        </td>
                        <td className="px-3 py-2 text-right font-data text-xs font-semibold tabular-nums">
                          {cop(cashDetail.upcomingPaymentsTotal)}
                        </td>
                        <td />
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          <EmptyState
            title="Sin datos"
            description="No se pudo obtener el desglose de caja."
          />
        )}
      </SlideOver>

      <SlideOver
        open={arOpen}
        onClose={() => setArOpen(false)}
        title="Cartera en riesgo"
        description="Facturas por cobrar (RECEIVABLE) vencidas"
        widthClass="max-w-xl"
        footer={
          <div className="flex w-full flex-wrap justify-end gap-2">
            <Link href="/tesoreria">
              <Button type="button" variant="secondary" className="w-auto px-4 py-2">
                Ir a Tesorería
              </Button>
            </Link>
          </div>
        }
      >
        {arLoading ? (
          <p className="text-sm text-brand-text-secondary">Cargando…</p>
        ) : arDetail && arDetail.invoices.length > 0 ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-brand-border bg-brand-surface p-3">
              <p className="font-data text-[11px] uppercase tracking-wide text-brand-text-secondary">
                Total en mora
              </p>
              <p className="mt-1 font-data text-2xl font-bold tabular-nums text-brand-warning">
                {cop(arDetail.total)}
              </p>
              <p className="mt-1 text-xs text-brand-text-secondary">
                {arDetail.count} factura(s) vencida(s)
              </p>
              {dash?.cashFlow?.receivableAtRiskAmount != null &&
              Math.round(dash.cashFlow.receivableAtRiskAmount) !==
                Math.round(arDetail.total) ? (
                <p className="mt-2 text-xs text-brand-warning">
                  KPI en lienzo: {cop(dash.cashFlow.receivableAtRiskAmount)} ·
                  el detalle se recalcula al abrir.
                </p>
              ) : null}
            </div>
            <div className="overflow-x-auto rounded-lg border border-brand-border">
              <table className="w-full min-w-[420px] text-left text-sm">
                <thead className="bg-brand-surface-elevated font-data text-[10px] uppercase tracking-wide text-brand-text-secondary">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Factura</th>
                    <th className="px-3 py-2 font-semibold">Cliente</th>
                    <th className="px-3 py-2 font-semibold">NIT</th>
                    <th className="px-3 py-2 text-right font-semibold">Monto</th>
                    <th className="px-3 py-2 text-right font-semibold">Mora</th>
                  </tr>
                </thead>
                <tbody>
                  {arDetail.invoices.map((inv) => (
                    <tr key={inv.id} className="border-t border-brand-border">
                      <td className="px-3 py-2 font-data text-xs">{inv.number}</td>
                      <td className="px-3 py-2">{inv.customer}</td>
                      <td className="px-3 py-2 font-data text-xs text-brand-text-secondary">
                        {inv.nit || "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-data tabular-nums">
                        {cop(inv.amount)}
                      </td>
                      <td className="px-3 py-2 text-right font-data tabular-nums text-brand-warning">
                        {inv.daysOverdue}d
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <EmptyState
            title="Sin facturas en mora"
            description="No hay CxC RECEIVABLE vencidas en este momento."
          />
        )}
      </SlideOver>

      <SlideOver
        open={burnOpen}
        onClose={() => setBurnOpen(false)}
        title={burnDetail ? `Burn rate · ${burnDetail.mes}` : "Burn rate · detalle"}
        description="Top clientes (viajes) y órdenes de compra del mes"
        widthClass="max-w-xl"
        footer={
          <div className="flex w-full flex-wrap justify-end gap-2">
            <Link href="/tesoreria">
              <Button type="button" variant="secondary" className="w-auto px-4 py-2">
                Ir a Tesorería
              </Button>
            </Link>
          </div>
        }
      >
        {burnLoading ? (
          <p className="text-sm text-brand-text-secondary">Cargando…</p>
        ) : burnDetail ? (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-brand-border bg-brand-surface p-3">
                <p className="font-data text-[10px] uppercase text-brand-text-secondary">
                  Ingresos
                </p>
                <p
                  className="mt-1 font-data text-lg font-bold tabular-nums"
                  style={{ color: NEXA_CHART.ingresos }}
                >
                  {cop(burnDetail.ingresosCop)}
                </p>
              </div>
              <div className="rounded-lg border border-brand-border bg-brand-surface p-3">
                <p className="font-data text-[10px] uppercase text-brand-text-secondary">
                  Costos OC
                </p>
                <p
                  className="mt-1 font-data text-lg font-bold tabular-nums"
                  style={{ color: NEXA_CHART.costos }}
                >
                  {cop(burnDetail.costosCop)}
                </p>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-text-secondary">
                Top 5 clientes
              </p>
              {burnDetail.topCustomers.length === 0 ? (
                <EmptyState
                  title="Sin viajes del mes"
                  description="No hay viajes COMPLETED con tarifa en este periodo."
                />
              ) : (
                <ul className="space-y-1.5">
                  {burnDetail.topCustomers.map((c) => (
                    <li
                      key={c.customerId || c.name}
                      className="flex items-center justify-between rounded-md border border-brand-border px-3 py-2 text-sm"
                    >
                      <span>
                        {c.name}
                        {c.nit ? (
                          <span className="ml-1 font-data text-[10px] text-brand-text-secondary">
                            {c.nit}
                          </span>
                        ) : null}
                      </span>
                      <span className="font-data tabular-nums">{cop(c.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-text-secondary">
                Top 5 órdenes de compra
              </p>
              {burnDetail.topPurchaseOrders.length === 0 ? (
                <EmptyState
                  title="Sin OC del mes"
                  description="No hay órdenes de compra (no canceladas) en este periodo."
                />
              ) : (
                <ul className="space-y-1.5">
                  {burnDetail.topPurchaseOrders.map((po) => (
                    <li
                      key={po.id}
                      className="flex items-center justify-between rounded-md border border-brand-border px-3 py-2 text-sm"
                    >
                      <span>
                        <span className="font-data text-xs">{po.code}</span>
                        <span className="mt-0.5 block text-brand-text-secondary">
                          {po.supplier}
                        </span>
                      </span>
                      <span className="font-data tabular-nums">{cop(po.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <EmptyState title="Sin detalle" description="Seleccione un mes en la gráfica." />
        )}
      </SlideOver>
    </div>
  );
}
