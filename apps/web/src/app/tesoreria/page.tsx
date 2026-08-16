"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { Receipt } from "lucide-react";
import { api } from "@/lib/api";
import { statusEs } from "@fsg/shared";
import { PageIntro } from "@/components/page-intro";
import { EmptyState, KpiCard } from "@/components/audit";

type Summary = {
  cxcOpen: number;
  cxcPaid: number;
  cxpOpen: number;
  cxpPaid: number;
  overdue: number;
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

export default function FinanzasPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
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
    await load();
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <PageIntro module="tesoreria" title="Tesorería: cobros y pagos" />

      {summary ? (
        <div className="stagger grid grid-cols-1 gap-4 md:grid-cols-4">
          <KpiCard
            label="Por cobrar"
            value={`$${(summary.cxcOpen / 1e6).toFixed(1)}M`}
            tone="neutral"
            spark={sparks.cxcOpen}
          />
          <KpiCard
            label="Ya cobrado"
            value={`$${(summary.cxcPaid / 1e6).toFixed(1)}M`}
            tone="ok"
            spark={sparks.cxcPaid}
          />
          <KpiCard
            label="Por pagar"
            value={`$${(summary.cxpOpen / 1e6).toFixed(1)}M`}
            tone="warn"
            spark={sparks.cxpOpen}
          />
          <KpiCard
            label="Vencidas"
            value={String(summary.overdue)}
            tone="danger"
            spark={sparks.overdue}
          />
        </div>
      ) : null}

      <form onSubmit={onCreate} className="fsg-panel grid gap-3 p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
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
          {form.type === "RECEIVABLE" ? (
            <select
              className="field"
              value={form.customerId}
              onChange={(e) => setForm({ ...form, customerId: e.target.value })}
              required
            >
              <option value="">Cliente</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="field"
              placeholder="Nombre proveedor"
              value={form.supplierName}
              onChange={(e) =>
                setForm({ ...form, supplierName: e.target.value })
              }
              required
            />
          )}
          <input
            className="field"
            type="number"
            placeholder="Monto COP"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            required
          />
          <input
            className="field"
            type="date"
            value={form.dueDate}
            onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
            required
          />
        </div>
        <div className="grid grid-cols-1 items-center gap-3 md:grid-cols-[1fr_auto]">
          <input
            className="field"
            placeholder="Descripción"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <div className="flex justify-end">
            <Button type="submit" variant="primary" className="w-auto px-4 py-2">
              Registrar factura
            </Button>
          </div>
        </div>
      </form>

      <div className="fsg-panel data-shell overflow-hidden">
        <div className="border-b border-[var(--brand-line)] px-4 py-3 font-display text-sm font-semibold">
          Facturas ({invoices.length})
        </div>
        {invoices.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<Receipt className="h-7 w-7" aria-hidden />}
              title="Sin facturas registradas"
              description="Registra CxC o CxP para iniciar el flujo de cobros y pagos."
            />
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="px-4 py-2">Número</th>
                <th className="px-4 py-2">Tipo</th>
                <th className="px-4 py-2">Contraparte</th>
                <th className="px-4 py-2">Monto</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-t border-[var(--brand-line)]">
                  <td className="px-4 py-2.5 font-data text-xs">{inv.number}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={inv.type === "RECEIVABLE" ? "cyan" : "amber"}>
                      {inv.type === "RECEIVABLE" ? "Por cobrar" : "Por pagar"}
                    </Badge>
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
                  <td className="px-4 py-2.5 font-data text-xs">
                    ${Number(inv.amount).toLocaleString("es-CO")}
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
                      <div className="flex flex-wrap gap-1">
                        <Button
                          variant="ghost"
                          className="w-auto"
                          onClick={async () => {
                            const dueDate = window.prompt(
                              "Fecha vencimiento (YYYY-MM-DD)",
                              inv.dueDate ? inv.dueDate.slice(0, 10) : "",
                            );
                            if (dueDate === null) return;
                            const description = window.prompt(
                              "Descripción",
                              inv.description || "",
                            );
                            if (description === null) return;
                            await api(`/finance/invoices/${inv.id}`, {
                              method: "PATCH",
                              body: JSON.stringify({
                                dueDate: dueDate.trim() || undefined,
                                description: description.trim() || undefined,
                              }),
                            });
                            await load();
                          }}
                        >
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          className="w-auto"
                          onClick={async () => {
                            try {
                              if (
                                inv.type === "PAYABLE" &&
                                !inv.paymentApprovedAt
                              ) {
                                await api(
                                  `/finance/invoices/${inv.id}/approve-payment`,
                                  { method: "PATCH" },
                                );
                              }
                              await api(`/finance/invoices/${inv.id}/pay`, {
                                method: "PATCH",
                              });
                              await load();
                            } catch (err) {
                              window.alert(
                                err instanceof Error
                                  ? err.message
                                  : "No se pudo pagar",
                              );
                            }
                          }}
                        >
                          {inv.type === "PAYABLE" && !inv.paymentApprovedAt
                            ? "Aprobar y pagar"
                            : "Marcar pagada"}
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
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
