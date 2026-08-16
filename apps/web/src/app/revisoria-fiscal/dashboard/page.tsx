"use client";

/**
 * Revisoría Fiscal · Truth Hub
 * Propuesta completa: @UI-UX-Architect + @Sales-Enabler + @Refactor-Engine + @QA-Linter
 * Cumple `.cursorrules` (KPIs / filtros / tabla · ayuda en SlideOver · forms en Modal · EmptyState).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@fsg/ui";
import { HARD_RULES, statusEs } from "@fsg/shared";
import { api } from "@/lib/api";
import {
  EmptyState,
  KpiCard,
  Modal,
  SlideOverHelp,
  StatusPulseBadge,
} from "@/components/audit";

type PucNode = {
  id: string;
  code: string;
  name: string;
  type: string;
  balance: number;
  invoices: Array<{
    id: string;
    number: string;
    type: string;
    amount: number;
    counterparty: string;
  }>;
};

type Flagged = {
  invoiceId: string;
  number: string;
  issue: string;
  amount: number;
  detail: string;
  expectedRetention: number;
  declaredRetention: number | null;
};

type Dash = {
  hub: string;
  yearMonth: string;
  period: {
    status: string;
    hardLockedAt: string | null;
    dictamen: {
      pdfRef: string;
      signatureHash: string;
      opinion: string;
    } | null;
  };
  balanceTree: PucNode[];
  sampling: {
    population: number;
    samplePct: number;
    sampleSize: number;
    items: Array<{
      id: string;
      number: string;
      type: string;
      amount: number;
      counterparty: string;
    }>;
  };
  impuestosSummary: {
    flaggedCount: number;
    saleTotal: number;
    purchaseTotal: number;
    dianPrevalidatorRef: string;
  };
  auditNotes: Array<{
    id: string;
    title: string;
    severity: string;
    taggedModule: string;
  }>;
  policy: { samplePct: number; retefuentePct: number };
};

type Drill = {
  invoice: { number: string; amount: number; counterparty: string };
  thread: {
    budgetSignature: string | null;
    purchaseOrder: {
      code: string;
      status: string;
      approvedBy: string | null;
    } | null;
    warehouseReceipts: Array<{ code: string; receivedAt: string }>;
    egreso: Array<{ status: string; amount: number; bankRef: string | null }>;
    pucAccounts: Array<{ debit: string; credit: string; amount: number }>;
  };
  message: string;
};

type TabId = "alertas" | "puc" | "muestreo";

function money(n: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

const HELP_STEPS = [
  "Panel DIAN consolida ventas/compras y resalta retenciones omitidas o mal calculadas.",
  "Detalle forense: saldo PUC → factura → presupuesto → OC → almacén → egreso.",
  `Muestreo automático del ${HARD_RULES.REVISORIA_SAMPLE_PCT}% de transacciones del mes.`,
  "Cierre de periodo: dictamen en PDF y bloqueo absoluto del periodo contable.",
  "Navegación rápida: Ctrl/Cmd + K · Ayuda: tecla ?",
];

export default function RevisoriaFiscalDashboardPage() {
  const [dash, setDash] = useState<Dash | null>(null);
  const [flagged, setFlagged] = useState<Flagged[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [drill, setDrill] = useState<Drill | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<TabId>("alertas");
  const [lockOpen, setLockOpen] = useState(false);
  const [pdfRef, setPdfRef] = useState("uploads/dictamen/dictamen-mes.pdf");

  const ym =
    dash?.yearMonth ||
    `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

  const locked = dash?.period.status === "HARD_LOCKED";

  const load = useCallback(async () => {
    try {
      const data = await api.get<Dash>("/api/v1/revisoria-fiscal/dashboard");
      setDash(data);
      const impuestos = await api.get<{ flagged: Flagged[]; message: string }>(
        `/api/v1/revisoria-fiscal/impuestos/validar?yearMonth=${data.yearMonth}`,
      );
      setFlagged(impuestos.flagged);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Conexión fallida");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function openDrill(facturaId: string) {
    setBusy(true);
    setError(null);
    try {
      setDrill(
        await api.get<Drill>(`/api/v1/revisoria-fiscal/drill-down/${facturaId}`),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Detalle forense fallido");
    } finally {
      setBusy(false);
    }
  }

  async function applyHardLock() {
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const res = await api.post<{ status: string; message: string }>(
        "/api/v1/revisoria-fiscal/cierre/hard-lock",
        {
          yearMonth: ym,
          pdfRef,
          opinion: "SIN_SALVEDADES",
          notes: "Dictamen de revisoría — cierre absoluto del periodo",
        },
      );
      setMsg(`${res.status}: ${res.message}`);
      setLockOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cierre de periodo fallido");
    } finally {
      setBusy(false);
    }
  }

  async function exportFmt(format: "csv" | "json" | "xlsx") {
    setBusy(true);
    try {
      const res = await api.get<{
        format: string;
        fileName?: string;
        content?: string;
        payload?: unknown;
        contentHash?: string;
      }>(`/api/v1/revisoria-fiscal/export?format=${format}&yearMonth=${ym}`);
      if (res.content) {
        const blob = new Blob([res.content], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = res.fileName || `truth-hub.${format}`;
        a.click();
        URL.revokeObjectURL(url);
        setMsg(`Export ${format} · hash ${res.contentHash?.slice(0, 12) ?? "—"}`);
      } else {
        const blob = new Blob([JSON.stringify(res.payload, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `truth-hub-${ym}.json`;
        a.click();
        URL.revokeObjectURL(url);
        setMsg("Exportación JSON lista");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Exportación fallida");
    } finally {
      setBusy(false);
    }
  }

  const filteredFlagged = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return flagged;
    return flagged.filter(
      (f) =>
        f.number.toLowerCase().includes(s) ||
        f.issue.toLowerCase().includes(s) ||
        f.detail.toLowerCase().includes(s),
    );
  }, [flagged, q]);

  const filteredPuc = useMemo(() => {
    const tree = dash?.balanceTree ?? [];
    const s = q.trim().toLowerCase();
    if (!s) return tree.slice(0, 24);
    return tree
      .filter(
        (n) =>
          n.code.toLowerCase().includes(s) ||
          n.name.toLowerCase().includes(s),
      )
      .slice(0, 24);
  }, [dash, q]);

  const filteredSample = useMemo(() => {
    const items = dash?.sampling.items ?? [];
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter(
      (i) =>
        i.number.toLowerCase().includes(s) ||
        i.counterparty.toLowerCase().includes(s),
    );
  }, [dash, q]);

  const saleSpark = [42, 48, 45, 52, 58, 55, 61];
  const buySpark = [38, 40, 44, 41, 47, 50, 49];
  const flagSpark = [2, 1, 3, 4, 2, 5, flagged.length || 1];

  return (
    <div className="space-y-5">
      {/* Header operativo — sin muro de protocolo */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-500">
            Revisoría fiscal
          </p>
          <h1 className="text-2xl font-bold text-slate-100">Centro de revisoría</h1>
          <p className="mt-1 font-mono text-xs text-slate-500">
            Periodo {ym} · Ctrl/Cmd+K navegación global
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <StatusPulseBadge tone={locked ? "danger" : "active"} pulse={locked}>
            {locked ? "Cerrado en firme" : statusEs(dash?.period.status || "OPEN")}
          </StatusPulseBadge>
          {(dash?.impuestosSummary.flaggedCount ?? 0) > 0 ? (
            <StatusPulseBadge tone="fatiga">
              FATIGA RETENCIÓN · {dash?.impuestosSummary.flaggedCount}
            </StatusPulseBadge>
          ) : (
            <StatusPulseBadge tone="active" pulse={false}>
              Activo · DIAN correcto
            </StatusPulseBadge>
          )}
          <SlideOverHelp
            title="Cómo operar el centro de revisoría"
            summary="Protocolo forense de cierre e impuestos."
            steps={HELP_STEPS}
          />
          <Button
            type="button"
            variant="secondary"
            className="w-auto px-4 py-2"
            disabled={busy}
            onClick={() => void exportFmt("csv")}
          >
            Export CSV
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="w-auto px-4 py-2"
            disabled={busy}
            onClick={() => void exportFmt("xlsx")}
          >
            Excel
          </Button>
          <Button
            type="button"
            variant="primary"
            className="w-auto px-4 py-2"
            disabled={busy || locked}
            onClick={() => setLockOpen(true)}
          >
            Cierre de periodo
          </Button>
        </div>
      </div>

      {error ? (
        <p className="font-mono text-sm text-[var(--fl-critical)]">{error}</p>
      ) : null}
      {msg ? (
        <p className="font-mono text-sm text-emerald-400">{msg}</p>
      ) : null}

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Ventas DIAN"
          value={money(dash?.impuestosSummary.saleTotal ?? 0)}
          delta="vs mes · tendencia"
          tone="ok"
          spark={saleSpark}
        />
        <KpiCard
          label="Compras DIAN"
          value={money(dash?.impuestosSummary.purchaseTotal ?? 0)}
          delta="vs mes · tendencia"
          tone="neutral"
          spark={buySpark}
        />
        <KpiCard
          label="Alertas retención"
          value={dash?.impuestosSummary.flaggedCount ?? 0}
          delta={flagged.length ? "DANGER · revisar" : "Nominal"}
          tone={(dash?.impuestosSummary.flaggedCount ?? 0) > 0 ? "danger" : "ok"}
          spark={flagSpark}
        />
        <KpiCard
          label="Muestreo"
          value={`${dash?.sampling.sampleSize ?? 0}/${dash?.sampling.population ?? 0}`}
          delta={`${dash?.sampling.samplePct ?? HARD_RULES.REVISORIA_SAMPLE_PCT}% población`}
          tone="warn"
          spark={[3, 4, 5, 4, 6, 5, dash?.sampling.sampleSize ?? 4]}
        />
      </div>

      {/* Filtros + tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-zinc-900/60 px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {(
            [
              ["alertas", "Alertas DIAN"],
              ["puc", "Balance PUC"],
              ["muestreo", "Muestreo"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`w-auto rounded-lg px-3 py-1.5 text-xs font-semibold ${
                tab === id
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "text-slate-400 hover:bg-slate-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filtrar factura, cuenta, tercero…"
          className="w-full max-w-xs rounded-lg border border-slate-800 bg-zinc-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 sm:w-auto"
        />
      </div>

      {/* Tabla / módulo principal */}
      {tab === "alertas" ? (
        filteredFlagged.length === 0 ? (
          <EmptyState
            title="Sin alertas de retención"
            description="El pre-validador DIAN no marcó omisiones en el periodo. Use el cierre de periodo cuando el dictamen esté listo."
            actionLabel="Abrir cierre de periodo"
            onAction={() => setLockOpen(true)}
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-800 bg-zinc-900/80 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Factura</th>
                  <th className="px-4 py-3">Issue</th>
                  <th className="px-4 py-3">Detalle</th>
                  <th className="px-4 py-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {filteredFlagged.map((f) => (
                  <tr
                    key={f.invoiceId}
                    className="border-b border-slate-800/80 bg-zinc-950/40"
                  >
                    <td className="px-4 py-3 font-mono text-slate-200">
                      {f.number}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPulseBadge tone="danger">{f.issue}</StatusPulseBadge>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{f.detail}</td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        className="w-auto px-3 py-1.5"
                        disabled={busy}
                        onClick={() => void openDrill(f.invoiceId)}
                      >
                        Ver detalle
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      {tab === "puc" ? (
        filteredPuc.length === 0 ? (
          <EmptyState
            title="Sin cuentas PUC en ventana"
            description="Ajuste el filtro o sincronice el libro mayor del periodo."
          />
        ) : (
          <div className="space-y-2">
            {filteredPuc.map((node) => (
              <div
                key={node.id}
                className="rounded-xl border border-slate-800 bg-zinc-900/70"
              >
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-4 py-3 text-left"
                  onClick={() =>
                    setExpanded(expanded === node.id ? null : node.id)
                  }
                >
                  <span className="font-mono text-sm text-slate-200">
                    {node.code} · {node.name}
                  </span>
                  <span className="font-mono text-xs text-amber-400">
                    {money(node.balance)}
                  </span>
                </button>
                {expanded === node.id ? (
                  node.invoices.length === 0 ? (
                    <div className="border-t border-slate-800 px-4 py-3">
                      <EmptyState
                        title="Sin facturas vinculadas"
                        description="No hay movimientos en esta cuenta para la ventana actual."
                      />
                    </div>
                  ) : (
                    <ul className="border-t border-slate-800 px-4 py-2">
                      {node.invoices.map((inv) => (
                        <li
                          key={inv.id}
                          className="flex items-center justify-between py-2 font-mono text-xs text-slate-400"
                        >
                          <span>
                            {inv.number} · {inv.counterparty}
                          </span>
                          <Button
                            variant="ghost"
                            className="w-auto px-2 py-1 text-emerald-400"
                            onClick={() => void openDrill(inv.id)}
                          >
                            {money(inv.amount)} →
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )
                ) : null}
              </div>
            ))}
          </div>
        )
      ) : null}

      {tab === "muestreo" ? (
        filteredSample.length === 0 ? (
          <EmptyState
            title="Bandeja de muestreo vacía"
            description="Aún no hay ítems seleccionados para revisión forense este mes."
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-800 bg-zinc-900/80 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Documento</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Tercero</th>
                  <th className="px-4 py-3 text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {filteredSample.map((i) => (
                  <tr
                    key={i.id}
                    className="cursor-pointer border-b border-slate-800/80 hover:bg-slate-900/60"
                    onClick={() => void openDrill(i.id)}
                  >
                    <td className="px-4 py-3 font-mono text-slate-200">
                      {i.number}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{i.type}</td>
                    <td className="px-4 py-3 text-slate-400">{i.counterparty}</td>
                    <td className="px-4 py-3 text-right font-mono text-amber-400">
                      {money(i.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      {/* Drill-down modal */}
      <Modal
        open={!!drill}
        onClose={() => setDrill(null)}
        title={drill ? `Cadena de evidencia · ${drill.invoice.number}` : "Detalle forense"}
        description={drill?.message}
        footer={
          <Button className="w-auto px-4 py-2" onClick={() => setDrill(null)}>
            Cerrar
          </Button>
        }
      >
        {drill ? (
          <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-200">
            <li>
              Firma presupuesto:{" "}
              <span className="font-mono text-amber-400">
                {drill.thread.budgetSignature ?? "—"}
              </span>
            </li>
            <li>
              OC:{" "}
              {drill.thread.purchaseOrder
                ? `${drill.thread.purchaseOrder.code} · ${drill.thread.purchaseOrder.status} · ${drill.thread.purchaseOrder.approvedBy ?? "—"}`
                : "Sin OC"}
            </li>
            <li>
              Almacén:{" "}
              {drill.thread.warehouseReceipts.map((g) => g.code).join(", ") ||
                "Sin remisión"}
            </li>
            <li>
              Egreso:{" "}
              {drill.thread.egreso
                .map((e) => `${statusEs(e.status)} ${money(e.amount)}`)
                .join(" · ") || "Sin comprobante"}
            </li>
          </ol>
        ) : null}
      </Modal>

      {/* Hard Lock form en Modal */}
      <Modal
        open={lockOpen}
        onClose={() => setLockOpen(false)}
        title="Dictamen y cierre de periodo"
        description={`Sella el periodo ${ym}. Acción irreversible en la red.`}
        footer={
          <>
            <Button
              className="w-auto px-4 py-2"
              variant="ghost"
              onClick={() => setLockOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              className="w-auto px-4 py-2"
              variant="primary"
              disabled={busy || locked}
              onClick={() => void applyHardLock()}
            >
              {locked ? "Periodo sellado" : "Aplicar cierre de periodo"}
            </Button>
          </>
        }
      >
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
          PDF dictamen
        </label>
        <input
          value={pdfRef}
          onChange={(e) => setPdfRef(e.target.value)}
          className="mt-2 w-full rounded-lg border border-slate-800 bg-zinc-950 px-3 py-2 font-mono text-sm text-slate-200"
          placeholder="uploads/dictamen/…"
        />
        {dash?.period.dictamen ? (
          <p className="mt-3 font-mono text-xs text-slate-500">
            Dictamen {dash.period.dictamen.opinion} · hash{" "}
            {dash.period.dictamen.signatureHash.slice(0, 16)}… ·{" "}
            {dash.period.dictamen.pdfRef}
          </p>
        ) : null}
      </Modal>
    </div>
  );
}
