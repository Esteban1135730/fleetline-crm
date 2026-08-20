"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { Landmark, Plus, Receipt, Wallet } from "lucide-react";
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
import { api } from "@/lib/api";
import { statusEs } from "@fsg/shared";
import { PageIntro } from "@/components/page-intro";
import {
  EmptyState,
  EvidenceDropzone,
  KpiCard,
  SlideOver,
  StatusPulseBadge,
} from "@/components/audit";

type InvoiceTab = "RECEIVABLE" | "PAYABLE";

type CashFlowWeek = {
  semana: string;
  ingresos: number;
  egresos: number;
};

type Summary = {
  cxcOpen: number;
  cxcPaid: number;
  cxpOpen: number;
  cxpPaid: number;
  overdue: number;
  bankBalance?: number;
  netLiquidity?: number;
  cashFlowForecast?: CashFlowWeek[];
};

type Invoice = {
  id: string;
  number: string;
  type: string;
  status: string;
  amount: string | number;
  dueDate?: string;
  description?: string | null;
  supplierName?: string | null;
  paymentApprovedAt?: string | null;
  paymentApprovedBy?: { name: string } | null;
  customer?: { name: string } | null;
  trip?: { code: string } | null;
};

type Customer = { id: string; name: string };

const BANK_ACCOUNTS = [
  { id: "1110-bancolombia", label: "Bancolombia · Cta corriente 1110" },
  { id: "1110-davivienda", label: "Davivienda · Operaciones 1110" },
  { id: "1110-caja", label: "Caja menor · efectivo" },
];

function sparkFrom(values: number[], fallback: number): number[] {
  if (values.length >= 2) return values.slice(-8);
  const base = Math.max(fallback, 1);
  return [
    base * 0.55,
    base * 0.62,
    base * 0.7,
    base * 0.78,
    base * 0.85,
    base * 0.92,
    base,
  ];
}

function formatCop(n: number) {
  return `$${Math.round(n).toLocaleString("es-CO")}`;
}

