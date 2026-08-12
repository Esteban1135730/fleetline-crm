"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { api } from "@/lib/api";
import { HowToBox, PageIntro } from "@/components/page-intro";

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
      credit: string;
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
      setError(e instanceof Error ? e.message : "Uplink contable fallido");
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
          (l.costCenterPlate || "").toUpperCase().includes(plateFilter.toUpperCase()),
        );
      const pucOk =
        !pucFilter ||
        j.lines.some(
          (l) =>
            l.debit.includes(pucFilter) || l.credit.includes(pucFilter),
        );
      return plateOk && pucOk;
    });
  }, [dash, plateFilter, pucFilter]);

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
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error aprobación");
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
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error emisión DIAN");
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
      setError(e instanceof Error ? e.message : "Error sync taller");
    }
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-5">
      <PageIntro module="contabilidad" title="Gestor contable · Contabilidad 4.0" />
      <HowToBox
        steps={[
          "Audita peajes/tanqueos Smart Wallet y contabílalos al centro de costo por placa.",
          "Emite FE DIAN sobre viajes COMPLETED del periodo — genera CxC automáticamente.",
          "Sincroniza OT de taller y depreciación por kilometraje al cierre.",
        ]}
      />

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

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
          <p className="text-xs text-[var(--text-secondary)]">Facturado mes</p>
          <p className="mt-1 font-mono text-xl text-[var(--text-primary)]">
            {money(dash?.kpis.totalFacturadoMes || 0)}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
          <p className="text-xs text-[var(--text-secondary)]">Cartera CxC</p>
          <p className="mt-1 font-mono text-xl text-[var(--text-primary)]">
            {money(dash?.kpis.totalCarteraCxc || 0)}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
          <p className="text-xs text-[var(--text-secondary)]">Gastos ruta pendientes</p>
          <p className="mt-1 font-mono text-xl text-[var(--text-primary)]">
            {dash?.kpis.gastosRutaPendientes ?? 0}
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        {/* Libro diario */}
        <section id="diario" className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <h2 className="font-display text-sm font-semibold text-[var(--text-primary)]">
              Libro diario virtual
            </h2>
            <input
              className="ml-auto rounded-lg border border-[var(--border-subtle)] bg-transparent px-3 py-1.5 font-mono text-xs"
              placeholder="Filtro placa"
              value={plateFilter}
              onChange={(e) => setPlateFilter(e.target.value)}
            />
            <input
              className="rounded-lg border border-[var(--border-subtle)] bg-transparent px-3 py-1.5 font-mono text-xs"
              placeholder="Cuenta PUC"
              value={pucFilter}
              onChange={(e) => setPucFilter(e.target.value)}
            />
            <Button type="button" variant="ghost" size="sm" onClick={() => void load()}>
              Refrescar
            </Button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-[var(--border-subtle)] text-xs uppercase text-[var(--text-secondary)]">
                <tr>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Memo</th>
                  <th className="px-3 py-2">Débito</th>
                  <th className="px-3 py-2">Crédito</th>
                  <th className="px-3 py-2">Placa</th>
                  <th className="px-3 py-2">Monto</th>
                </tr>
              </thead>
              <tbody>
                {diario.flatMap((j) =>
                  j.lines.map((l, idx) => (
                    <tr
                      key={`${j.id}-${idx}`}
                      className="border-b border-[var(--border-subtle)]/50"
                    >
                      <td className="px-3 py-2 font-mono text-[10px]">
                        {idx === 0 ? new Date(j.postedAt).toLocaleString("es-CO") : ""}
                      </td>
                      <td className="px-3 py-2 text-xs">{idx === 0 ? j.memo : ""}</td>
                      <td className="px-3 py-2 font-mono text-xs">{l.debit}</td>
                      <td className="px-3 py-2 font-mono text-xs">{l.credit}</td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {l.costCenterPlate || "—"}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{money(l.amount)}</td>
                    </tr>
                  )),
                )}
                {!diario.length ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-[var(--text-secondary)]">
                      Sin asientos en uplink
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <form
            id="facturacion"
            onSubmit={emitirDian}
            className="grid gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 md:grid-cols-4"
          >
            <select
              className="rounded-lg border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-sm md:col-span-2"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              {(dash?.customers || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.nit}
                </option>
              ))}
            </select>
            <input
              type="date"
              className="rounded-lg border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-sm"
              value={periodFrom}
              onChange={(e) => setPeriodFrom(e.target.value)}
            />
            <input
              type="date"
              className="rounded-lg border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-sm"
              value={periodTo}
              onChange={(e) => setPeriodTo(e.target.value)}
            />
            <div className="flex flex-wrap gap-2 md:col-span-4">
              <Button type="submit">Emitir FE DIAN</Button>
              <Button type="button" variant="ghost" onClick={() => void syncTaller()}>
                Sincronizar taller / depreciación
              </Button>
            </div>
          </form>
        </section>

        {/* Bandeja derecha */}
        <aside id="gastos" className="space-y-4">
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Peajes / tanqueos por auditar
            </h2>
            <div className="space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
              {(dash?.bandeja.peajesPendientes || []).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedExpense(p)}
                  className={`w-full rounded-lg border px-3 py-2 text-left ${
                    selectedExpense?.id === p.id
                      ? "border-teal-500/50 bg-teal-500/10"
                      : "border-[var(--border-subtle)]"
                  }`}
                >
                  <div className="flex justify-between gap-2">
                    <span className="font-mono text-xs">{p.plate}</span>
                    <Badge tone={p.kind === "PEAJE" ? "amber" : "emerald"}>
                      {p.kind}
                    </Badge>
                  </div>
                  <p className="mt-1 font-mono text-sm">{money(p.amount)}</p>
                </button>
              ))}
              {!dash?.bandeja.peajesPendientes?.length ? (
                <p className="py-4 text-center text-sm text-[var(--text-secondary)]">
                  Bandeja limpia
                </p>
              ) : null}
            </div>
          </section>

          {selectedExpense ? (
            <section className="grid gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
              <h3 className="text-sm font-semibold">Auditoría split-screen</h3>
              <div className="flex min-h-[120px] items-center justify-center rounded-lg border border-dashed border-[var(--border-subtle)] text-xs text-[var(--text-secondary)]">
                {selectedExpense.photoRef || "Foto peaje/tanqueo · IA"}
              </div>
              <pre className="overflow-auto rounded-lg bg-black/5 p-2 font-mono text-[10px] dark:bg-white/5">
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
              <div className="flex gap-2">
                <Button type="button" onClick={() => void aprobarGasto(true)}>
                  Aprobar y contabilizar
                </Button>
                <Button type="button" variant="ghost" onClick={() => void aprobarGasto(false)}>
                  Rechazar
                </Button>
              </div>
            </section>
          ) : null}

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Facturas recurrentes por emitir
            </h2>
            <div className="space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
              {(dash?.bandeja.facturasRecurrentes || []).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="w-full rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-left"
                  onClick={() => setCustomerId(c.id)}
                >
                  <p className="text-sm text-[var(--text-primary)]">{c.name}</p>
                  <p className="font-mono text-[10px] text-[var(--text-secondary)]">
                    {c.nit} · {c.segment}
                  </p>
                </button>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
