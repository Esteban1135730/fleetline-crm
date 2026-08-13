"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { HARD_RULES } from "@fsg/shared";
import { api } from "@/lib/api";
import { HowToBox, PageIntro } from "@/components/page-intro";

type PucNode = {
  id: string;
  code: string;
  name: string;
  type: string;
  balance: number;
  invoices: Array<{
    id: string;
    number: string;
    amount: number;
    type: string;
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

function money(n: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function RevisoriaFiscalDashboardPage() {
  const [dash, setDash] = useState<Dash | null>(null);
  const [flagged, setFlagged] = useState<Flagged[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [drill, setDrill] = useState<Drill | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pdfRef, setPdfRef] = useState("uploads/dictamen/dictamen-mes.pdf");

  const ym =
    dash?.yearMonth ||
    `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

  const load = useCallback(async () => {
    try {
      const data = await api.get<Dash>("/api/v1/revisoria-fiscal/dashboard");
      setDash(data);
      const impuestos = await api.get<{
        flagged: Flagged[];
        message: string;
      }>(`/api/v1/revisoria-fiscal/impuestos/validar?yearMonth=${data.yearMonth}`);
      setFlagged(impuestos.flagged);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Uplink fallido");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function openDrill(facturaId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await api.get<Drill>(
        `/api/v1/revisoria-fiscal/drill-down/${facturaId}`,
      );
      setDrill(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Drill-down fallido");
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
          notes: "Dictamen Truth Hub — cierre absoluto del periodo",
        },
      );
      setMsg(`${res.status}: ${res.message}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hard Lock fallido");
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
      }>(
        `/api/v1/revisoria-fiscal/export?format=${format}&yearMonth=${ym}`,
      );
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
        setMsg(`Export JSON listo`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export fallido");
    } finally {
      setBusy(false);
    }
  }

  const locked = dash?.period.status === "HARD_LOCKED";

  return (
    <div className="space-y-8">
      <PageIntro module="revisoria_fiscal" title="Truth Hub" />
      <HowToBox
        steps={[
          "Panel DIAN consolida ventas/compras y resalta retenciones omitidas o mal calculadas.",
          "Drill-down forense: saldo PUC → factura → presupuesto → OC → almacén → egreso.",
          `Muestreo automático del ${HARD_RULES.REVISORIA_SAMPLE_PCT}% de transacciones del mes.`,
          "Hard Lock: dictamen PDF + bloqueo absoluto del periodo contable.",
        ]}
      />

      {error && (
        <p className="font-mono text-sm text-[var(--fl-critical)]">{error}</p>
      )}
      {msg && (
        <p className="font-mono text-sm text-[var(--fl-accent)]">{msg}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => void exportFmt("csv")}>
          Export CSV
        </Button>
        <Button disabled={busy} onClick={() => void exportFmt("xlsx")}>
          Export Excel
        </Button>
        <Button disabled={busy} onClick={() => void exportFmt("json")}>
          Export PDF/JSON
        </Button>
        <Badge tone={locked ? "rose" : "emerald"}>
          {locked ? "HARD LOCKED" : dash?.period.status || "OPEN"}
        </Badge>
      </div>

      {/* Impuestos DIAN */}
      <section id="impuestos" className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--fl-text)]">
          Panel de Impuestos DIAN · {ym}
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <article className="rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-4">
            <p className="text-xs text-[var(--fl-subtext)]">Ventas</p>
            <p className="font-mono text-lg text-[var(--fl-text)]">
              {money(dash?.impuestosSummary.saleTotal ?? 0)}
            </p>
          </article>
          <article className="rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-4">
            <p className="text-xs text-[var(--fl-subtext)]">Compras</p>
            <p className="font-mono text-lg text-[var(--fl-text)]">
              {money(dash?.impuestosSummary.purchaseTotal ?? 0)}
            </p>
          </article>
          <article className="rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-4">
            <p className="text-xs text-[var(--fl-subtext)]">Alertas retención</p>
            <p className="font-mono text-lg text-[var(--fl-critical)]">
              {dash?.impuestosSummary.flaggedCount ?? 0}
            </p>
          </article>
        </div>
        <ul className="space-y-2">
          {flagged.map((f) => (
            <li
              key={f.invoiceId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--fl-critical)]/40 bg-[var(--fl-critical)]/10 px-4 py-3"
            >
              <div>
                <p className="font-mono text-sm text-[var(--fl-text)]">
                  {f.number} · {f.issue}
                </p>
                <p className="text-xs text-[var(--fl-subtext)]">{f.detail}</p>
              </div>
              <Button
                disabled={busy}
                onClick={() => void openDrill(f.invoiceId)}
              >
                Drill-down
              </Button>
            </li>
          ))}
          {!flagged.length && (
            <li className="text-sm text-[var(--fl-subtext)]">
              Sin alertas de retención en el mes.
            </li>
          )}
        </ul>
      </section>

      {/* Balance PUC */}
      <section id="balance" className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--fl-text)]">
          Balance Interactivo PUC
        </h2>
        <div className="space-y-2">
          {(dash?.balanceTree ?? []).slice(0, 24).map((node) => (
            <div
              key={node.id}
              className="rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)]"
            >
              <button
                type="button"
                className="flex w-full items-center justify-between px-4 py-3 text-left"
                onClick={() =>
                  setExpanded(expanded === node.id ? null : node.id)
                }
              >
                <span className="font-mono text-sm text-[var(--fl-text)]">
                  {node.code} · {node.name}
                </span>
                <span className="font-mono text-xs text-[var(--fl-amber)]">
                  {money(node.balance)}
                </span>
              </button>
              {expanded === node.id && (
                <ul className="border-t border-[var(--fl-border)] px-4 py-2">
                  {node.invoices.map((inv) => (
                    <li
                      key={inv.id}
                      className="flex items-center justify-between py-2 font-mono text-xs text-[var(--fl-subtext)]"
                    >
                      <span>
                        {inv.number} · {inv.counterparty}
                      </span>
                      <button
                        type="button"
                        className="text-[var(--fl-accent)]"
                        onClick={() => void openDrill(inv.id)}
                      >
                        {money(inv.amount)} →
                      </button>
                    </li>
                  ))}
                  {!node.invoices.length && (
                    <li className="py-2 text-xs text-[var(--fl-subtext)]">
                      Sin facturas vinculadas en ventana.
                    </li>
                  )}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Muestreo */}
      <section id="muestreo" className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--fl-text)]">
          Bandeja de Muestreo ({dash?.sampling.samplePct ?? 5}% ·{" "}
          {dash?.sampling.sampleSize ?? 0}/{dash?.sampling.population ?? 0})
        </h2>
        <ul className="grid gap-2 md:grid-cols-2">
          {(dash?.sampling.items ?? []).map((i) => (
            <li
              key={i.id}
              className="rounded-lg border border-[var(--fl-border)] bg-[var(--fl-surface)] px-4 py-3 font-mono text-xs"
            >
              <button
                type="button"
                className="w-full text-left text-[var(--fl-text)]"
                onClick={() => void openDrill(i.id)}
              >
                {i.number} · {i.type} · {money(i.amount)}
                <span className="mt-1 block text-[var(--fl-subtext)]">
                  {i.counterparty}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Drill-down panel */}
      {drill && (
        <section className="space-y-3 rounded-xl border border-[var(--fl-accent)]/40 bg-[var(--fl-surface)] p-5">
          <h2 className="text-lg font-semibold text-[var(--fl-text)]">
            Hilo de Ariadna · {drill.invoice.number}
          </h2>
          <p className="text-sm text-[var(--fl-subtext)]">{drill.message}</p>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-[var(--fl-text)]">
            <li>
              Firma presupuesto:{" "}
              <span className="font-mono text-[var(--fl-amber)]">
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
              {drill.thread.warehouseReceipts
                .map((g) => g.code)
                .join(", ") || "Sin remisión"}
            </li>
            <li>
              Egreso:{" "}
              {drill.thread.egreso
                .map((e) => `${e.status} ${money(e.amount)}`)
                .join(" · ") || "Sin comprobante"}
            </li>
          </ol>
        </section>
      )}

      {/* Cierre */}
      <section id="cierre" className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--fl-text)]">
          Dictamen y Hard Lock
        </h2>
        <div className="flex flex-wrap gap-2">
          <input
            value={pdfRef}
            onChange={(e) => setPdfRef(e.target.value)}
            className="min-w-[280px] flex-1 rounded-lg border border-[var(--fl-border)] bg-[var(--fl-surface)] px-3 py-2 font-mono text-sm"
            placeholder="PDF dictamen"
          />
          <Button
            disabled={busy || locked}
            onClick={() => void applyHardLock()}
          >
            {locked ? "Periodo sellado" : "Aplicar Hard Lock"}
          </Button>
        </div>
        {dash?.period.dictamen && (
          <p className="font-mono text-xs text-[var(--fl-subtext)]">
            Dictamen {dash.period.dictamen.opinion} · hash{" "}
            {dash.period.dictamen.signatureHash.slice(0, 16)}… ·{" "}
            {dash.period.dictamen.pdfRef}
          </p>
        )}
      </section>
    </div>
  );
}
