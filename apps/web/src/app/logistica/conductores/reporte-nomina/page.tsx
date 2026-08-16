"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@fsg/ui";
import { ClipboardList } from "lucide-react";
import { api, apiDownload } from "@/lib/api";
import { PageIntro } from "@/components/page-intro";
import { EmptyState, KpiCard, Modal, StatusPulseBadge } from "@/components/audit";
import { TarifarioRecargosPanel } from "@/components/logistica/tarifario-recargos-panel";

type DriverOpt = { id: string; name: string; document: string };

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
  totalPay: number;
  totalExtrasHours: number;
  ordinaryHours: number;
  baseSalary: number;
  daily: Array<{
    date: string;
    ordinaryHours: number;
    hedHours: number;
    henHours: number;
    rnHours: number;
    hedfHours: number;
    henfHours: number;
    extrasAmount: number;
    services: Array<{ code: string; origin: string; destination: string }>;
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

export default function ReporteNominaPage() {
  const [mes, setMes] = useState(currentMes);
  const [empleadoId, setEmpleadoId] = useState("ALL");
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
    if (empleadoId === "ALL") return report.rows;
    return report.rows.filter((r) => r.empleadoId === empleadoId);
  }, [report, empleadoId]);

  const metrics = useMemo(() => {
    if (!report) return null;
    if (empleadoId === "ALL") return report.metrics;
    const row = report.rows.find((r) => r.empleadoId === empleadoId);
    if (!row) return report.metrics;
    return {
      totalExtrasHours: row.totalExtrasHours,
      totalExtrasAmount: row.totalExtrasAmount,
      totalNovelties: row.noveltyCount,
      topEmployee: {
        empleadoId: row.empleadoId,
        name: row.name,
        document: row.document,
        totalExtrasAmount: row.totalExtrasAmount,
      },
      employeeCount: 1,
    };
  }, [report, empleadoId]);

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

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <PageIntro
        module="logistica"
        title="Reporte mensual · Nómina de horas extras"
      />

      {error ? (
        <p role="alert" className="text-sm text-[var(--brand-signal)]">
          {error}
        </p>
      ) : null}

      {metrics ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Total horas extras"
            value={hrs(metrics.totalExtrasHours)}
            delta="HED+HEN+RN+HEDF+HENF"
          />
          <KpiCard
            label="Mayor acumulado extras"
            value={metrics.topEmployee?.name ?? "—"}
            delta={
              metrics.topEmployee
                ? money(metrics.topEmployee.totalExtrasAmount)
                : "Sin datos"
            }
          />
          <KpiCard
            label="Novedades registradas"
            value={String(metrics.totalNovelties)}
            delta={`${metrics.employeeCount} empleados`}
            tone="warn"
          />
          <KpiCard
            label="Presupuesto extras"
            value={money(metrics.totalExtrasAmount)}
            delta="Total a liquidar"
            tone="ok"
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
        <Button
          type="button"
          variant="secondary"
          className="w-auto"
          onClick={() => void loadReport()}
          loading={loading}
        >
          Actualizar
        </Button>
        <div className="relative ml-auto">
          <Button
            type="button"
            variant="primary"
            className="w-auto"
            loading={exporting}
            onClick={() => setExportOpen((v) => !v)}
          >
            Exportar reporte mensual
          </Button>
          {exportOpen ? (
            <div className="absolute right-0 z-20 mt-2 w-48 overflow-hidden rounded-md border border-[var(--brand-line)] bg-[var(--brand-surface,#121722)] shadow-lg">
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

      <div className="fsg-panel data-shell overflow-auto">
        {!loading && rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<ClipboardList className="h-7 w-7" aria-hidden />}
              title="Sin liquidaciones en el período"
              description="Ajusta el mes o registra servicios con extras para generar el reporte."
            />
          </div>
        ) : (
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.08em] text-[var(--brand-muted)]">
                <th className="px-3 py-2">Documento</th>
                <th className="px-3 py-2">Empleado</th>
                <th className="px-3 py-2">Días</th>
                <th className="px-3 py-2">
                  <SiglaBadge code="HED" tone="active" />
                </th>
                <th className="px-3 py-2">
                  <SiglaBadge code="HEN" tone="danger" />
                </th>
                <th className="px-3 py-2">
                  <SiglaBadge code="RN" tone="fatiga" />
                </th>
                <th className="px-3 py-2">HEDF</th>
                <th className="px-3 py-2">HENF</th>
                <th className="px-3 py-2">Novedades</th>
                <th className="px-3 py-2">Total $ extras</th>
                <th className="px-3 py-2">Total a pagar</th>
                <th className="px-3 py-2">Acción</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.empleadoId}
                  className="border-t border-[var(--brand-line)]"
                >
                  <td className="px-3 py-2 font-data text-xs">{r.document}</td>
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2 font-data text-xs">{r.daysWorked}</td>
                  <td className="px-3 py-2 font-data text-xs">
                    {hrs(r.hedHours)}
                  </td>
                  <td className="px-3 py-2 font-data text-xs">
                    {hrs(r.henHours)}
                  </td>
                  <td className="px-3 py-2 font-data text-xs">{hrs(r.rnHours)}</td>
                  <td className="px-3 py-2 font-data text-xs">
                    {hrs(r.hedfHours)}
                  </td>
                  <td className="px-3 py-2 font-data text-xs">
                    {hrs(r.henfHours)}
                  </td>
                  <td className="px-3 py-2 font-data text-xs">{r.noveltyCount}</td>
                  <td className="px-3 py-2 font-data text-xs text-[var(--brand-amber)]">
                    {money(r.totalExtrasAmount)}
                  </td>
                  <td className="px-3 py-2 font-data text-xs text-[var(--brand-primary)]">
                    {money(r.totalPay)}
                  </td>
                  <td className="px-3 py-2">
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-auto"
                      onClick={() => void openDetail(r.empleadoId)}
                    >
                      Ver detalle día a día
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.name ?? "Detalle"}
        description={
          detail
            ? `${detail.document} · ${mes} · Base ${money(detail.baseSalary)}`
            : undefined
        }
        size="lg"
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
          <div className="space-y-4">
            {detail.novelties.length ? (
              <div className="rounded-md border border-slate-800 p-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                  Novedades del mes
                </p>
                <ul className="space-y-1 text-xs">
                  {detail.novelties.map((n, i) => (
                    <li key={`${n.kind}-${i}`}>
                      <span className="font-data text-[var(--brand-signal)]">
                        {n.kind}
                      </span>{" "}
                      {new Date(n.dateFrom).toLocaleDateString("es-CO")} →{" "}
                      {new Date(n.dateTo).toLocaleDateString("es-CO")}
                      {n.notes ? ` · ${n.notes}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.08em] text-slate-500">
                  <th className="py-1">Fecha</th>
                  <th>Ord</th>
                  <th>
                    <SiglaBadge code="HED" tone="active" />
                  </th>
                  <th>
                    <SiglaBadge code="HEN" tone="danger" />
                  </th>
                  <th>
                    <SiglaBadge code="RN" tone="fatiga" />
                  </th>
                  <th>HEDF</th>
                  <th>HENF</th>
                  <th>$ Extras</th>
                  <th>Servicios</th>
                </tr>
              </thead>
              <tbody>
                {detail.daily.map((d) => (
                  <tr key={d.date} className="border-t border-slate-800">
                    <td className="py-1.5 font-data">{d.date}</td>
                    <td className="font-data">{hrs(d.ordinaryHours)}</td>
                    <td className="font-data">{hrs(d.hedHours)}</td>
                    <td className="font-data">{hrs(d.henHours)}</td>
                    <td className="font-data">{hrs(d.rnHours)}</td>
                    <td className="font-data">{hrs(d.hedfHours)}</td>
                    <td className="font-data">{hrs(d.henfHours)}</td>
                    <td className="font-data text-[var(--brand-amber)]">
                      {money(d.extrasAmount)}
                    </td>
                    <td className="text-slate-500">
                      {d.services.map((s) => s.code).join(", ") || "—"}
                      {d.novelties.length
                        ? ` · ${d.novelties.map((n) => n.kind).join(",")}`
                        : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex flex-wrap gap-4 font-data text-sm">
              <span>
                Extras{" "}
                <strong className="text-[var(--brand-amber)]">
                  {money(detail.totalExtrasAmount)}
                </strong>
              </span>
              <span>
                Total a pagar{" "}
                <strong className="text-[var(--brand-primary)]">
                  {money(detail.totalPay)}
                </strong>
              </span>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
