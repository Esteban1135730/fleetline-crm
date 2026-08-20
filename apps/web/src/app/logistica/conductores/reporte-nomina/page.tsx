"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@fsg/ui";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  DollarSign,
  Eye,
  Landmark,
  MapPin,
  Search,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, apiDownload } from "@/lib/api";
import { PageIntro } from "@/components/page-intro";
import {
  EmptyState,
  KpiCard,
  SlideOver,
  StatusPulseBadge,
} from "@/components/audit";
import { TarifarioRecargosPanel } from "@/components/logistica/tarifario-recargos-panel";

const MONTHLY_OVERTIME_LIMIT_H = 48;

type DriverOpt = { id: string; name: string; document: string };

type ServiceAudit = {
  tripId: string;
  code: string;
  origin: string;
  destination: string;
  totalAmount: number;
  vehiclePlate: string | null;
  telemetryHours: number | null;
  claimedHours: number;
  telemetryValid: boolean;
  telemetryAlert: boolean;
};

type EmpleadoRow = {
  empleadoId: string;
  document: string;
  name: string;
  daysWorked: number;
  hedHours: number;
  henHours: number;
  rnHours: number;
  hedfHours: number;
  henfHours: number;
  noveltyCount: number;
  totalExtrasAmount: number;
  nocturnoAmount: number;
  diurnoExtrasAmount: number;
  totalPay: number;
  totalExtrasHours: number;
  ordinaryHours: number;
  baseSalary: number;
  telemetryAlerts: number;
  telemetryMatchPct: number;
  overtimeLimitExceeded: boolean;
  daily: Array<{
    date: string;
    ordinaryHours: number;
    hedHours: number;
    henHours: number;
    rnHours: number;
    hedfHours: number;
    henfHours: number;
    extrasAmount: number;
    telemetryMatchPct: number;
    hasTelemetryAlert: boolean;
    services: ServiceAudit[];
    novelties: Array<{ kind: string; notes: string | null }>;
  }>;
  novelties: Array<{
    kind: string;
    dateFrom: string;
    dateTo: string;
    notes: string | null;
  }>;
};

type ReporteGeneral = {
  period: { label: string; month: number; year: number };
  metrics: {
    totalExtrasHours: number;
    totalExtrasAmount: number;
    totalNovelties: number;
    totalPayrollBudget: number;
    telemetryAlerts: number;
    employeesOverLimit: number;
    topEmployee: {
      empleadoId: string;
      name: string;
      document: string;
      totalExtrasAmount: number;
    } | null;
    employeeCount: number;
  };
  rows: EmpleadoRow[];
};

function money(n: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

function hrs(n: number) {
  return Number(n).toFixed(2);
}

function currentMes() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
}

function SiglaBadge({
  code,
  tone = "neutral",
}: {
  code: string;
  tone?: "neutral" | "active" | "fatiga" | "danger";
}) {
  return (
    <StatusPulseBadge tone={tone} pulse={false}>
      {code}
    </StatusPulseBadge>
  );
}

function hourBadges(row: EmpleadoRow) {
  const items: Array<{ code: string; hours: number; tone: "active" | "fatiga" | "danger" | "neutral" }> = [];
  if (row.hedHours > 0) items.push({ code: "HED", hours: row.hedHours, tone: "active" });
  if (row.henHours > 0) items.push({ code: "HEN", hours: row.henHours, tone: "danger" });
  if (row.rnHours > 0) items.push({ code: "RN", hours: row.rnHours, tone: "fatiga" });
  if (row.hedfHours > 0) items.push({ code: "HEDF", hours: row.hedfHours, tone: "active" });
  if (row.henfHours > 0) items.push({ code: "HENF", hours: row.henfHours, tone: "danger" });
  return items;
}

function daySiglas(d: EmpleadoRow["daily"][0]) {
  const out: string[] = [];
  if (d.hedHours > 0) out.push(`+${hrs(d.hedHours)} HED`);
  if (d.henHours > 0) out.push(`+${hrs(d.henHours)} HEN`);
  if (d.rnHours > 0) out.push(`+${hrs(d.rnHours)} RN`);
  if (d.hedfHours > 0) out.push(`+${hrs(d.hedfHours)} HEDF`);
  if (d.henfHours > 0) out.push(`+${hrs(d.henfHours)} HENF`);
  return out;
}

