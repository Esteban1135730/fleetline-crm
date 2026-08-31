"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import {
  FileCheck,
  FileText,
  Landmark,
  RefreshCw,
  Scale,
} from "lucide-react";
import { api } from "@/lib/api";
import { statusEs } from "@fsg/shared";
import { EmptyState, SlideOver } from "@/components/audit";
import { BentoPanel } from "@/components/nexa/bento-panel";
import { NexaTable, NexaRow, NexaCell } from "@/components/nexa/nexa-table";

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
  const [selectedFactura, setSelectedFactura] = useState<
    Dash["kanban"]["facturasPorRadicar"][0] | null
  >(null);
  const [matchOpen, setMatchOpen] = useState(false);
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
      const out = await api<MatchResult>(
        "/api/v1/contabilidad/facturas/3way-match",
        {
          method: "POST",
          body: JSON.stringify({
            purchaseOrderId: poId,
            goodsReceiptId: receiptId,
            invoiceId: selectedFactura.id,
            action,
          }),
        },
      );
      setMatchOut(out);
      if (out.causarBlocked) {
        setInfo(
          `Bloqueo de cruce triple · ${out.blockReason || out.reasons?.join("; ") || "discrepancia de valor"}`,
        );
      } else if (action === "CAUSAR") {
        setInfo("Factura causada — liberada a cola de Tesorería");
        setMatchOpen(false);
        setSelectedFactura(null);
      } else if (action === "DEVOLVER") {
        setInfo("Factura devuelta al proveedor");
        setMatchOpen(false);
        setSelectedFactura(null);
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
                description: "PAGO PROVEEDOR",
                amount: -150000,
                externalRef: "FAC-001",
              },
            ],
          }),
        },
      );
      setInfo(
        `Auto-Match · ${out.matchedCount} emparejadas · ${out.unmatchedCount} pendientes`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de conciliación");
    }
  }

  function openMatch(f: Dash["kanban"]["facturasPorRadicar"][0]) {
    setSelectedFactura(f);
    setMatchOut(null);
    setPoId("");
    setReceiptId("");
    setMatchOpen(true);
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-border pb-4">
        <div>
          <p className="font-data text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-primary">
            Contabilidad · Auxiliar
          </p>
          <h1 className="font-sans text-2xl font-semibold tracking-tight text-brand-text-primary md:text-3xl">
            Auxiliar contable · operación
          </h1>
          <p className="mt-1 font-sans text-sm text-brand-text-secondary">
            Radicación · cruce triple · conciliación bancaria
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="success">
            Procesados hoy: {dash?.productivity.documentsProcessedToday ?? 0}
          </Badge>
          <span className="font-data text-xs tabular-nums text-brand-text-secondary">
            {dash?.productivity.workDate}
          </span>
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
      {info ? (
        <p className="rounded-lg border border-brand-success/30 bg-brand-success/10 px-3 py-2 text-sm text-brand-success">
          {info}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <BentoPanel
          id="facturas"
          title="Facturas por radicar"
          subtitle="Bandeja de entrada"
          icon={<FileText aria-hidden />}
        >
          {!dash?.kanban.facturasPorRadicar?.length ? (
            <EmptyState title="Sin pendientes" description="Bandeja limpia." />
          ) : (
            <NexaTable columns={["Factura", "Proveedor", "Monto", ""]}>
              {(dash?.kanban.facturasPorRadicar || []).map((f) => (
                <NexaRow
                  key={f.id}
                  active={selectedFactura?.id === f.id}
                  onClick={() => openMatch(f)}
                >
                  <NexaCell mono className="text-xs">
                    {f.number}
                    <span className="mt-0.5 block text-brand-text-secondary">
                      {f.supportHint}
                    </span>
                  </NexaCell>
                  <NexaCell>{f.counterparty}</NexaCell>
                  <NexaCell mono>{money(f.amount)}</NexaCell>
                  <NexaCell>
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-auto px-2 py-1 text-[10px]"
                      onClick={(e) => {
                        e.stopPropagation();
                        openMatch(f);
                      }}
                    >
                      Cruzar
                    </Button>
                  </NexaCell>
                </NexaRow>
              ))}
            </NexaTable>
          )}
        </BentoPanel>

        <BentoPanel
          id="legalizaciones"
          title="Anticipos por legalizar"
          subtitle="Conductores · viáticos"
          icon={<Scale aria-hidden />}
        >
          {!dash?.kanban.anticiposPorLegalizar?.length ? (
            <EmptyState title="Sin anticipos" description="Sin pendientes." />
          ) : (
            <NexaTable
              columns={["Código", "Conductor", "Anticipo", "Gastos", "Líneas"]}
            >
              {(dash?.kanban.anticiposPorLegalizar || []).map((l) => (
                <NexaRow key={l.id}>
                  <NexaCell mono className="text-xs">
                    {l.code}
                  </NexaCell>
                  <NexaCell>{l.driverName || "Conductor"}</NexaCell>
                  <NexaCell mono>{money(l.advanceAmount)}</NexaCell>
                  <NexaCell mono>{money(l.expensesTotal)}</NexaCell>
                  <NexaCell mono>{l.linesCount}</NexaCell>
                </NexaRow>
              ))}
            </NexaTable>
          )}
        </BentoPanel>

        <BentoPanel
          id="conciliacion"
          title="Transacciones por conciliar"
          subtitle="Extracto bancario"
          icon={<Landmark aria-hidden />}
        >
          {!dash?.kanban.transaccionesPorConciliar?.length ? (
            <EmptyState
              title="Sin líneas pendientes"
              description="Ejecute Auto-Match o importe extracto."
              actionLabel="Ejecutar Auto-Match"
              onAction={() => {
                const form = document.getElementById(
                  "aux-auto-match",
                ) as HTMLFormElement | null;
                form?.requestSubmit();
              }}
            />
          ) : (
            <NexaTable columns={["Descripción", "Monto", "Banco"]}>
              {(dash?.kanban.transaccionesPorConciliar || []).map((t) => (
                <NexaRow key={t.id}>
                  <NexaCell className="text-xs">{t.description}</NexaCell>
                  <NexaCell mono>{money(t.amount)}</NexaCell>
                  <NexaCell className="text-xs text-brand-text-secondary">
                    {t.bankName || "Banco"}
                  </NexaCell>
                </NexaRow>
              ))}
            </NexaTable>
          )}
          <form
            id="aux-auto-match"
            onSubmit={onAutoMatch}
            className="mt-3 flex justify-end"
          >
            <Button type="submit" variant="ghost" className="w-auto text-xs">
              Ejecutar Auto-Match
            </Button>
          </form>
        </BentoPanel>
      </div>

      <BentoPanel
        title="Cartera clientes"
        subtitle="Solo lectura · saldo CxC"
        icon={<FileCheck aria-hidden />}
      >
        {!dash?.carteraReadonly?.length ? (
          <EmptyState title="Sin cartera indexada" description="CxC vacía." />
        ) : (
          <NexaTable columns={["Factura", "Cliente", "Monto", "Estado"]}>
            {(dash?.carteraReadonly || []).map((c) => (
              <NexaRow key={c.id}>
                <NexaCell mono className="text-xs">
                  {c.number}
                </NexaCell>
                <NexaCell>{c.counterparty}</NexaCell>
                <NexaCell mono>{money(c.amount)}</NexaCell>
                <NexaCell>{statusEs(c.status)}</NexaCell>
              </NexaRow>
            ))}
          </NexaTable>
        )}
      </BentoPanel>

      <SlideOver
        open={matchOpen}
        onClose={() => {
          setMatchOpen(false);
          setSelectedFactura(null);
          setMatchOut(null);
        }}
        title={
          selectedFactura
            ? `Cruce triple · ${selectedFactura.number}`
            : "Validación de cruce triple"
        }
        description="OC + remisión + factura · discrepancia bloquea causación"
        widthClass="max-w-2xl"
        footer={
          selectedFactura ? (
            <>
              <Button
                type="button"
                variant="ghost"
                className="w-auto px-4 py-2"
                onClick={() => void runMatch("DEVOLVER")}
              >
                Devolver proveedor
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="w-auto px-4 py-2"
                disabled={!poId || !receiptId}
                onClick={() => void runMatch("MATCH")}
              >
                Validar match
              </Button>
              <Button
                type="button"
                variant="primary"
                className="w-auto px-4 py-2"
                disabled={!matchOut?.causarEnabled}
                onClick={() => void runMatch("CAUSAR")}
              >
                Causar factura
              </Button>
            </>
          ) : null
        }
      >
        {selectedFactura ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="mb-2 font-data text-[10px] uppercase tracking-wider text-brand-text-secondary">
                Soporte · PDF / XML
              </p>
              <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-dashed border-brand-border bg-brand-surface-elevated/30">
                <div className="text-center">
                  <p className="font-data text-sm text-brand-text-primary">
                    {selectedFactura.number}
                  </p>
                  <p className="mt-1 text-xs text-brand-text-secondary">
                    {selectedFactura.supportHint} ·{" "}
                    {selectedFactura.counterparty}
                  </p>
                  <p className="mt-3 font-data text-lg tabular-nums">
                    {money(selectedFactura.amount)}
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <label className="flex flex-col gap-1 font-data text-[10px] uppercase tracking-wider text-brand-text-secondary">
                Orden de compra
                <input
                  className="field font-data"
                  placeholder="Número OC"
                  value={poId}
                  onChange={(e) => setPoId(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 font-data text-[10px] uppercase tracking-wider text-brand-text-secondary">
                Entrada almacén / remisión
                <input
                  className="field font-data"
                  placeholder="Número remisión"
                  value={receiptId}
                  onChange={(e) => setReceiptId(e.target.value)}
                />
              </label>
              {matchOut ? (
                <div className="rounded-lg border border-brand-border p-3 text-xs">
                  <p className="font-data tabular-nums">
                    Resultado: {statusEs(matchOut.status)} · Δ precio{" "}
                    {matchOut.priceDelta ?? "—"}
                  </p>
                  {matchOut.causarBlocked ? (
                    <div className="mt-2">
                      <Badge tone="danger">Causación bloqueada</Badge>
                    </div>
                  ) : matchOut.causarEnabled ? (
                    <div className="mt-2">
                      <Badge tone="success">Listo para causar</Badge>
                    </div>
                  ) : null}
                  {matchOut.reasons?.length ? (
                    <ul className="mt-2 list-disc pl-4 text-brand-text-secondary">
                      {matchOut.reasons.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </SlideOver>
    </div>
  );
}
