"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { api } from "@/lib/api";
import { statusEs } from "@fsg/shared";
import { HowToBox, PageIntro } from "@/components/page-intro";

type Dash = {
  kanban: {
    facturasPorRadicar: Array<{
      id: string;
      number: string;
      counterparty: string;
      amount: number;
      status: string;
      supportHint: string;
    }>;
    anticiposPorLegalizar: Array<{
      id: string;
      code: string;
      driverName: string | null;
      advanceAmount: number;
      expensesTotal: number;
      status: string;
      linesCount: number;
    }>;
    transaccionesPorConciliar: Array<{
      id: string;
      description: string;
      amount: number;
      statementId: string;
      bankName: string | null;
    }>;
  };
  carteraReadonly: Array<{
    id: string;
    number: string;
    counterparty: string;
    amount: number;
    status: string;
  }>;
  productivity: { documentsProcessedToday: number; workDate: string };
};

type MatchResult = {
  status: string;
  causarEnabled?: boolean;
  causarBlocked?: boolean;
  reasons?: string[];
  priceDelta?: number;
  blockReason?: string | null;
};

function money(n: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function AuxiliarContableDashboardPage() {
  const [dash, setDash] = useState<Dash | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [selectedFactura, setSelectedFactura] = useState<Dash["kanban"]["facturasPorRadicar"][0] | null>(null);
  const [poId, setPoId] = useState("");
  const [receiptId, setReceiptId] = useState("");
  const [matchOut, setMatchOut] = useState<MatchResult | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const d = await api<Dash>("/api/v1/contabilidad/auxiliar/dashboard");
      setDash(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Conexión contable fallida");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runMatch(action: "MATCH" | "CAUSAR" | "DEVOLVER") {
    if (!selectedFactura) return;
    setError("");
    setInfo("");
    try {
      const out = await api<MatchResult>("/api/v1/contabilidad/facturas/3way-match", {
        method: "POST",
        body: JSON.stringify({
          purchaseOrderId: poId,
          goodsReceiptId: receiptId,
          invoiceId: selectedFactura.id,
          action,
        }),
      });
      setMatchOut(out);
      if (out.causarBlocked) {
        setInfo(
          `Bloqueo de cruce triple · ${out.blockReason || out.reasons?.join("; ") || "discrepancia de valor"}`,
        );
      } else if (action === "CAUSAR") {
        setInfo("Factura causada — liberada a cola de Tesorería");
      } else if (action === "DEVOLVER") {
        setInfo("Factura devuelta al proveedor");
      } else if (out.causarEnabled) {
        setInfo("Cruce correcto — causación habilitada");
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error en el cruce triple");
    }
  }

  async function onAutoMatch(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const out = await api<{ matchedCount: number; unmatchedCount: number }>(
        "/api/v1/contabilidad/conciliacion/auto-match",
        {
          method: "POST",
          body: JSON.stringify({
            bankName: "Bancolombia",
            closeDaily: false,
            rows: [
              {
                description: "PAGO PROVEEDOR DEMO",
                amount: -150000,
                externalRef: "FAC-DEMO",
              },
            ],
          }),
        },
      );
      setInfo(`Auto-Match · ${out.matchedCount} emparejadas · ${out.unmatchedCount} pendientes`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de conciliación");
    }
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-5">
      <PageIntro module="contabilidad" title="Auxiliar contable · operación" />
      <HowToBox
        steps={[
          "Tablero: facturas por radicar, anticipos por legalizar, extractos por conciliar.",
          "Pantalla partida: soporte a la izquierda, captura de cruce triple a la derecha.",
          "Causar solo si OC + remisión + factura coinciden; discrepancia bloquea.",
        ]}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Badge tone="emerald">
          Procesados hoy: {dash?.productivity.documentsProcessedToday ?? 0}
        </Badge>
        <span className="font-mono text-xs text-[var(--text-secondary)]">
          {dash?.productivity.workDate}
        </span>
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
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-300">
          {error}
        </p>
      ) : null}
      {info ? (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          {info}
        </p>
      ) : null}

      {/* Kanban */}
      <div className="grid gap-4 lg:grid-cols-3">
        <section id="facturas" className="space-y-2">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            Facturas por radicar
          </h2>
          <div className="min-h-[200px] space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
            {(dash?.kanban.facturasPorRadicar || []).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  setSelectedFactura(f);
                  setMatchOut(null);
                }}
                className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                  selectedFactura?.id === f.id
                    ? "border-teal-500/50 bg-teal-500/10"
                    : "border-[var(--border-subtle)] hover:bg-black/5 dark:hover:bg-white/5"
                }`}
              >
                <p className="font-mono text-xs text-[var(--text-secondary)]">
                  {f.number} · {f.supportHint}
                </p>
                <p className="text-sm text-[var(--text-primary)]">{f.counterparty}</p>
                <p className="font-mono text-sm">{money(f.amount)}</p>
              </button>
            ))}
            {!dash?.kanban.facturasPorRadicar?.length ? (
              <p className="py-6 text-center text-sm text-[var(--text-secondary)]">
                Sin pendientes
              </p>
            ) : null}
          </div>
        </section>

        <section id="legalizaciones" className="space-y-2">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            Anticipos por legalizar
          </h2>
          <div className="min-h-[200px] space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
            {(dash?.kanban.anticiposPorLegalizar || []).map((l) => (
              <article
                key={l.id}
                className="rounded-lg border border-[var(--border-subtle)] px-3 py-2"
              >
                <p className="font-mono text-xs text-[var(--text-secondary)]">{l.code}</p>
                <p className="text-sm text-[var(--text-primary)]">
                  {l.driverName || "Conductor"}
                </p>
                <p className="font-mono text-xs">
                  Anticipo {money(l.advanceAmount)} · gastos {money(l.expensesTotal)}
                </p>
              </article>
            ))}
            {!dash?.kanban.anticiposPorLegalizar?.length ? (
              <p className="py-6 text-center text-sm text-[var(--text-secondary)]">
                Sin anticipos
              </p>
            ) : null}
          </div>
        </section>

        <section id="conciliacion" className="space-y-2">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            Transacciones por conciliar
          </h2>
          <div className="min-h-[200px] space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
            {(dash?.kanban.transaccionesPorConciliar || []).map((t) => (
              <article
                key={t.id}
                className="rounded-lg border border-[var(--border-subtle)] px-3 py-2"
              >
                <p className="text-sm text-[var(--text-primary)]">{t.description}</p>
                <p className="font-mono text-xs">
                  {money(t.amount)} · {t.bankName || "Banco"}
                </p>
              </article>
            ))}
            {!dash?.kanban.transaccionesPorConciliar?.length ? (
              <p className="py-6 text-center text-sm text-[var(--text-secondary)]">
                Sin líneas pendientes
              </p>
            ) : null}
            <form onSubmit={onAutoMatch}>
              <Button type="submit" className="text-xs">
                Ejecutar Auto-Match demo
              </Button>
            </form>
          </div>
        </section>
      </div>

      {/* Split-screen */}
      {selectedFactura ? (
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
            <h3 className="mb-3 text-sm font-semibold">Soporte · PDF / XML</h3>
            <div className="flex min-h-[280px] items-center justify-center rounded-lg border border-dashed border-[var(--border-subtle)] bg-black/5 dark:bg-white/5">
              <div className="text-center">
                <p className="font-mono text-sm text-[var(--text-primary)]">
                  {selectedFactura.number}
                </p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  Visor {selectedFactura.supportHint} · {selectedFactura.counterparty}
                </p>
                <p className="mt-3 font-mono text-lg">{money(selectedFactura.amount)}</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
            <h3 className="mb-3 text-sm font-semibold">Validación de cruce triple</h3>
            <div className="space-y-3">
              <input
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-sm"
                placeholder="Número de orden de compra"
                value={poId}
                onChange={(e) => setPoId(e.target.value)}
              />
              <input
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-sm"
                placeholder="Número de entrada de almacén / remisión"
                value={receiptId}
                onChange={(e) => setReceiptId(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={!poId || !receiptId}
                  onClick={() => void runMatch("MATCH")}
                >
                  Validar match
                </Button>
                <Button
                  type="button"
                  disabled={!matchOut?.causarEnabled}
                  onClick={() => void runMatch("CAUSAR")}
                >
                  Causar factura
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => void runMatch("DEVOLVER")}
                >
                  Devolver proveedor
                </Button>
              </div>
              {matchOut ? (
                <div className="rounded-lg border border-[var(--border-subtle)] p-3 text-xs">
                  <p className="font-mono">
                    Resultado: {statusEs(matchOut.status)} · Δ precio {matchOut.priceDelta ?? "—"}
                  </p>
                  {matchOut.causarBlocked ? (
                    <Badge tone="rose">Causación bloqueada</Badge>
                  ) : matchOut.causarEnabled ? (
                    <Badge tone="emerald">Listo para causar</Badge>
                  ) : null}
                  {matchOut.reasons?.length ? (
                    <ul className="mt-2 list-disc pl-4 text-[var(--text-secondary)]">
                      {matchOut.reasons.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {/* Cartera solo lectura */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          Cartera clientes (solo lectura)
        </h2>
        <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--border-subtle)] text-xs text-[var(--text-secondary)]">
              <tr>
                <th className="px-3 py-2">Factura</th>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Monto</th>
                <th className="px-3 py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {(dash?.carteraReadonly || []).map((c) => (
                <tr key={c.id} className="border-b border-[var(--border-subtle)]/50">
                  <td className="px-3 py-2 font-mono text-xs">{c.number}</td>
                  <td className="px-3 py-2">{c.counterparty}</td>
                  <td className="px-3 py-2 font-mono">{money(c.amount)}</td>
                  <td className="px-3 py-2">{statusEs(c.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
