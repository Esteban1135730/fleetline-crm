"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import {
  BookOpen,
  FileCheck,
  FileSpreadsheet,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { api } from "@/lib/api";
import { EmptyState, SlideOver } from "@/components/audit";
import { BentoPanel } from "@/components/nexa/bento-panel";
import { NexaTable, NexaRow, NexaCell } from "@/components/nexa/nexa-table";
import { WorkbenchSearch, WorkbenchToolbar } from "@/components/workbench-toolbar";

type Dash = {
  kpis: {
    totalFacturadoMes: number;
    totalCarteraCxc: number;
    gastosRutaPendientes: number;
  };
  libroDiario: Array<{
    id: string;
    memo: string;
    postedAt: string;
    lines: Array<{
      amount: number;
      debit: string;
      debitName?: string;
      credit: string;
      creditName?: string;
      costCenterPlate: string | null;
    }>;
  }>;
  bandeja: {
    peajesPendientes: Array<{
      id: string;
      plate: string;
      kind: string;
      amount: number;
      photoRef: string | null;
      aiExtracted: Record<string, unknown> | null;
      driverName: string | null;
    }>;
    facturasRecurrentes: Array<{
      id: string;
      name: string;
      nit: string;
      segment: string;
    }>;
  };
  customers: Array<{ id: string; name: string; nit: string }>;
};