function dueAging(dueDate?: string): {
  label: string;
  tone: "active" | "fatiga" | "danger";
  pulse: boolean;
} {
  if (!dueDate) {
    return { label: "Sin vencimiento", tone: "active", pulse: false };
  }
  const days = Math.ceil(
    (new Date(dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
  if (days < 0) {
    return { label: `Vencida ${Math.abs(days)}d`, tone: "danger", pulse: true };
  }
  if (days <= 3) {
    return { label: `Vence en ${days}d`, tone: "fatiga", pulse: true };
  }
  if (days <= 10) {
    return { label: `Vence en ${days}d`, tone: "active", pulse: false };
  }
  return { label: `Vence en ${days}d`, tone: "active", pulse: false };
}

export default function FinanzasPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoiceTab, setInvoiceTab] = useState<InvoiceTab>("PAYABLE");
  const [registrarOpen, setRegistrarOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [payTarget, setPayTarget] = useState<Invoice | null>(null);
  const [payBank, setPayBank] = useState(BANK_ACCOUNTS[0].id);
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState("");
  const [registrarEvidence, setRegistrarEvidence] = useState<File[]>([]);
  const [form, setForm] = useState({
    type: "RECEIVABLE" as "RECEIVABLE" | "PAYABLE",
    amount: "",
    dueDate: "",
    customerId: "",
    supplierName: "",
    description: "",
  });

  async function load() {
    const [s, i, c] = await Promise.all([
      api<Summary>("/finance/summary"),
      api<Invoice[]>("/finance/invoices"),
      api<Customer[]>("/comercial/customers"),
    ]);
    setSummary(s);
    setInvoices(i);
    setCustomers(c);
  }

  useEffect(() => {
    void load().catch(console.error);
  }, []);

  const sparks = useMemo(() => {
    const cxcOpen = invoices
      .filter((inv) => inv.type === "RECEIVABLE" && inv.status !== "PAID")
      .map((inv) => Number(inv.amount) || 0);
    const cxcPaid = invoices
      .filter((inv) => inv.type === "RECEIVABLE" && inv.status === "PAID")
      .map((inv) => Number(inv.amount) || 0);
    const cxpOpen = invoices
      .filter((inv) => inv.type === "PAYABLE" && inv.status !== "PAID")
      .map((inv) => Number(inv.amount) || 0);
    const overdueSeries = invoices
      .filter((inv) => inv.status === "OVERDUE")
      .map((inv) => Number(inv.amount) || 0);
    return {
      cxcOpen: sparkFrom(cxcOpen, summary?.cxcOpen ?? 0),
      cxcPaid: sparkFrom(cxcPaid, summary?.cxcPaid ?? 0),
      cxpOpen: sparkFrom(cxpOpen, summary?.cxpOpen ?? 0),
      overdue: sparkFrom(overdueSeries, summary?.overdue ?? 0),
    };
  }, [invoices, summary]);

  const filteredInvoices = useMemo(
    () => invoices.filter((inv) => inv.type === invoiceTab),
    [invoices, invoiceTab],
  );

  const cashFlowData = useMemo(
    () =>
      summary?.cashFlowForecast?.length
        ? summary.cashFlowForecast
        : [
            { semana: "Sem 1", ingresos: 0, egresos: 0 },
            { semana: "Sem 2", ingresos: 0, egresos: 0 },
            { semana: "Sem 3", ingresos: 0, egresos: 0 },
            { semana: "Sem 4", ingresos: 0, egresos: 0 },
          ],
    [summary],
  );

  const bankBalance = summary?.bankBalance ?? 0;
  const netLiquidity =
    summary?.netLiquidity ??
    bankBalance + (summary?.cxcOpen ?? 0) - (summary?.cxpOpen ?? 0);

  function openRegistrar(type: "RECEIVABLE" | "PAYABLE") {
    setForm((f) => ({ ...f, type }));
    setRegistrarEvidence([]);
    setRegistrarOpen(true);
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    await api("/finance/invoices", {
      method: "POST",
      body: JSON.stringify({
        type: form.type,
        amount: Number(form.amount),
        dueDate: form.dueDate,
        customerId:
          form.type === "RECEIVABLE" ? form.customerId || undefined : undefined,
        supplierName:
          form.type === "PAYABLE" ? form.supplierName || undefined : undefined,
        description: form.description || undefined,
      }),
    });
    setForm({
      type: form.type,
      amount: "",
      dueDate: "",
      customerId: form.customerId,
      supplierName: "",
      description: "",
    });
    setRegistrarEvidence([]);
    setRegistrarOpen(false);
    await load();
  }

  function openPayPanel(inv: Invoice) {
    setPayTarget(inv);
    setPayBank(BANK_ACCOUNTS[0].id);
    setPayError("");
    setPayOpen(true);
  }

  async function confirmPay() {
    if (!payTarget) return;
    setPayBusy(true);
    setPayError("");
    try {
      if (payTarget.type === "PAYABLE" && !payTarget.paymentApprovedAt) {
        await api(`/finance/invoices/${payTarget.id}/approve-payment`, {
          method: "PATCH",
        });
      }
      await api(`/finance/invoices/${payTarget.id}/pay`, {
        method: "PATCH",
        body: JSON.stringify({ bankRef: payBank }),
      });
      setPayOpen(false);
      setPayTarget(null);
      await load();
    } catch (err) {
      setPayError(
        err instanceof Error ? err.message : "No se pudo procesar el pago",
      );
    } finally {
      setPayBusy(false);
    }
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <PageIntro
        module="tesoreria"
        title="Tesorería: centro de liquidez"
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              className="w-auto px-4 py-2"
              onClick={() => openRegistrar("RECEIVABLE")}
            >
              <Plus className="mr-1.5 inline h-4 w-4" aria-hidden />
              CxC
            </Button>
            <Button
              type="button"
              variant="primary"
              className="w-auto px-4 py-2"
              onClick={() => openRegistrar("PAYABLE")}
            >
              <Plus className="mr-1.5 inline h-4 w-4" aria-hidden />
              CxP
            </Button>
          </div>
        }
      />

      {summary ? (
        <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-6">
          <KpiCard
            label="Efectivo disponible"
            value={formatCop(bankBalance)}
            tone="ok"
            delta="Cuenta bancos 1110"
            icon={<Landmark className="h-10 w-10" />}
          />
          <KpiCard
            label="Por cobrar"
            value={formatCop(summary.cxcOpen)}
            tone="neutral"
            spark={sparks.cxcOpen}
            icon={<Wallet className="h-10 w-10" />}
          />
          <KpiCard
            label="Por pagar"
            value={formatCop(summary.cxpOpen)}
            tone="warn"
            spark={sparks.cxpOpen}
          />
          <KpiCard
            label="Posición neta"
            value={formatCop(netLiquidity)}
            tone={netLiquidity >= 0 ? "ok" : "danger"}
            delta="Bancos + CxC − CxP"
          />
          <KpiCard
            label="Ya cobrado"
            value={formatCop(summary.cxcPaid)}
            tone="ok"
            spark={sparks.cxcPaid}
          />
          <KpiCard
            label="Vencidas"
            value={String(summary.overdue)}
            tone="danger"
            spark={sparks.overdue}
          />
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="fsg-panel p-4 xl:col-span-2">
          <h2 className="font-display text-sm font-semibold text-[var(--text-primary)]">
            Flujo de caja proyectado · 30 días
          </h2>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Millones COP por semana · vencimientos abiertos
          </p>
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cashFlowData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis dataKey="semana" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v: number) => [`$${v}M`, ""]}
                  contentStyle={{
                    background: "var(--bg-surface-1)",
                    border: "1px solid var(--border-subtle)",
                  }}
                />
                <Legend />
                <Bar
                  dataKey="ingresos"
                  name="Ingresos"
                  fill="var(--accent-primary)"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="egresos"
                  name="Egresos"
                  fill="var(--accent-alert)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="fsg-panel flex flex-col justify-center p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
            Motor contable
          </p>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Al aprobar y pagar, el sistema descuenta saldo bancario virtual y
            genera asiento en Libro Mayor (1110 ↔ CxC/CxP).
          </p>
          <p className="mt-3 font-data text-2xl font-bold tabular-nums text-[var(--accent-primary)]">
            {formatCop(bankBalance)}
          </p>
          <p className="text-xs text-[var(--text-secondary)]">Saldo bancos hoy</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-[var(--brand-line)] pb-2">
        {(
          [
            ["PAYABLE", "Cuentas por pagar"],
            ["RECEIVABLE", "Cuentas por cobrar"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setInvoiceTab(id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors duration-150 ${
              invoiceTab === id
                ? "bg-[var(--brand-primary)]/15 text-[var(--brand-primary)]"
                : "text-[var(--brand-muted)] hover:text-[var(--text-primary)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="fsg-panel data-shell overflow-hidden">
        <div className="border-b border-[var(--brand-line)] px-4 py-3 font-display text-sm font-semibold">
          {invoiceTab === "PAYABLE" ? "CxP" : "CxC"} ({filteredInvoices.length})
        </div>
        {filteredInvoices.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<Receipt className="h-7 w-7" aria-hidden />}
              title="Sin facturas en esta vista"
              description="Registra CxC o CxP para iniciar el flujo de cobros y pagos."
              actionLabel={
                invoiceTab === "PAYABLE" ? "Registrar CxP" : "Registrar CxC"
              }
              onAction={() => openRegistrar(invoiceTab)}
            />
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="px-4 py-2">Número</th>
                <th className="px-4 py-2">Contraparte</th>
                <th className="px-4 py-2">Monto</th>
                <th className="px-4 py-2">Vencimiento</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map((inv) => {
                const aging = dueAging(inv.dueDate);
                return (
                  <tr key={inv.id} className="border-t border-[var(--brand-line)]">
                    <td className="px-4 py-2.5 font-data text-xs text-[var(--accent-primary)]">
                      {inv.number}
                    </td>
                    <td className="px-4 py-2.5">
                      {inv.customer?.name ||
                        inv.supplierName ||
                        (inv as { counterparty?: string }).counterparty ||
                        "—"}
                      {inv.trip ? (
                        <div className="font-data text-[10px] text-[var(--brand-muted)]">
                          Viaje {inv.trip.code}
                        </div>
                      ) : null}
                      {inv.description ? (
                        <div className="text-[10px] text-[var(--brand-muted)]">
                          {inv.description}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 font-data text-xs tabular-nums">
                      {formatCop(Number(inv.amount))}
                    </td>
                    <td className="px-4 py-2.5">
                      {inv.dueDate ? (
                        <div>
                          <StatusPulseBadge tone={aging.tone} pulse={aging.pulse}>
                            {aging.label}
                          </StatusPulseBadge>
                          <div className="mt-1 font-data text-[10px] text-[var(--text-secondary)]">
                            {new Date(inv.dueDate).toLocaleDateString("es-CO")}
                          </div>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge
                        tone={
                          inv.status === "PAID"
                            ? "emerald"
                            : inv.status === "OVERDUE"
                              ? "rose"
                              : "slate"
                        }
                      >
                        {statusEs(inv.status)}
                      </Badge>
                      {inv.type === "PAYABLE" && inv.paymentApprovedAt ? (
                        <div className="mt-1 font-data text-[10px] text-[var(--accent-primary)]">
                          Aprobado: {inv.paymentApprovedBy?.name || "registrado"}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5">
                      {inv.status !== "PAID" && inv.status !== "CANCELLED" ? (
                        <div className="flex flex-wrap justify-end gap-1">
                          <Button
                            variant="primary"
                            className="w-auto"
                            onClick={() => openPayPanel(inv)}
                          >
                            {inv.type === "PAYABLE"
                              ? "Aprobar y pagar"
                              : "Registrar cobro"}
                          </Button>
                          <Button
                            variant="ghost"
                            className="w-auto"
                            onClick={async () => {
                              await api(`/finance/invoices/${inv.id}/cancel`, {
                                method: "PATCH",
                              });
                              await load();
                            }}
                          >
                            Anular
                          </Button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <SlideOver
        open={registrarOpen}
        onClose={() => setRegistrarOpen(false)}
        title={
          form.type === "RECEIVABLE"
            ? "Registrar CxC"
            : "Registrar CxP"
        }
        description="Motor de transacciones · adjunte soporte documental"
        widthClass="max-w-lg"
        footer={
          <Button
            type="submit"
            form="tesoreria-registrar-form"
            variant="primary"
            className="w-auto px-4 py-2"
          >
            Registrar factura
          </Button>
        }
      >
        <form
          id="tesoreria-registrar-form"
          onSubmit={onCreate}
          className="grid gap-3"
        >
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--text-secondary)]">
            Tipo
            <select
              className="field"
              value={form.type}
              onChange={(e) =>
                setForm({
                  ...form,
                  type: e.target.value as "RECEIVABLE" | "PAYABLE",
                })
              }
            >
              <option value="RECEIVABLE">Por cobrar (cliente)</option>
              <option value="PAYABLE">Por pagar (proveedor)</option>
            </select>
          </label>
          {form.type === "RECEIVABLE" ? (
            <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--text-secondary)]">
              Cliente
              <select
                className="field"
                value={form.customerId}
                onChange={(e) =>
                  setForm({ ...form, customerId: e.target.value })
                }
                required
              >
                <option value="">Seleccionar cliente</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--text-secondary)]">
              Proveedor
              <input
                className="field"
                placeholder="Nombre proveedor"
                value={form.supplierName}
                onChange={(e) =>
                  setForm({ ...form, supplierName: e.target.value })
                }
                required
              />
            </label>
          )}
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--text-secondary)]">
            Monto COP
            <input
              className="field font-data"
              type="number"
              placeholder="Monto COP"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--text-secondary)]">
            Vencimiento
            <input
              className="field"
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--text-secondary)]">
            Descripción
            <input
              className="field"
              placeholder="Concepto"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </label>
          <div>
            <p className="mb-2 text-[11px] uppercase tracking-wide text-[var(--text-secondary)]">
              Soporte documental
            </p>
            <EvidenceDropzone
              acceptLabel="PDF factura o comprobante"
              onFiles={setRegistrarEvidence}
            />
            {registrarEvidence.length > 0 ? (
              <p className="mt-2 font-data text-xs text-[var(--text-secondary)]">
                {registrarEvidence.length} archivo(s) en cola
              </p>
            ) : null}
          </div>
        </form>
      </SlideOver>

      <SlideOver
        open={payOpen}
        onClose={() => {
          setPayOpen(false);
          setPayTarget(null);
        }}
        title={
          payTarget?.type === "PAYABLE"
            ? "Aprobar y pagar"
            : "Registrar cobro"
        }
        description="Descuenta bancos · asiento contable automático"
        widthClass="max-w-md"
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              className="w-auto"
              onClick={() => setPayOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="primary"
              className="w-auto"
              disabled={payBusy}
              onClick={() => void confirmPay()}
            >
              Confirmar operación
            </Button>
          </>
        }
      >
        {payTarget ? (
          <div className="space-y-4">
            <div>
              <p className="font-data text-xs text-[var(--accent-primary)]">
                {payTarget.number}
              </p>
              <p className="mt-1 font-data text-2xl font-bold tabular-nums">
                {formatCop(Number(payTarget.amount))}
              </p>
            </div>
            <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--text-secondary)]">
              Cuenta bancaria origen
              <select
                className="field"
                value={payBank}
                onChange={(e) => setPayBank(e.target.value)}
              >
                {BANK_ACCOUNTS.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            </label>
            <EvidenceDropzone
              acceptLabel="Comprobante de transferencia (PDF/imagen)"
              onFiles={() => undefined}
            />
            {payError ? (
              <p role="alert" className="text-sm text-[var(--accent-alert)]">
                {payError}
              </p>
            ) : null}
            <p className="text-xs text-[var(--text-secondary)]">
              Al confirmar se registra pago, se actualiza saldo 1110 y se
              contabiliza en Libro Mayor.
            </p>
          </div>
        ) : null}
      </SlideOver>
    </div>
  );
}
