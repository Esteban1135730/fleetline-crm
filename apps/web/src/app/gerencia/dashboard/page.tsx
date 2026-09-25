"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import Link from "next/link";
import { Map, Wrench, Wallet, ShieldAlert, Clock } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { api, apiDownload } from "@/lib/api";
import { EmptyState, KpiCard, Modal, SlideOver } from "@/components/audit";
import { BentoPanel } from "@/components/nexa/bento-panel";
import { NexaTable, NexaRow, NexaCell } from "@/components/nexa/nexa-table";
import { StatusPulseBadge } from "@/components/audit/KpiCard";
import { useThemeColors } from "@/lib/use-theme-colors";

type AgingBucketId = "0-15" | "16-30" | "31-60" | "gt60";

type CxcAging = {
  asOf: string;
  totalCop: number;
  totalCount: number;
  buckets: Array<{
    id: AgingBucketId;
    label: string;
    amountCop: number;
    count: number;
  }>;
  note?: string;
};

type CxpDetail = {
  count: number;
  total: number;
  invoices: Array<{
    id: string;
    number: string;
    supplier: string;
    amount: number;
    dueDate: string | null;
    status: string;
    daysOverdue: number;
  }>;
};

type BlocksDetail = {
  count: number;
  vehicles: Array<{
    id: string;
    plate: string;
    label: string;
    status: string;
    reason: string;
  }>;
};

type WoDetail = {
  count: number;
  workOrders: Array<{
    id: string;
    code: string;
    status: string;
    ageDays: number;
    vehiclePlate: string;
    vehicleLabel: string;
  }>;
};

type CxcAgingDetail = {
  bucket: string;
  count: number;
  total: number;
  invoices: Array<{
    id: string;
    number: string;
    customer: string;
    amount: number;
    dueDate: string | null;
    status: string;
    daysOverdue: number;
    bucket: AgingBucketId;
  }>;
};

type DetailPanel =
  | { kind: "cxp" }
  | { kind: "blocks" }
  | { kind: "ot" }
  | { kind: "aging"; bucket: AgingBucketId; label: string };

type ShiftReport = {
  header: {
    organization: string;
    organizationNit: string;
    shiftDate: string;
    timezone: string;
    exportedBy: { name: string; email: string };
    exportedAt: string;
  };
  financial: {
    dayIncomeCop: number;
    dayIncomeCount: number;
    dayIncomeSource: string;
    approvalsSignedCount: number;
    approvalsSignedSumCop: number;
    bankBalanceCop: number;
    bankBalanceLabel: string;
  };
  operational: {
    tripsCount: number;
    slaLabel: string;
    qhseIncidentsCount: number;
    vehiclesToMaintenanceCount: number;
    vehiclesToMaintenance: Array<{ id: string; plate: string }>;
  };
  bottlenecks: {
    count: number;
    items: Array<{ area: string; severity: string; message: string }>;
    source: string;
  };
};