function money(n: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function GestorContableDashboardPage() {
  const [dash, setDash] = useState<Dash | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [plateFilter, setPlateFilter] = useState("");
  const [pucFilter, setPucFilter] = useState("");
  const [selectedExpense, setSelectedExpense] = useState<
    Dash["bandeja"]["peajesPendientes"][0] | null
  >(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [facturacionOpen, setFacturacionOpen] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [periodFrom, setPeriodFrom] = useState(() => {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
      .toISOString()
      .slice(0, 10);
  });
  const [periodTo, setPeriodTo] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );

  const load = useCallback(async () => {
    setError("");
    try {
      const d = await api<Dash>("/api/v1/contabilidad/gestor/dashboard");
      setDash(d);
      if (!customerId && d.customers[0]) setCustomerId(d.customers[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Conexión contable fallida");
    }
  }, [customerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const diario = useMemo(() => {
    const rows = dash?.libroDiario || [];
    return rows.filter((j) => {
      const plateOk =
        !plateFilter ||
        j.lines.some((l) =>
          (l.costCenterPlate || "")
            .toUpperCase()
            .includes(plateFilter.toUpperCase()),
        );
      const pucOk =
        !pucFilter ||
        j.lines.some(
          (l) => l.debit.includes(pucFilter) || l.credit.includes(pucFilter),
        );
      return plateOk && pucOk;
    });
  }, [dash, plateFilter, pucFilter]);

  const diarioRows = useMemo(
    () =>
      diario.flatMap((j) =>
        j.lines.flatMap((l, idx) => [
          {
            id: `${j.id}-${idx}-d`,
            accountCode: l.debit,
            accountName: l.debitName || "",
            referencia: j.memo,
            debe: l.amount,
            haber: 0,
          },
          {
            id: `${j.id}-${idx}-c`,
            accountCode: l.credit,
            accountName: l.creditName || "",
            referencia: j.memo,
            debe: 0,
            haber: l.amount,
          },
        ]),
      ),
    [diario],
  );

  async function aprobarGasto(approve: boolean) {
    if (!selectedExpense) return;
    setError("");
    try {
      await api("/api/v1/contabilidad/gastos-ruta/aprobar", {
        method: "POST",
        body: JSON.stringify({
          expenseId: selectedExpense.id,
          approve,
          rejectReason: approve ? undefined : "Soporte ilegible",
        }),
      });
      setInfo(
        approve
          ? `Aprobado y contabilizado · centro ${selectedExpense.plate}`
          : "Gasto rechazado",
      );
      setSelectedExpense(null);
      setAuditOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de aprobación");
    }
  }

  async function emitirDian(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const out = await api<{
        number: string;
        amount: number;
        cxcCreated: boolean;
        dian: { cufe: string } | null;
        tripsCount: number;
      }>("/api/v1/contabilidad/facturacion/emitir-dian", {
        method: "POST",
        body: JSON.stringify({
          customerId,
          periodFrom,
          periodTo,
        }),
      });
      setInfo(
        `FE ${out.number} · ${money(out.amount)} · viajes ${out.tripsCount}` +
          (out.dian ? ` · CUFE ${out.dian.cufe.slice(0, 16)}…` : "") +
          (out.cxcCreated ? " · CxC generada" : ""),
      );
      setFacturacionOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de emisión DIAN");
    }
  }

  async function syncTaller() {
    setError("");
    try {
      const out = await api<{
        workOrdersClosed: number;
        platesCosted: number;
      }>("/api/v1/contabilidad/cierre/sincronizar-taller", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setInfo(
        `Cierre taller · OT ${out.workOrdersClosed} · placas ${out.platesCosted}`,
      );
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Error de sincronización con taller",
      );
    }
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-border pb-4">
        <div>
          <p className="font-data text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-primary">
            Contabilidad · Gestor
          </p>
          <h1 className="font-sans text-2xl font-semibold tracking-tight text-brand-text-primary md:text-3xl">
            Gestor contable · Contabilidad 4.0
          </h1>
          <p className="mt-1 font-sans text-sm text-brand-text-secondary">
            Libro diario · FE DIAN · gastos de ruta · cierre taller
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            className="w-auto px-4 py-2"
            onClick={() => setFacturacionOpen(true)}
          >
            <FileSpreadsheet className="mr-1.5 inline h-4 w-4" aria-hidden />
            Emitir FE DIAN
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-auto px-4 py-2"
            onClick={() => void syncTaller()}
          >
            Sincronizar taller
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

      <div className="grid gap-3 sm:grid-cols-3">
        <BentoPanel title="Facturado mes" subtitle="FE DIAN emitidas">
          <p className="font-data text-2xl font-bold tabular-nums text-brand-text-primary">
            {money(dash?.kpis.totalFacturadoMes || 0)}
          </p>
        </BentoPanel>
        <BentoPanel title="Cartera CxC" subtitle="Saldo por cobrar">
          <p className="font-data text-2xl font-bold tabular-nums text-brand-primary">
            {money(dash?.kpis.totalCarteraCxc || 0)}
          </p>
        </BentoPanel>
        <BentoPanel
          title="Gastos ruta"
          subtitle="Pendientes de auditoría"
          icon={<Wallet aria-hidden />}
        >
          <p className="font-data text-2xl font-bold tabular-nums text-brand-warning">
            {dash?.kpis.gastosRutaPendientes ?? 0}
          </p>
        </BentoPanel>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <BentoPanel
          id="diario"
          title="Libro diario virtual"
          subtitle="Asientos por centro de costo"
          icon={<BookOpen aria-hidden />}
          action={
            <Button
              type="button"
              variant="ghost"
              className="w-auto px-3 py-1.5 text-xs"
              onClick={() => void load()}
            >
              <RefreshCw className="mr-1 inline h-3 w-3" aria-hidden />
              Refrescar
            </Button>
          }
        >
          <WorkbenchToolbar>
            <WorkbenchSearch
              value={plateFilter}
              onChange={setPlateFilter}
              placeholder="Filtro placa…"
            />
            <WorkbenchSearch
              value={pucFilter}
              onChange={setPucFilter}
              placeholder="Cuenta PUC…"
            />
          </WorkbenchToolbar>

          <div className="mt-3">
            {!diarioRows.length ? (
              <EmptyState
                title="Sin asientos en la red"
                description="Ajuste filtros o sincronice operaciones."
              />
            ) : (
              <NexaTable columns={["Cuenta", "Referencia", "Debe", "Haber"]}>
                {diarioRows.map((row) => (
                  <NexaRow key={row.id}>
                    <NexaCell className="text-xs">
                      <span className="font-data text-brand-primary">
                        {row.accountCode}
                      </span>
                      {row.accountName ? (
                        <span className="text-brand-text-secondary">
                          {" "}
                          {row.accountName}
                        </span>
                      ) : null}
                    </NexaCell>
                    <NexaCell className="text-xs">{row.referencia}</NexaCell>
                    <NexaCell mono>
                      {row.debe ? money(row.debe) : "—"}
                    </NexaCell>
                    <NexaCell mono>
                      {row.haber ? money(row.haber) : "—"}
                    </NexaCell>
                  </NexaRow>
                ))}
              </NexaTable>
            )}
          </div>
        </BentoPanel>

        <aside id="gastos" className="space-y-4">
          <BentoPanel
            title="Peajes / tanqueos"
            subtitle="Por auditar"
            icon={<FileCheck aria-hidden />}
          >
            {!dash?.bandeja.peajesPendientes?.length ? (
              <p className="py-4 text-center text-sm text-brand-text-secondary">
                Bandeja limpia
              </p>
            ) : (
              <NexaTable columns={["Placa", "Tipo", "Monto", ""]}>
                {(dash?.bandeja.peajesPendientes || []).map((p) => (
                  <NexaRow
                    key={p.id}
                    active={selectedExpense?.id === p.id}
                    onClick={() => {
                      setSelectedExpense(p);
                      setAuditOpen(true);
                    }}
                  >
                    <NexaCell mono className="text-xs">
                      {p.plate}
                    </NexaCell>
                    <NexaCell>
                      <Badge tone={p.kind === "PEAJE" ? "warning" : "success"}>
                        {p.kind}
                      </Badge>
                    </NexaCell>
                    <NexaCell mono>{money(p.amount)}</NexaCell>
                    <NexaCell>
                      <Button
                        type="button"
                        variant="ghost"
                        className="w-auto px-2 py-1 text-[10px]"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedExpense(p);
                          setAuditOpen(true);
                        }}
                      >
                        Auditar
                      </Button>
                    </NexaCell>
                  </NexaRow>
                ))}
              </NexaTable>
            )}
          </BentoPanel>

          <BentoPanel
            title="Facturas recurrentes"
            subtitle="Por emitir"
          >
            {!dash?.bandeja.facturasRecurrentes?.length ? (
              <p className="py-4 text-center text-sm text-brand-text-secondary">
                Sin pendientes
              </p>
            ) : (
              <NexaTable columns={["Cliente", "NIT", "Segmento"]}>
                {(dash?.bandeja.facturasRecurrentes || []).map((c) => (
                  <NexaRow
                    key={c.id}
                    onClick={() => {
                      setCustomerId(c.id);
                      setFacturacionOpen(true);
                    }}
                  >
                    <NexaCell>{c.name}</NexaCell>
                    <NexaCell mono className="text-xs">
                      {c.nit}
                    </NexaCell>
                    <NexaCell className="text-xs text-brand-text-secondary">
                      {c.segment}
                    </NexaCell>
                  </NexaRow>
                ))}
              </NexaTable>
            )}
          </BentoPanel>
        </aside>
      </div>

      <SlideOver
        open={facturacionOpen}
        onClose={() => setFacturacionOpen(false)}
        title="Emitir FE DIAN"
        description="Viajes COMPLETED del periodo · genera CxC automáticamente"
        widthClass="max-w-lg"
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              className="w-auto px-4 py-2"
              onClick={() => setFacturacionOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="gestor-facturacion-form"
              variant="primary"
              className="w-auto px-4 py-2"
            >
              Emitir FE DIAN
            </Button>
          </>
        }
      >
        <form
          id="gestor-facturacion-form"
          onSubmit={emitirDian}
          className="space-y-4"
        >
          <label className="flex flex-col gap-1 font-data text-[10px] uppercase tracking-wider text-brand-text-secondary">
            Cliente
            <select
              className="field"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              {(dash?.customers || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.nit}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 font-data text-[10px] uppercase tracking-wider text-brand-text-secondary">
            Periodo desde
            <input
              type="date"
              className="field font-data"
              value={periodFrom}
              onChange={(e) => setPeriodFrom(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 font-data text-[10px] uppercase tracking-wider text-brand-text-secondary">
            Periodo hasta
            <input
              type="date"
              className="field font-data"
              value={periodTo}
              onChange={(e) => setPeriodTo(e.target.value)}
            />
          </label>
        </form>
      </SlideOver>

      <SlideOver
        open={auditOpen}
        onClose={() => {
          setAuditOpen(false);
          setSelectedExpense(null);
        }}
        title={
          selectedExpense
            ? `Auditoría · ${selectedExpense.plate}`
            : "Auditoría split-screen"
        }
        description="Soporte visual · extracción IA · centro de costo por placa"
        widthClass="max-w-xl"
        footer={
          selectedExpense ? (
            <>
              <Button
                type="button"
                variant="ghost"
                className="w-auto px-4 py-2"
                onClick={() => void aprobarGasto(false)}
              >
                Rechazar
              </Button>
              <Button
                type="button"
                variant="primary"
                className="w-auto px-4 py-2"
                onClick={() => void aprobarGasto(true)}
              >
                Aprobar y contabilizar
              </Button>
            </>
          ) : null
        }
      >
        {selectedExpense ? (
          <div className="space-y-3">
            <div className="flex min-h-[120px] items-center justify-center rounded-lg border border-dashed border-brand-border text-xs text-brand-text-secondary">
              {selectedExpense.photoRef || "Foto peaje/tanqueo · IA"}
            </div>
            <pre className="overflow-auto rounded-lg border border-brand-border bg-brand-surface-elevated/50 p-2 font-data text-[10px]">
              {JSON.stringify(
                selectedExpense.aiExtracted || {
                  plate: selectedExpense.plate,
                  amount: selectedExpense.amount,
                  kind: selectedExpense.kind,
                },
                null,
                2,
              )}
            </pre>
            <p className="font-data text-lg tabular-nums text-brand-text-primary">
              {money(selectedExpense.amount)}
            </p>
          </div>
        ) : null}
      </SlideOver>
    </div>
  );
}