export default function ReporteNominaPage() {
  const [mes, setMes] = useState(currentMes);
  const [empleadoId, setEmpleadoId] = useState("ALL");
  const [search, setSearch] = useState("");
  const [drivers, setDrivers] = useState<DriverOpt[]>([]);
  const [report, setReport] = useState<ReporteGeneral | null>(null);
  const [detail, setDetail] = useState<EmpleadoRow | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const loadDrivers = useCallback(async () => {
    const rows = await api<DriverOpt[]>("/logistica/conductores");
    setDrivers(rows);
  }, []);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api<ReporteGeneral>(
        `/nomina/reporte-general?mes=${encodeURIComponent(mes)}`,
      );
      setReport(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reporte fallido");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [mes]);

  useEffect(() => {
    void loadDrivers().catch((e) =>
      setError(e instanceof Error ? e.message : "Conexión fallida"),
    );
  }, [loadDrivers]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const rows = useMemo(() => {
    if (!report) return [];
    let list = report.rows;
    if (empleadoId !== "ALL") {
      list = list.filter((r) => r.empleadoId === empleadoId);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.document.toLowerCase().includes(q),
      );
    }
    return list;
  }, [report, empleadoId, search]);

  const metrics = useMemo(() => {
    if (!report) return null;
    if (empleadoId === "ALL" && !search.trim()) return report.metrics;
    const totalExtrasHours = rows.reduce((s, r) => s + r.totalExtrasHours, 0);
    const totalExtrasAmount = rows.reduce((s, r) => s + r.totalExtrasAmount, 0);
    const totalNovelties = rows.reduce((s, r) => s + r.noveltyCount, 0);
    const totalPayrollBudget = rows.reduce((s, r) => s + r.totalPay, 0);
    const telemetryAlerts = rows.reduce((s, r) => s + r.telemetryAlerts, 0);
    const employeesOverLimit = rows.filter((r) => r.overtimeLimitExceeded).length;
    const top = [...rows].sort(
      (a, b) => b.totalExtrasAmount - a.totalExtrasAmount,
    )[0];
    return {
      totalExtrasHours,
      totalExtrasAmount,
      totalNovelties,
      totalPayrollBudget,
      telemetryAlerts,
      employeesOverLimit,
      topEmployee: top
        ? {
            empleadoId: top.empleadoId,
            name: top.name,
            document: top.document,
            totalExtrasAmount: top.totalExtrasAmount,
          }
        : null,
      employeeCount: rows.length,
    };
  }, [report, empleadoId, search, rows]);

  const costChartData = useMemo(
    () =>
      rows.slice(0, 8).map((r) => ({
        nombre: r.name.split(" ").slice(0, 2).join(" "),
        base: r.baseSalary,
        extras: r.diurnoExtrasAmount ?? Math.max(0, r.totalExtrasAmount - (r.nocturnoAmount ?? 0)),
        nocturno: r.nocturnoAmount ?? 0,
      })),
    [rows],
  );

  async function exportFile(kind: "excel" | "pdf") {
    setExporting(true);
    setError("");
    setExportOpen(false);
    try {
      const q = new URLSearchParams({
        mes,
        empleadoId: empleadoId || "ALL",
      });
      const ext = kind === "excel" ? "xlsx" : "pdf";
      const name =
        kind === "excel"
          ? `nomina-extras-${mes}.${ext}`
          : empleadoId === "ALL"
            ? `nomina-consolidado-${mes}.pdf`
            : `desprendible-${mes}.pdf`;
      await apiDownload(`/nomina/exportar/${kind}?${q.toString()}`, name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Exportación fallida");
    } finally {
      setExporting(false);
    }
  }

  async function openDetail(id: string) {
    setError("");
    try {
      const data = await api<{ employee: EmpleadoRow }>(
        `/nomina/reporte-empleado/${id}?mes=${encodeURIComponent(mes)}`,
      );
      setDetail(data.employee);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Detalle fallido");
    }
  }

  const detailDaysWithExtras = useMemo(
    () =>
      detail?.daily.filter(
        (d) =>
          d.extrasAmount > 0 ||
          d.services.length > 0 ||
          d.novelties.length > 0,
      ) ?? [],
    [detail],
  );

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <PageIntro
        module="logistica"
        title="Auditoría de nómina operativa"
        subtitle="Control de costos · validación por telemetría"
        action={
          <div className="relative">
            <Button
              type="button"
              variant="primary"
              className="w-auto"
              loading={exporting}
              onClick={() => setExportOpen((v) => !v)}
            >
              Exportar cierre mensual
            </Button>
            {exportOpen ? (
              <div className="absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-md border border-[var(--brand-line)] bg-[var(--brand-surface,#121722)] shadow-lg">
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--brand-primary)]/10"
                  onClick={() => void exportFile("excel")}
                >
                  Excel (.xlsx)
                </button>
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--brand-primary)]/10"
                  onClick={() => void exportFile("pdf")}
                >
                  Comprobante en PDF
                </button>
              </div>
            ) : null}
          </div>
        }
      />

      {error ? (
        <p role="alert" className="text-sm text-[var(--brand-signal)]">
          {error}
        </p>
      ) : null}

      {metrics && metrics.telemetryAlerts > 0 ? (
        <div className="flex items-start gap-3 rounded-lg border border-[var(--accent-alert)]/40 bg-[var(--accent-alert)]/10 px-4 py-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent-alert)]" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              {metrics.telemetryAlerts} alerta{metrics.telemetryAlerts !== 1 ? "s" : ""} de telemetría
            </p>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              Horas reclamadas sin respaldo GPS o con discrepancia superior a 30 min.
            </p>
          </div>
        </div>
      ) : null}

      {metrics ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Costo total extras (mes)"
            value={money(metrics.totalExtrasAmount)}
            delta={`${hrs(metrics.totalExtrasHours)}h · validado por GPS`}
            tone="warn"
            icon={<DollarSign className="h-5 w-5 text-[var(--accent-metric)]" aria-hidden />}
          />
          <KpiCard
            label="Mayor generador"
            value={metrics.topEmployee?.name ?? "—"}
            delta={
              metrics.topEmployee
                ? money(metrics.topEmployee.totalExtrasAmount)
                : "Sin datos"
            }
            tone="ok"
            icon={<TrendingUp className="h-5 w-5 text-[var(--accent-primary)]" aria-hidden />}
          />
          <KpiCard
            label="Alertas de telemetría"
            value={String(metrics.telemetryAlerts)}
            delta="Discrepancias horas vs GPS"
            tone={metrics.telemetryAlerts > 0 ? "danger" : "ok"}
            icon={<ShieldAlert className="h-5 w-5 text-[var(--accent-alert)]" aria-hidden />}
          />
          <KpiCard
            label="Presupuesto global a pagar"
            value={money(metrics.totalPayrollBudget)}
            delta="Salarios + recargos validados"
            tone="neutral"
            icon={<Landmark className="h-5 w-5 text-[var(--accent-primary)]" aria-hidden />}
          />
        </div>
      ) : null}

      <div className="fsg-panel flex flex-wrap items-end gap-3 p-4">
        <label className="space-y-1 text-xs text-[var(--brand-muted)]">
          Período
          <input
            className="field font-data block"
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
          />
        </label>
        <label className="space-y-1 text-xs text-[var(--brand-muted)]">
          Empleado
          <select
            className="field block min-w-[240px]"
            value={empleadoId}
            onChange={(e) => setEmpleadoId(e.target.value)}
          >
            <option value="ALL">Todos</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} · {d.document}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-[200px] flex-1 space-y-1 text-xs text-[var(--brand-muted)]">
          Filtrar operador
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--brand-muted)]" aria-hidden />
            <input
              className="field block w-full pl-9"
              type="search"
              placeholder="Nombre o documento…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </label>
        <Button
          type="button"
          variant="secondary"
          className="w-auto"
          onClick={() => void loadReport()}
          loading={loading}
        >
          Actualizar
        </Button>
      </div>

      <details className="fsg-panel overflow-hidden">
        <summary className="cursor-pointer list-none px-4 py-3 font-display text-sm font-semibold marker:content-none [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-2">
            Tarifario de recargos
            <span className="inline-flex gap-1">
              <SiglaBadge code="RN" tone="fatiga" />
              <SiglaBadge code="HED" tone="active" />
              <SiglaBadge code="HEN" tone="danger" />
            </span>
            <span className="ml-2 text-xs font-normal text-[var(--brand-muted)]">
              (colapsado — expandir)
            </span>
          </span>
        </summary>
        <div className="border-t border-[var(--brand-line)] p-4">
          <TarifarioRecargosPanel />
        </div>
      </details>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="fsg-panel flex flex-col p-4 lg:col-span-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--brand-muted)]">
            Desglose de costos por operador
          </h3>
          {costChartData.length === 0 ? (
            <EmptyState
              title="Sin datos de costos"
              description="No hay liquidaciones en el período seleccionado."
            />
          ) : (
            <div className="min-h-[280px] flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={costChartData}
                  layout="vertical"
                  margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--brand-line)" />
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="nombre"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: "var(--brand-muted)" }}
                    width={72}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--brand-primary)", opacity: 0.06 }}
                    formatter={(v: number) => money(v)}
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid var(--brand-line)",
                      background: "var(--brand-surface,#121722)",
                    }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="base" name="Salario base" stackId="a" fill="#64748b" />
                  <Bar dataKey="extras" name="H. extras" stackId="a" fill="var(--brand-amber,#D97706)" />
                  <Bar dataKey="nocturno" name="R. nocturno" stackId="a" fill="#6366f1" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="fsg-panel data-shell overflow-auto lg:col-span-8">
          {!loading && rows.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<AlertTriangle className="h-7 w-7" aria-hidden />}
                title="Sin liquidaciones en el período"
                description="Ajusta el mes o registra servicios con extras para generar el reporte."
              />
            </div>
          ) : (
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-[0.08em] text-[var(--brand-muted)]">
                  <th className="px-3 py-2">Operador / ID</th>
                  <th className="px-3 py-2 text-center">Horas validadas</th>
                  <th className="px-3 py-2 text-right">Costo variable</th>
                  <th className="px-3 py-2 text-right">Total a pagar</th>
                  <th className="px-3 py-2 text-center">Auditoría</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const badges = hourBadges(r);
                  const hasExtras = r.totalExtrasAmount > 0;
                  return (
                    <tr
                      key={r.empleadoId}
                      className="border-t border-[var(--brand-line)]"
                    >
                      <td className="px-3 py-2">
                        <p className="font-semibold">{r.name}</p>
                        <p className="font-data text-[10px] text-[var(--brand-muted)]">
                          {r.document}
                        </p>
                        {r.overtimeLimitExceeded ? (
                          <span className="mt-1 inline-block">
                            <StatusPulseBadge tone="danger" pulse>
                              &gt;{MONTHLY_OVERTIME_LIMIT_H}h mes
                            </StatusPulseBadge>
                          </span>
                        ) : null}
                        {r.telemetryAlerts > 0 ? (
                          <span className="mt-1 inline-block">
                            <StatusPulseBadge tone="fatiga" pulse={false}>
                              {r.telemetryAlerts} alerta GPS
                            </StatusPulseBadge>
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {badges.length ? (
                          <div className="flex flex-wrap justify-center gap-1">
                            {badges.map((b) => (
                              <span
                                key={b.code}
                                className="rounded px-1.5 py-0.5 text-[9px] font-bold"
                                style={{
                                  background:
                                    b.tone === "active"
                                      ? "rgba(16,185,129,0.15)"
                                      : b.tone === "fatiga"
                                        ? "rgba(99,102,241,0.15)"
                                        : "rgba(239,68,68,0.15)",
                                  color:
                                    b.tone === "active"
                                      ? "var(--accent-primary)"
                                      : b.tone === "fatiga"
                                        ? "#6366f1"
                                        : "var(--accent-alert)",
                                }}
                              >
                                {hrs(b.hours)} {b.code}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[10px] text-[var(--brand-muted)]">
                            Sin novedades
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-data text-xs text-[var(--brand-amber)]">
                        {money(r.totalExtrasAmount)}
                      </td>
                      <td className="px-3 py-2 text-right font-data text-xs">
                        <span className="block text-[var(--brand-muted)]">
                          Base {money(r.baseSalary)}
                        </span>
                        <strong className="text-[var(--brand-primary)]">
                          {money(r.totalPay)}
                        </strong>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Button
                          type="button"
                          variant="ghost"
                          className="w-auto text-[10px] uppercase"
                          disabled={!hasExtras && r.noveltyCount === 0}
                          onClick={() => void openDetail(r.empleadoId)}
                        >
                          <Eye className="mr-1 inline h-3 w-3" aria-hidden />
                          Ver detalle
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <SlideOver
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title="Auditoría día a día"
        description={
          detail
            ? `${detail.name} · ${mes} · Match telemetría ${detail.telemetryMatchPct}%`
            : undefined
        }
        widthClass="max-w-lg"
        footer={
          <Button
            type="button"
            variant="ghost"
            className="w-auto"
            onClick={() => setDetail(null)}
          >
            Cerrar
          </Button>
        }
      >
        {detail ? (
          <div className="space-y-5">
            <div className="flex items-center justify-between rounded-lg border border-[var(--brand-line)] p-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--brand-muted)]">
                  Total adicional validado
                </p>
                <p className="font-display text-2xl font-bold text-[var(--accent-primary)]">
                  {money(detail.totalExtrasAmount)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--brand-muted)]">
                  Match telemetría
                </p>
                <p className="font-data text-xl font-bold">
                  {detail.telemetryMatchPct}%
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 font-data text-xs">
              <span>
                Base{" "}
                <strong>{money(detail.baseSalary)}</strong>
              </span>
              <span>
                Total a pagar{" "}
                <strong className="text-[var(--accent-primary)]">
                  {money(detail.totalPay)}
                </strong>
              </span>
            </div>

            <div>
              <h3 className="mb-3 border-b border-[var(--brand-line)] pb-2 text-xs font-semibold uppercase tracking-[0.1em]">
                Desglose geocercado
              </h3>
              {detailDaysWithExtras.length === 0 ? (
                <p className="text-sm text-[var(--brand-muted)]">
                  Sin registros operativos en el período.
                </p>
              ) : (
                <div className="relative space-y-4 before:absolute before:inset-y-0 before:left-5 before:w-0.5 before:bg-[var(--brand-line)]">
                  {detailDaysWithExtras.map((d) => {
                    const siglas = daySiglas(d);
                    const svc = d.services[0];
                    const validated = !d.hasTelemetryAlert;
                    return (
                      <div key={d.date} className="relative flex gap-4 pl-10">
                        <div
                          className={`absolute left-3 flex h-8 w-8 items-center justify-center rounded-full border-2 border-[var(--bg-surface-1)] ${
                            validated
                              ? "bg-[var(--accent-primary)] text-white"
                              : "bg-[var(--accent-alert)] text-white"
                          }`}
                        >
                          {validated ? (
                            <CheckCircle className="h-4 w-4" aria-hidden />
                          ) : (
                            <AlertTriangle className="h-4 w-4" aria-hidden />
                          )}
                        </div>
                        <div className="flex-1 rounded-lg border border-[var(--brand-line)] p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm font-semibold">
                              {new Date(`${d.date}T12:00:00`).toLocaleDateString("es-CO", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })}
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {siglas.map((s) => (
                                <span
                                  key={s}
                                  className="rounded bg-[var(--accent-metric)]/15 px-2 py-0.5 text-[10px] font-bold text-[var(--accent-metric)]"
                                >
                                  {s}
                                </span>
                              ))}
                              {d.extrasAmount > 0 ? (
                                <span className="font-data text-[10px] text-[var(--accent-metric)]">
                                  {money(d.extrasAmount)}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          {svc ? (
                            <>
                              <p className="mt-2 flex items-center gap-1 text-xs text-[var(--brand-muted)]">
                                <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                                <span className="font-data">
                                  {svc.origin} → {svc.destination}
                                </span>
                              </p>
                              <p className="mt-1 text-[10px] font-semibold text-[var(--accent-primary)]">
                                {svc.telemetryValid
                                  ? `Validado por GPS${svc.vehiclePlate ? ` · Bus ${svc.vehiclePlate}` : ""}`
                                  : svc.telemetryHours != null
                                    ? `Discrepancia: ${hrs(svc.claimedHours)}h reclamadas vs ${hrs(svc.telemetryHours)}h GPS`
                                    : "Sin uplink GPS — requiere revisión"}
                              </p>
                            </>
                          ) : d.novelties.length ? (
                            <p className="mt-2 flex items-center gap-1 text-xs text-[var(--brand-muted)]">
                              <Clock className="h-3 w-3 shrink-0" aria-hidden />
                              Novedad: {d.novelties.map((n) => n.kind).join(", ")}
                              {d.novelties[0]?.notes ? ` · ${d.novelties[0].notes}` : ""}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </SlideOver>
    </div>
  );
}