function bogotaDateYmd(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

type Approval = {
  id: string;
  code: string;
  kind: string;
  title: string;
  amountCop: number;
  cashflowImpactCop: number;
  originModule?: string;
  originType?: "PURCHASE_ORDER" | "INVOICE" | "EXECUTIVE_APPROVAL";
  originId?: string;
};

type CashImpact = {
  title: string;
  bankBalance: number;
  amount: number;
  balanceAfter: number;
  impactPct: number | null;
  payrollSafe: boolean;
};

type Override = {
  id: string;
  code: string;
  title: string;
  penaltyCostCop: number;
  vipNetGainCop: number;
};

type Scorecard = {
  crossKpis: {
    salesVsFleetMaintenance: Array<{ label: string; value: number }>;
  };
  bottlenecks: Array<{
    area: string;
    severity: string;
    title?: string;
    message: string;
    entityCode?: string;
    entityId?: string;
    href?: string;
    warRoomHint?: string;
  }>;
  riskRadar: {
    vipNps: number;
    vipLight: string;
    ministryAuditLight: string;
    message: string;
  };
  perspectives: {
    financial: { pendingApprovals: number };
    customer: { wonDeals: number; openDeals: number; vipNps: number };
    internalProcess: { tripsInFlight: number; openWorkOrders: number };
  };
};

type TacticalPanel = {
  period?: string;
  from?: string;
  to?: string;
  kpis: {
    tripsInFlight: number;
    tripsInFlightLive?: boolean;
    openWorkOrders: number;
    delayedWorkOrders: number;
    cxcOpen?: number;
    cxpOpen?: number;
    cxcOpenMillions: number;
    cxpOpenMillions: number;
    dispatchBlocks: number;
    dispatchBlocksBreakdown?: {
      vehicles: number;
      drivers: number;
      customers: number;
    };
  };
  hourlyActivity: Array<{ hora: string; viajes: number }>;
  fleetByType: Array<{
    tipo: string;
    operativo: number;
    taller: number;
    bloqueado: number;
  }>;
  cashAging: Array<{ rango: string; cxc: number; cxp: number }>;
  cashAgingSource?: "invoices" | "trip_fares";
  cxcAging?: CxcAging;
};

type Dash = {
  period?: string;
  scorecard: Scorecard;
  approvalsInbox: Approval[];
  pendingOverrides: Override[];
  commandDirectory: Array<{
    role: string;
    name: string;
    channel: string;
    video: string;
  }>;
  riskRadar: Scorecard["riskRadar"];
  tacticalPanel?: TacticalPanel;
};

function money(n: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

function lightTone(light: string): "success" | "warning" | "danger" | "info" {
  if (light === "GREEN") return "success";
  if (light === "AMBER") return "warning";
  if (light === "RED") return "danger";
  return "info";
}

function periodRangeIso(period: "day" | "week" | "month" | "year"): {
  from: string;
  to: string;
} {
  const to = new Date();
  const from = new Date(to);
  if (period === "day") {
    from.setHours(0, 0, 0, 0);
  } else if (period === "week") {
    from.setDate(from.getDate() - 7);
  } else if (period === "month") {
    from.setMonth(from.getMonth() - 1);
  } else {
    from.setFullYear(from.getFullYear() - 1);
  }
  return { from: from.toISOString(), to: to.toISOString() };
}

export default function GerenciaDashboardPage() {
  const colors = useThemeColors();
  const [dash, setDash] = useState<Dash | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [selectedApproval, setSelectedApproval] = useState("");
  const [impact, setImpact] = useState<CashImpact | null>(null);
  const [notifyNote, setNotifyNote] = useState("");

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

  const [period, setPeriod] = useState<"day" | "week" | "month" | "year">(
    "month",
  );

  const [detailPanel, setDetailPanel] = useState<DetailPanel | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [cxpDetail, setCxpDetail] = useState<CxpDetail | null>(null);
  const [blocksDetail, setBlocksDetail] = useState<BlocksDetail | null>(null);
  const [woDetail, setWoDetail] = useState<WoDetail | null>(null);
  const [agingDetail, setAgingDetail] = useState<CxcAgingDetail | null>(null);

  const [shiftOpen, setShiftOpen] = useState(false);
  const [shiftLoading, setShiftLoading] = useState(false);
  const [shiftError, setShiftError] = useState<string | null>(null);
  const [shiftReport, setShiftReport] = useState<ShiftReport | null>(null);
  const [shiftPdfBusy, setShiftPdfBusy] = useState(false);
  const shiftDate = useMemo(() => bogotaDateYmd(), []);

  const closeDetail = useCallback(() => {
    setDetailPanel(null);
    setDetailError(null);
  }, []);

  const openCxp = useCallback(async () => {
    setDetailPanel({ kind: "cxp" });
    setDetailLoading(true);
    setDetailError(null);
    setCxpDetail(null);
    try {
      const { from, to } = periodRangeIso(period);
      const data = await api.get<CxpDetail>(
        `/api/v1/gerencia/cxp-open?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      );
      setCxpDetail(data);
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : "No se pudo cargar CxP");
    } finally {
      setDetailLoading(false);
    }
  }, [period]);

  const openBlocks = useCallback(async () => {
    setDetailPanel({ kind: "blocks" });
    setDetailLoading(true);
    setDetailError(null);
    setBlocksDetail(null);
    try {
      const data = await api.get<BlocksDetail>(
        "/api/v1/gerencia/dispatch-blocks",
      );
      setBlocksDetail(data);
    } catch (e) {
      setDetailError(
        e instanceof Error ? e.message : "No se pudieron cargar bloqueos",
      );
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const openOt = useCallback(async () => {
    setDetailPanel({ kind: "ot" });
    setDetailLoading(true);
    setDetailError(null);
    setWoDetail(null);
    try {
      const { from, to } = periodRangeIso(period);
      const data = await api.get<WoDetail>(
        `/api/v1/gerencia/work-orders-open?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      );
      setWoDetail(data);
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : "No se pudieron cargar OT");
    } finally {
      setDetailLoading(false);
    }
  }, [period]);

  const openAging = useCallback(
    async (bucket: AgingBucketId, label: string) => {
      setDetailPanel({ kind: "aging", bucket, label });
      setDetailLoading(true);
      setDetailError(null);
      setAgingDetail(null);
      try {
        const data = await api.get<CxcAgingDetail>(
          `/api/v1/gerencia/cxc-aging?bucket=${encodeURIComponent(bucket)}`,
        );
        setAgingDetail(data);
      } catch (e) {
        setDetailError(
          e instanceof Error ? e.message : "No se pudo cargar aging CxC",
        );
      } finally {
        setDetailLoading(false);
      }
    },
    [],
  );

  const openShiftReport = useCallback(async () => {
    setShiftOpen(true);
    setShiftLoading(true);
    setShiftError(null);
    setShiftReport(null);
    try {
      const data = await api.get<ShiftReport>(
        `/api/v1/gerencia/shift-report?date=${encodeURIComponent(shiftDate)}`,
      );
      setShiftReport(data);
    } catch (e) {
      setShiftError(
        e instanceof Error ? e.message : "No se pudo cargar el reporte de turno",
      );
    } finally {
      setShiftLoading(false);
    }
  }, [shiftDate]);

  const downloadShiftPdf = useCallback(async () => {
    setShiftPdfBusy(true);
    setShiftError(null);
    try {
      await apiDownload(
        `/api/v1/gerencia/shift-report.pdf?date=${encodeURIComponent(shiftDate)}`,
        `reporte-turno-${shiftDate}.pdf`,
      );
    } catch (e) {
      setShiftError(
        e instanceof Error ? e.message : "No se pudo descargar el PDF",
      );
    } finally {
      setShiftPdfBusy(false);
    }
  }, [shiftDate]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { from, to } = periodRangeIso(period);
      const data = await api.get<Dash>(
        `/api/v1/gerencia/dashboard?period=${period}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      );
      setDash(data);
      setSelectedApproval((prev) => {
        if (prev && data.approvalsInbox.some((row) => row.id === prev)) return prev;
        return data.approvalsInbox[0]?.id ?? "";
      });
      setError(null);
    } catch (e) {
      setDash(null);
      setError(e instanceof Error ? e.message : "Conexión fallida");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!selectedApproval) {
      setImpact(null);
      return;
    }
    let cancelled = false;
    void api
      .get<CashImpact>(`/api/v1/gerencia/approvals/${selectedApproval}/impact`)
      .then((row) => {
        if (!cancelled) setImpact(row);
      })
      .catch(() => {
        if (!cancelled) setImpact(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedApproval]);

  async function firmar(approve = true) {
    if (!selectedApproval) {
      setError("Selecciona una aprobación");
      return;
    }
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const selected = dash?.approvalsInbox.find((row) => row.id === selectedApproval);
      const res = await api.post<{ status: string; message: string }>(
        "/api/v1/gerencia/aprobaciones/firmar-pin",
        {
          approvalId: selected?.originType === "EXECUTIVE_APPROVAL" ? selectedApproval : undefined,
          originType: selected?.originType,
          originId: selected?.originId ?? selectedApproval,
          pin: pin || undefined,
          approve,
        },
      );
      setMsg(`${res.status}: ${res.message}`);
      setPin("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Firma fallida — verifique PIN");
    } finally {
      setBusy(false);
    }
  }

  async function resolverOverride(overrideId: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.post<{ status: string; message: string }>(
        "/api/v1/gerencia/override-gerencial/resolver",
        {
          overrideId,
          autoPickOptimal: true,
          scenarios: [
            {
              id: "pay-penalty",
              label: "Pagar penalidad y cumplir VIP",
              penaltyCostCop: 2_000_000,
              vipNetGainCop: 8_500_000,
              itineraryPatch: { priority: "VIP", slot: "PM" },
            },
            {
              id: "cancel",
              label: "Cancelar servicio VIP",
              penaltyCostCop: 0,
              vipNetGainCop: 0,
            },
            {
              id: "reroute",
              label: "Reasignar itinerario",
              penaltyCostCop: 800_000,
              vipNetGainCop: 7_200_000,
              itineraryPatch: { reassign: true },
            },
          ],
        },
      );
      setMsg(`${res.status}: ${res.message}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Excepción fallida");
    } finally {
      setBusy(false);
    }
  }

  const salesBar =
    dash?.scorecard.crossKpis.salesVsFleetMaintenance[0]?.value ?? 0;
  const maintBar =
    dash?.scorecard.crossKpis.salesVsFleetMaintenance[1]?.value ?? 0;
  const maxBar = Math.max(salesBar, maintBar, 1);

  return (
    <div className="fade-in space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-border pb-4">
        <div>
          <p className="font-data text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-primary">
            Gerencia General
          </p>
          <h1 className="font-sans text-2xl font-semibold tracking-tight text-brand-text-primary md:text-3xl">
            Tablero táctico
          </h1>
          <p className="mt-1 font-sans text-sm text-brand-text-secondary">
            Centro de mando operativo · KPIs cruzados y bandeja de firmas
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ["day", "Día"],
              ["week", "Semana"],
              ["month", "Mes"],
              ["year", "Año"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              disabled={loading}
              className={`flt-nav-item !inline-flex !w-auto px-3 py-1.5 text-xs ${period === id ? "is-active" : ""}`}
              onClick={() => setPeriod(id)}
            >
              {label}
            </button>
          ))}
          <Button
            type="button"
            variant="ghost"
            className="w-auto px-4 py-2"
            onClick={() => void openShiftReport()}
          >
            <Clock className="mr-1.5 inline h-4 w-4" aria-hidden />
            Reporte de turno
          </Button>
        </div>
      </header>

      {error ? (
        <p className="rounded-lg border border-brand-danger/40 bg-brand-danger/10 px-4 py-3 font-data text-sm text-brand-danger">
          {error}
          <Button
            type="button"
            variant="secondary"
            className="ml-3 w-auto px-3 py-1 text-xs"
            onClick={() => void load()}
          >
            Reintentar
          </Button>
        </p>
      ) : null}
      {msg ? (
        <p className="rounded-lg border border-brand-primary/40 bg-brand-primary/10 px-4 py-3 font-data text-sm text-brand-primary">
          {msg}
        </p>
      ) : null}

      {loading && !dash?.tacticalPanel ? (
        <p className="font-data text-sm text-brand-text-secondary">
          Cargando tablero táctico…
        </p>
      ) : null}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Viajes en curso"
          value={
            !dash?.tacticalPanel
              ? "—"
              : dash.tacticalPanel.kpis.tripsInFlight
          }
          delta="En vivo · IN_TRANSIT"
          tip="Viajes actualmente en ruta (dato en vivo, no filtrado por período)"
          tone="ok"
          icon={<Map />}
        />
        <KpiCard
          label="OT abiertas (Taller)"
          value={
            !dash?.tacticalPanel
              ? "—"
              : dash.tacticalPanel.kpis.openWorkOrders
          }
          delta={
            !dash?.tacticalPanel
              ? undefined
              : dash.tacticalPanel.kpis.delayedWorkOrders > 0
                ? `${dash.tacticalPanel.kpis.delayedWorkOrders} con retraso · clic para detalle`
                : "Sin retrasos críticos · clic para detalle"
          }
          tip="Órdenes de trabajo abiertas en el período seleccionado"
          tone={
            (dash?.tacticalPanel?.kpis.delayedWorkOrders ?? 0) > 0
              ? "warn"
              : "neutral"
          }
          icon={<Wrench />}
          onClick={() => void openOt()}
        />
        <KpiCard
          label="CxP"
          value={
            !dash?.tacticalPanel
              ? "—"
              : money(
                  dash.tacticalPanel.kpis.cxpOpen ??
                    dash.tacticalPanel.kpis.cxpOpenMillions * 1_000_000,
                )
          }
          delta={
            !dash?.tacticalPanel
              ? undefined
              : `CxC ${money(
                  dash.tacticalPanel.kpis.cxcOpen ??
                    dash.tacticalPanel.kpis.cxcOpenMillions * 1_000_000,
                )} · clic: facturas por pagar`
          }
          tip="Facturas PAYABLE abiertas (ISSUED/OVERDUE) en el período — clic para detalle"
          tone="neutral"
          icon={<Wallet />}
          onClick={() => void openCxp()}
        />
        <KpiCard
          label="Bloqueos despacho"
          value={
            !dash?.tacticalPanel
              ? "—"
              : dash.tacticalPanel.kpis.dispatchBlocks
          }
          delta={
            dash?.tacticalPanel?.kpis.dispatchBlocksBreakdown
              ? `Flota ${dash.tacticalPanel.kpis.dispatchBlocksBreakdown.vehicles} · Cond. ${dash.tacticalPanel.kpis.dispatchBlocksBreakdown.drivers} · Cli. ${dash.tacticalPanel.kpis.dispatchBlocksBreakdown.customers}`
              : "Compliance · SARLAFT"
          }
          tip="Vehículos complianceBlocked + conductores/clientes SARLAFT — clic: placas y motivos"
          tone={
            (dash?.tacticalPanel?.kpis.dispatchBlocks ?? 0) > 0 ? "danger" : "ok"
          }
          icon={<ShieldAlert />}
          onClick={() => void openBlocks()}
        />
      </section>

      {!loading && !error && !dash?.tacticalPanel ? (
        <p className="rounded-lg border border-brand-border bg-brand-surface px-4 py-3 font-data text-sm text-brand-text-secondary">
          Sin datos tácticos para el período seleccionado.
        </p>
      ) : null}

      {dash?.tacticalPanel ? (
        <>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 lg:gap-4">
            <BentoPanel
              title="Picos de operación"
              subtitle="Viajes activos por franja"
              className="lg:col-span-6"
            >
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dash.tacticalPanel.hourlyActivity}>
                    <CartesianGrid strokeDasharray="3 3" stroke={colors.chartGrid} />
                    <XAxis
                      dataKey="hora"
                      tick={{ fill: colors.textSecondary, fontSize: 11 }}
                    />
                    <YAxis tick={{ fill: colors.textSecondary, fontSize: 11 }} width={32} />
                    <Tooltip contentStyle={chartTipStyle} />
                    <Bar
                      dataKey="viajes"
                      name="Viajes activos"
                      fill={colors.secondary}
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </BentoPanel>

            <BentoPanel
              title="Disponibilidad de flota"
              subtitle="Operativo · taller · bloqueado"
              className="lg:col-span-6"
            >
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dash.tacticalPanel.fleetByType}>
                    <CartesianGrid strokeDasharray="3 3" stroke={colors.chartGrid} />
                    <XAxis
                      dataKey="tipo"
                      tick={{ fill: colors.textSecondary, fontSize: 11 }}
                    />
                    <YAxis tick={{ fill: colors.textSecondary, fontSize: 11 }} width={32} />
                    <Tooltip contentStyle={chartTipStyle} />
                    <Legend />
                    <Bar dataKey="operativo" stackId="a" name="Operativo" fill={colors.success} />
                    <Bar dataKey="taller" stackId="a" name="Taller" fill={colors.warning} />
                    <Bar dataKey="bloqueado" stackId="a" name="Bloqueado" fill={colors.danger} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </BentoPanel>

            <BentoPanel
              title="Aging CxC"
              subtitle={
                dash.tacticalPanel.cxcAging
                  ? `${money(dash.tacticalPanel.cxcAging.totalCop)} · ${dash.tacticalPanel.cxcAging.totalCount} factura(s) abiertas`
                  : "RECEIVABLE no PAID · por vencimiento"
              }
              className="lg:col-span-6"
            >
              {dash.tacticalPanel.cxcAging?.buckets?.length ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {dash.tacticalPanel.cxcAging.buckets.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => void openAging(b.id, b.label)}
                        className="rounded-lg border border-brand-border bg-brand-canvas px-3 py-3 text-left transition-colors hover:border-brand-border-active hover:bg-brand-surface-hover"
                      >
                        <p className="font-data text-[10px] uppercase tracking-wider text-brand-text-secondary">
                          {b.label}
                        </p>
                        <p className="mt-1 font-data text-sm font-semibold tabular-nums text-brand-text-primary">
                          {money(b.amountCop)}
                        </p>
                        <p className="mt-0.5 font-data text-[10px] text-brand-text-secondary">
                          {b.count} factura{b.count === 1 ? "" : "s"}
                        </p>
                      </button>
                    ))}
                  </div>
                  {dash.tacticalPanel.cxcAging.note ? (
                    <p className="font-data text-[10px] text-brand-text-secondary">
                      {dash.tacticalPanel.cxcAging.note}
                    </p>
                  ) : null}
                </div>
              ) : (
                <EmptyState
                  title="Sin aging CxC"
                  description="No hay facturas por cobrar abiertas para agrupar por vencimiento."
                />
              )}
            </BentoPanel>

            <BentoPanel
              title="Cuellos de botella"
              className="lg:col-span-6"
            >
              {(dash.scorecard.bottlenecks ?? []).length > 0 ? (
                <ul className="space-y-2">
                  {dash.scorecard.bottlenecks.map((b) => (
                    <li
                      key={`${b.area}-${b.entityId ?? b.message}`}
                      className="rounded-lg border border-brand-border px-3 py-2"
                    >
                      <StatusPulseBadge
                        tone={b.severity === "RED" ? "danger" : "fatiga"}
                      >
                        {b.area}
                      </StatusPulseBadge>
                      <p className="mt-1 font-sans text-sm text-brand-text-primary">
                        {b.title || b.message}
                      </p>
                      <div className="mt-2 flex flex-wrap justify-end gap-2">
                        {b.href ? (
                          <Link href={b.href}>
                            <Button variant="secondary" className="w-auto px-3 py-1.5 text-xs">
                              Ir al módulo
                            </Button>
                          </Link>
                        ) : null}
                        <Button
                          variant="ghost"
                          className="w-auto px-3 py-1.5 text-xs"
                          onClick={() =>
                            void api
                              .post("/api/v1/gerencia/bottlenecks/notify", {
                                area: b.area,
                                entityId: b.entityId,
                                title: b.title || b.message,
                                href: b.href || "/gerencia/dashboard",
                              })
                              .then(() => setNotifyNote("Aviso registrado"))
                              .catch((e) =>
                                setError(
                                  e instanceof Error ? e.message : "No se pudo notificar",
                                ),
                              )
                          }
                        >
                          Notificar
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  title="Sin cuellos de botella"
                  description="Ninguna regla de 24 h, 2 h o 48 h está activa."
                />
              )}
              {notifyNote ? (
                <p className="mt-2 font-data text-xs text-brand-text-secondary">
                  {notifyNote}
                </p>
              ) : null}
            </BentoPanel>
          </div>
        </>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-12">
        <BentoPanel
          id="aprobaciones"
          title="Bandeja de aprobaciones"
          subtitle="Firma ejecutiva con PIN"
          className="lg:col-span-5"
        >
          <NexaTable columns={["Concepto", "Código", "Monto", "Origen"]}>
            {(dash?.approvalsInbox ?? []).map((a) => (
              <NexaRow
                key={a.id}
                active={selectedApproval === a.id}
                onClick={() => setSelectedApproval(a.id)}
              >
                <NexaCell>{a.title}</NexaCell>
                <NexaCell mono className="text-brand-text-secondary">
                  {a.code} · {a.kind}
                </NexaCell>
                <NexaCell mono className="text-brand-warning">
                  {money(a.amountCop)}
                </NexaCell>
                <NexaCell mono>{a.originModule || "GERENCIA"}</NexaCell>
              </NexaRow>
            ))}
          </NexaTable>
          {impact && selectedApproval ? (
            <p className="mt-3 font-data text-sm tabular-nums text-brand-text-primary">
              Saldo actual {money(impact.bankBalance)} → tras aprobación{" "}
              <span
                style={{ color: impact.balanceAfter < 0 ? "#FF2A55" : "#10B981" }}
              >
                {money(impact.balanceAfter)}
              </span>
              {impact.balanceAfter < 0 ? " · LIQUIDEZ NEGATIVA" : ""}
              {impact.impactPct != null ? ` · ${impact.impactPct}%` : ""}
            </p>
          ) : null}
          {(dash?.approvalsInbox ?? []).length === 0 ? (
            <p className="mt-3 font-data text-xs text-brand-text-secondary">
              Inbox vacío
            </p>
          ) : null}
          <label className="mt-4 block font-data text-[10px] uppercase tracking-[0.12em] text-brand-text-secondary">
            PIN de seguridad (6 dígitos)
            <span className="mt-1 block font-sans text-[11px] normal-case tracking-normal text-brand-text-secondary">
              Autoriza o rechaza la solicitud seleccionada. El PIN es personal
              del gerente (mismo de firma ejecutiva).
            </span>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              className="login-field mt-1 font-data tracking-widest"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••••"
            />
          </label>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Button
              disabled={busy}
              variant="ghost"
              onClick={() => void firmar(false)}
              className="w-auto px-4 py-2"
            >
              Rechazar
            </Button>
            <Button
              disabled={busy}
              onClick={() => void firmar(true)}
              className="w-auto px-4 py-2"
            >
              Firmar con PIN
            </Button>
          </div>
        </BentoPanel>

        <BentoPanel
          id="scorecard"
          title="KPIs cruzados"
          subtitle="Ventas vs mantenimiento de flota"
          className="lg:col-span-4"
        >
          <div className="space-y-3">
            {(dash?.scorecard.crossKpis.salesVsFleetMaintenance ?? []).map(
              (k) => (
                <div key={k.label}>
                  <div className="mb-1 flex justify-between font-data text-xs text-brand-text-secondary">
                    <span>{k.label}</span>
                    <span className="tabular-nums">{k.value}</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded bg-brand-canvas">
                    <div
                      className="h-full bg-brand-primary"
                      style={{ width: `${(k.value / maxBar) * 100}%` }}
                    />
                  </div>
                </div>
              ),
            )}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {[
              {
                label: "Viajes",
                value: dash?.scorecard.perspectives.internalProcess.tripsInFlight ?? 0,
                tone: "text-brand-text-primary",
              },
              {
                label: "OT Taller",
                value: dash?.scorecard.perspectives.internalProcess.openWorkOrders ?? 0,
                tone: "text-brand-warning",
              },
              {
                label: "Oport. abiertas",
                value: dash?.scorecard.perspectives.customer.openDeals ?? 0,
                tone: "text-brand-text-primary",
              },
              {
                label: "Ganados",
                value: dash?.scorecard.perspectives.customer.wonDeals ?? 0,
                tone: "text-brand-primary",
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-lg border border-brand-border bg-brand-canvas p-2 transition-colors hover:border-brand-border-active"
              >
                <p className="font-data text-[10px] uppercase tracking-wider text-brand-text-secondary">
                  {item.label}
                </p>
                <p className={`font-data text-lg tabular-nums ${item.tone}`}>
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        </BentoPanel>

        <BentoPanel
          title="Radar satisfacción y riesgo"
          className="lg:col-span-3"
        >
          <div className="space-y-3">
            <div className="rounded-lg border border-brand-border p-3">
              <p className="font-data text-[10px] uppercase tracking-wider text-brand-text-secondary">
                Satisfacción VIP
              </p>
              <p className="font-data text-2xl tabular-nums text-brand-text-primary">
                {dash?.riskRadar.vipNps ?? "—"}
              </p>
              <Badge tone={lightTone(dash?.riskRadar.vipLight ?? "")}>
                {dash?.riskRadar.vipLight ?? "—"}
              </Badge>
            </div>
            <div className="rounded-lg border border-brand-border p-3">
              <p className="font-data text-[10px] uppercase tracking-wider text-brand-text-secondary">
                Min. Transporte
              </p>
              <Badge tone={lightTone(dash?.riskRadar.ministryAuditLight ?? "")}>
                {dash?.riskRadar.ministryAuditLight ?? "—"}
              </Badge>
              <p className="mt-2 font-sans text-xs text-brand-text-secondary">
                {dash?.riskRadar.message}
              </p>
            </div>
          </div>
          <h3 className="mb-2 mt-4 font-data text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-text-secondary">
            Overrides pendientes
          </h3>
          <ul className="space-y-2">
            {(dash?.pendingOverrides ?? []).map((o) => (
              <li
                key={o.id}
                className="rounded-lg border border-brand-border bg-brand-canvas p-2 text-sm transition-colors hover:border-brand-border-active"
              >
                <p className="font-sans text-brand-text-primary">{o.title}</p>
                <p className="font-data text-[10px] text-brand-text-secondary">
                  {o.code}
                </p>
                <Button
                  disabled={busy}
                  className="mt-2 w-auto px-3 py-1.5 text-xs"
                  onClick={() => void resolverOverride(o.id)}
                >
                  Resolver óptimo
                </Button>
              </li>
            ))}
            {(dash?.pendingOverrides ?? []).length === 0 ? (
              <li className="font-data text-xs text-brand-text-secondary">
                Sin conflictos en cola
              </li>
            ) : null}
          </ul>
        </BentoPanel>
      </div>

      <BentoPanel
        id="comando"
        title="Directorio de comando"
        subtitle="Sala de crisis · canales ejecutivos"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(dash?.commandDirectory ?? []).map((d) => (
            <div
              key={d.role}
              className="rounded-lg border border-brand-border bg-brand-canvas p-3 transition-colors hover:border-brand-border-active hover:bg-brand-surface-hover"
            >
              <p className="font-sans text-sm text-brand-text-primary">{d.name}</p>
              <p className="font-data text-[10px] text-brand-text-secondary">
                {d.role}
              </p>
              <p className="mt-2 font-sans text-xs text-brand-primary">{d.channel}</p>
              <p className="font-data text-[11px] text-brand-text-secondary">
                {d.video}
              </p>
            </div>
          ))}
        </div>
      </BentoPanel>

      <Modal
        open={shiftOpen}
        onClose={() => setShiftOpen(false)}
        title="Reporte de turno"
        description={`Día ${shiftDate} · America/Bogota · sin IA`}
        size="lg"
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              className="w-auto px-4 py-2"
              onClick={() => setShiftOpen(false)}
            >
              Cerrar
            </Button>
            <Button
              type="button"
              variant="primary"
              className="w-auto px-4 py-2"
              disabled={shiftPdfBusy || shiftLoading || !shiftReport}
              onClick={() => void downloadShiftPdf()}
            >
              {shiftPdfBusy ? "Descargando…" : "Descargar PDF"}
            </Button>
          </>
        }
      >
        {shiftLoading ? (
          <p className="text-sm text-brand-text-secondary">Cargando reporte…</p>
        ) : shiftError && !shiftReport ? (
          <p className="text-sm text-brand-danger">{shiftError}</p>
        ) : shiftReport ? (
          <div className="space-y-5 text-sm">
            {shiftError ? (
              <p className="text-sm text-brand-danger">{shiftError}</p>
            ) : null}

            <section className="space-y-1">
              <h3 className="font-data text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-text-secondary">
                Encabezado
              </h3>
              <p className="text-brand-text-primary">
                {shiftReport.header.organization}
                {shiftReport.header.organizationNit
                  ? ` · NIT ${shiftReport.header.organizationNit}`
                  : ""}
              </p>
              <p className="font-data text-xs text-brand-text-secondary">
                Turno {shiftReport.header.shiftDate} · Exportó{" "}
                {shiftReport.header.exportedBy.name} ·{" "}
                {new Date(shiftReport.header.exportedAt).toLocaleString("es-CO")}
              </p>
            </section>

            <section className="space-y-2">
              <h3 className="font-data text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-text-secondary">
                Financiero
              </h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-brand-border bg-brand-canvas p-3">
                  <p className="font-data text-[10px] uppercase text-brand-text-secondary">
                    Ingresos del día
                  </p>
                  <p className="font-data text-lg tabular-nums text-brand-text-primary">
                    {money(shiftReport.financial.dayIncomeCop)}
                  </p>
                  <p className="mt-1 font-data text-[10px] text-brand-text-secondary">
                    {shiftReport.financial.dayIncomeCount} viaje(s) ·{" "}
                    {shiftReport.financial.dayIncomeSource}
                  </p>
                </div>
                <div className="rounded-lg border border-brand-border bg-brand-canvas p-3">
                  <p className="font-data text-[10px] uppercase text-brand-text-secondary">
                    Aprobaciones firmadas
                  </p>
                  <p className="font-data text-lg tabular-nums text-brand-text-primary">
                    {shiftReport.financial.approvalsSignedCount}
                  </p>
                  <p className="mt-1 font-data text-[10px] text-brand-text-secondary">
                    {money(shiftReport.financial.approvalsSignedSumCop)}
                  </p>
                </div>
                <div className="rounded-lg border border-brand-border bg-brand-canvas p-3">
                  <p className="font-data text-[10px] uppercase text-brand-text-secondary">
                    Saldo bancario
                  </p>
                  <p className="font-data text-lg tabular-nums text-brand-text-primary">
                    {money(shiftReport.financial.bankBalanceCop)}
                  </p>
                  <p className="mt-1 font-data text-[10px] text-brand-text-secondary">
                    {shiftReport.financial.bankBalanceLabel}
                  </p>
                </div>
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="font-data text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-text-secondary">
                Operativo
              </h3>
              <ul className="space-y-1 font-data text-xs text-brand-text-primary">
                <li>Viajes del día: {shiftReport.operational.tripsCount}</li>
                <li>SLA / llegada: {shiftReport.operational.slaLabel}</li>
                <li>
                  Incidentes QHSE: {shiftReport.operational.qhseIncidentsCount}
                </li>
                <li>
                  Vehículos a MAINTENANCE:{" "}
                  {shiftReport.operational.vehiclesToMaintenanceCount}
                  {shiftReport.operational.vehiclesToMaintenance.length > 0
                    ? ` (${shiftReport.operational.vehiclesToMaintenance
                        .map((v) => v.plate)
                        .join(", ")})`
                    : ""}
                </li>
              </ul>
            </section>

            <section className="space-y-2">
              <h3 className="font-data text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-text-secondary">
                Cuellos abiertos
              </h3>
              {shiftReport.bottlenecks.count === 0 ? (
                <EmptyState
                  title="Sin cuellos abiertos"
                  description="0 ítems según el scanner de balance-scorecard."
                />
              ) : (
                <ul className="space-y-2">
                  {shiftReport.bottlenecks.items.map((b) => (
                    <li
                      key={b.area + b.message}
                      className="rounded-lg border border-brand-border px-3 py-2"
                    >
                      <StatusPulseBadge
                        tone={b.severity === "RED" ? "danger" : "fatiga"}
                      >
                        {b.area}
                      </StatusPulseBadge>
                      <p className="mt-1 text-sm text-brand-text-primary">
                        {b.message}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : (
          <EmptyState
            title="Sin reporte"
            description="No hay datos para mostrar."
          />
        )}
      </Modal>

      <SlideOver
        open={detailPanel?.kind === "cxp"}
        onClose={closeDetail}
        title="CxP abiertas"
        description="Facturas por pagar (PAYABLE · ISSUED/OVERDUE) del período"
        widthClass="max-w-2xl"
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
        {detailLoading ? (
          <p className="text-sm text-brand-text-secondary">Cargando…</p>
        ) : detailError ? (
          <p className="text-sm text-brand-danger">{detailError}</p>
        ) : cxpDetail && cxpDetail.invoices.length > 0 ? (
          <div className="space-y-3">
            <p className="font-data text-xs text-brand-text-secondary">
              {cxpDetail.count} factura(s) · {money(cxpDetail.total)}
            </p>
            <NexaTable columns={["Número", "Proveedor", "Monto", "Vencimiento", "Estado"]}>
              {cxpDetail.invoices.map((inv) => (
                <NexaRow key={inv.id}>
                  <NexaCell mono>{inv.number}</NexaCell>
                  <NexaCell>{inv.supplier}</NexaCell>
                  <NexaCell mono>{money(inv.amount)}</NexaCell>
                  <NexaCell mono>
                    {inv.dueDate
                      ? new Date(inv.dueDate).toLocaleDateString("es-CO")
                      : "—"}
                  </NexaCell>
                  <NexaCell>
                    <Badge tone={inv.status === "OVERDUE" ? "danger" : "info"}>
                      {inv.status}
                    </Badge>
                  </NexaCell>
                </NexaRow>
              ))}
            </NexaTable>
          </div>
        ) : (
          <EmptyState
            title="Sin CxP abiertas"
            description="No hay facturas por pagar ISSUED/OVERDUE en el período."
          />
        )}
      </SlideOver>

      <SlideOver
        open={detailPanel?.kind === "blocks"}
        onClose={closeDetail}
        title="Bloqueos de despacho"
        description="Vehículos con complianceBlocked — placa y motivo"
        widthClass="max-w-xl"
        footer={
          <div className="flex w-full flex-wrap justify-end gap-2">
            <Link href="/tramites">
              <Button type="button" variant="secondary" className="w-auto px-4 py-2">
                Ir a Trámites
              </Button>
            </Link>
          </div>
        }
      >
        {detailLoading ? (
          <p className="text-sm text-brand-text-secondary">Cargando…</p>
        ) : detailError ? (
          <p className="text-sm text-brand-danger">{detailError}</p>
        ) : blocksDetail && blocksDetail.vehicles.length > 0 ? (
          <div className="space-y-3">
            <p className="font-data text-xs text-brand-text-secondary">
              {blocksDetail.count} vehículo(s) bloqueado(s)
            </p>
            <NexaTable columns={["Placa", "Unidad", "Motivo"]}>
              {blocksDetail.vehicles.map((v) => (
                <NexaRow key={v.id}>
                  <NexaCell mono className="font-semibold">
                    {v.plate}
                  </NexaCell>
                  <NexaCell>{v.label || "—"}</NexaCell>
                  <NexaCell>{v.reason}</NexaCell>
                </NexaRow>
              ))}
            </NexaTable>
          </div>
        ) : (
          <EmptyState
            title="Sin bloqueos de flota"
            description="No hay vehículos con complianceBlocked ni estado COMPLIANCE_BLOCKED."
          />
        )}
      </SlideOver>

      <SlideOver
        open={detailPanel?.kind === "ot"}
        onClose={closeDetail}
        title="OT abiertas"
        description="Órdenes de trabajo abiertas en el período"
        widthClass="max-w-2xl"
        footer={
          <div className="flex w-full flex-wrap justify-end gap-2">
            <Link href="/taller">
              <Button type="button" variant="secondary" className="w-auto px-4 py-2">
                Ir a Taller
              </Button>
            </Link>
          </div>
        }
      >
        {detailLoading ? (
          <p className="text-sm text-brand-text-secondary">Cargando…</p>
        ) : detailError ? (
          <p className="text-sm text-brand-danger">{detailError}</p>
        ) : woDetail && woDetail.workOrders.length > 0 ? (
          <div className="space-y-3">
            <p className="font-data text-xs text-brand-text-secondary">
              {woDetail.count} orden(es)
            </p>
            <NexaTable columns={["Código", "Vehículo", "Estado", "Antigüedad"]}>
              {woDetail.workOrders.map((wo) => (
                <NexaRow key={wo.id}>
                  <NexaCell mono>{wo.code}</NexaCell>
                  <NexaCell>
                    <span className="font-data text-xs">{wo.vehiclePlate}</span>
                    <span className="ml-1 text-brand-text-secondary">
                      {wo.vehicleLabel}
                    </span>
                  </NexaCell>
                  <NexaCell>
                    <Badge tone="info">{wo.status}</Badge>
                  </NexaCell>
                  <NexaCell mono>
                    {wo.ageDays} día{wo.ageDays === 1 ? "" : "s"}
                  </NexaCell>
                </NexaRow>
              ))}
            </NexaTable>
          </div>
        ) : (
          <EmptyState
            title="Sin OT abiertas"
            description="No hay órdenes de trabajo abiertas en el período seleccionado."
          />
        )}
      </SlideOver>

      <SlideOver
        open={detailPanel?.kind === "aging"}
        onClose={closeDetail}
        title={
          detailPanel?.kind === "aging"
            ? `Aging CxC · ${detailPanel.label}`
            : "Aging CxC"
        }
        description="Facturas RECEIVABLE no PAID/CANCELLED/DRAFT del bucket"
        widthClass="max-w-2xl"
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
        {detailLoading ? (
          <p className="text-sm text-brand-text-secondary">Cargando…</p>
        ) : detailError ? (
          <p className="text-sm text-brand-danger">{detailError}</p>
        ) : agingDetail && agingDetail.invoices.length > 0 ? (
          <div className="space-y-3">
            <p className="font-data text-xs text-brand-text-secondary">
              {agingDetail.count} factura(s) · {money(agingDetail.total)}
            </p>
            <NexaTable columns={["Número", "Cliente", "Monto", "Vencimiento", "Mora", "Estado"]}>
              {agingDetail.invoices.map((inv) => (
                <NexaRow key={inv.id}>
                  <NexaCell mono>{inv.number}</NexaCell>
                  <NexaCell>{inv.customer}</NexaCell>
                  <NexaCell mono>{money(inv.amount)}</NexaCell>
                  <NexaCell mono>
                    {inv.dueDate
                      ? new Date(inv.dueDate).toLocaleDateString("es-CO")
                      : "—"}
                  </NexaCell>
                  <NexaCell mono>{inv.daysOverdue}d</NexaCell>
                  <NexaCell>
                    <Badge tone={inv.status === "OVERDUE" ? "danger" : "info"}>
                      {inv.status}
                    </Badge>
                  </NexaCell>
                </NexaRow>
              ))}
            </NexaTable>
          </div>
        ) : (
          <EmptyState
            title="Sin facturas en este bucket"
            description={
              detailPanel?.kind === "aging"
                ? `No hay CxC abierta en el rango ${detailPanel.label}.`
                : "No hay facturas en este rango de aging."
            }
          />
        )}
      </SlideOver>
    </div>
  );
}
