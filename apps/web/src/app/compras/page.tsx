"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button } from "@fsg/ui";
import {
  CheckCircle2,
  Package,
  Plus,
  ShoppingCart,
  Wallet,
} from "lucide-react";
import { api } from "@/lib/api";
import { PageIntro } from "@/components/page-intro";
import {
  EmptyState,
  KpiCard,
  SlideOver,
  StatusPulseBadge,
} from "@/components/audit";

type Purchase = {
  id: string;
  code: string;
  description: string;
  supplier: string;
  amount: string | number;
  category: string;
  status: string;
  requestedBy?: string | null;
  createdAt: string;
};

const STATUS_FLOW = ["REQUESTED", "APPROVED", "ORDERED", "RECEIVED"] as const;
const STATUS_ES: Record<string, string> = {
  REQUESTED: "Solicitada",
  APPROVED: "Aprobada",
  ORDERED: "Pedida",
  RECEIVED: "Recibida",
  CANCELLED: "Cancelada",
};

const emptyForm = {
  description: "",
  supplier: "",
  amount: "",
  quantity: "1",
  category: "REPUESTOS",
  requestedBy: "",
};

export default function ComprasPage() {
  const [rows, setRows] = useState<Purchase[]>([]);
  const [slideOpen, setSlideOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  async function load() {
    setRows(await api<Purchase[]>("/compras/orders"));
  }

  useEffect(() => {
    void load().catch(console.error);
  }, []);

  const kpis = useMemo(() => {
    const pending = rows.filter((r) => r.status === "REQUESTED").length;
    const now = new Date();
    const monthSpend = rows
      .filter((r) => {
        const d = new Date(r.createdAt);
        return (
          d.getMonth() === now.getMonth() &&
          d.getFullYear() === now.getFullYear() &&
          r.status !== "CANCELLED"
        );
      })
      .reduce((s, r) => s + Number(r.amount), 0);
    const presupuestoDisponible = 0;
    return { pending, monthSpend, presupuestoDisponible };
  }, [rows]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const qty = Math.max(1, Number(form.quantity) || 1);
    const desc =
      qty > 1
        ? `${form.description.trim()} · ×${qty}`
        : form.description.trim();
    await api("/compras/orders", {
      method: "POST",
      body: JSON.stringify({
        description: desc,
        supplier: form.supplier,
        amount: Number(form.amount),
        category: form.category,
        requestedBy: form.requestedBy || undefined,
        quantity: qty,
      }),
    });
    setForm(emptyForm);
    setSlideOpen(false);
    await load();
  }

  function nextStatus(current: string) {
    const idx = STATUS_FLOW.indexOf(current as (typeof STATUS_FLOW)[number]);
    if (idx < 0 || idx >= STATUS_FLOW.length - 1) return null;
    return STATUS_FLOW[idx + 1];
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <PageIntro
        module="compras"
        title="Compras y proveedores"
        action={
          <Button
            type="button"
            variant="primary"
            className="w-auto"
            onClick={() => setSlideOpen(true)}
          >
            <Plus className="mr-1 h-4 w-4" />
            Crear Solicitud de Compra
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard
          label="Pendientes de Aprobación"
          value={kpis.pending}
          tone={kpis.pending > 0 ? "warn" : "ok"}
          icon={<CheckCircle2 />}
        />
        <KpiCard
          label="Compras del Mes"
          value={`$${kpis.monthSpend.toLocaleString("es-CO")}`}
          tone="neutral"
          icon={<ShoppingCart />}
        />
        <KpiCard
          label="Presupuesto Disponible"
          value={`$${kpis.presupuestoDisponible.toLocaleString("es-CO")}`}
          tone="neutral"
          delta="Sin cupo configurado"
          icon={<Wallet />}
        />
      </div>

      <div className="fsg-panel data-shell overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--brand-line)] px-4 py-3">
          <span className="font-display text-sm font-semibold">
            Órdenes ({rows.length})
          </span>
          <Button
            type="button"
            variant="primary"
            className="w-auto"
            onClick={() => setSlideOpen(true)}
          >
            <Plus className="mr-1 h-4 w-4" />
            Crear Solicitud de Compra
          </Button>
        </div>

        {!rows.length ? (
          <div className="p-6">
            <EmptyState
              icon={<Package className="h-7 w-7" />}
              title="Sin solicitudes de compra"
              description="Crea una OC con descripción, proveedor, cantidad y valor."
              actionLabel="+ Crear Solicitud de Compra"
              onAction={() => setSlideOpen(true)}
            />
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="px-4 py-2">Orden</th>
                <th className="px-4 py-2">Proveedor</th>
                <th className="px-4 py-2">Valor</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const next = nextStatus(r.status);
                return (
                  <tr
                    key={r.id}
                    className="border-t border-[var(--brand-line)]"
                  >
                    <td className="px-4 py-2.5">
                      <span className="font-data text-xs text-[var(--brand-primary)]">
                        {r.code}
                      </span>
                      <div>{r.description}</div>
                      <div className="text-[11px] text-[var(--brand-muted)]">
                        {r.category}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">{r.supplier}</td>
                    <td className="px-4 py-2.5 font-data tabular-nums">
                      ${Number(r.amount).toLocaleString("es-CO")}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusPulseBadge
                        tone={
                          r.status === "RECEIVED"
                            ? "active"
                            : r.status === "CANCELLED"
                              ? "neutral"
                              : r.status === "REQUESTED"
                                ? "fatiga"
                                : "active"
                        }
                        pulse={r.status === "REQUESTED"}
                      >
                        {STATUS_ES[r.status] || r.status}
                      </StatusPulseBadge>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap justify-end gap-1">
                        {next ? (
                          <Button
                            variant="ghost"
                            className="w-auto"
                            onClick={async () => {
                              await api(`/compras/orders/${r.id}/status`, {
                                method: "PATCH",
                                body: JSON.stringify({ status: next }),
                              });
                              await load();
                            }}
                          >
                            → {STATUS_ES[next]}
                          </Button>
                        ) : null}
                        {r.status !== "CANCELLED" &&
                        r.status !== "RECEIVED" ? (
                          <Button
                            variant="ghost"
                            className="w-auto"
                            onClick={async () => {
                              await api(`/compras/orders/${r.id}/status`, {
                                method: "PATCH",
                                body: JSON.stringify({ status: "CANCELLED" }),
                              });
                              await load();
                            }}
                          >
                            Cancelar
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <SlideOver
        open={slideOpen}
        onClose={() => setSlideOpen(false)}
        title="Solicitud de compra"
        description="Al recibir, se genera factura CxP en Finanzas."
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              className="w-auto"
              onClick={() => setSlideOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="compras-create-form"
              variant="primary"
              className="w-auto"
            >
              Crear solicitud
            </Button>
          </>
        }
      >
        <form
          id="compras-create-form"
          onSubmit={onCreate}
          className="grid gap-3"
        >
          <label className="text-xs text-slate-400">
            Descripción
            <input
              className="field mt-1 w-full"
              placeholder="Ej. Filtros de aceite"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              required
            />
          </label>
          <label className="text-xs text-slate-400">
            Proveedor
            <input
              className="field mt-1 w-full"
              placeholder="Razón social"
              value={form.supplier}
              onChange={(e) => setForm({ ...form, supplier: e.target.value })}
              required
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-slate-400">
              Cantidad
              <input
                className="field mt-1 w-full font-data"
                type="number"
                min={1}
                step={1}
                placeholder="1"
                value={form.quantity}
                onChange={(e) =>
                  setForm({ ...form, quantity: e.target.value })
                }
                required
              />
            </label>
            <label className="text-xs text-slate-400">
              Valor COP
              <input
                className="field mt-1 w-full font-data"
                type="number"
                min={0}
                placeholder="0"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                required
              />
            </label>
          </div>
          <label className="text-xs text-slate-400">
            Categoría
            <select
              className="field mt-1 w-full"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              <option value="REPUESTOS">Repuestos</option>
              <option value="COMBUSTIBLE">Combustible</option>
              <option value="PAPELERIA">Papelería</option>
              <option value="SERVICIOS">Servicios</option>
              <option value="GENERAL">General</option>
            </select>
          </label>
          <label className="text-xs text-slate-400">
            Solicitante (opcional)
            <input
              className="field mt-1 w-full"
              placeholder="Nombre"
              value={form.requestedBy}
              onChange={(e) =>
                setForm({ ...form, requestedBy: e.target.value })
              }
            />
          </label>
        </form>
      </SlideOver>
    </div>
  );
}
