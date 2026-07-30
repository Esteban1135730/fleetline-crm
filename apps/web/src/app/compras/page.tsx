"use client";

import { FormEvent, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { api } from "@/lib/api";
import { HowToBox, PageIntro } from "@/components/page-intro";

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

export default function ComprasPage() {
  const [rows, setRows] = useState<Purchase[]>([]);
  const [form, setForm] = useState({
    description: "",
    supplier: "",
    amount: "",
    category: "REPUESTOS",
    requestedBy: "",
  });

  async function load() {
    setRows(await api<Purchase[]>("/compras/orders"));
  }

  useEffect(() => {
    void load().catch(console.error);
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    await api("/compras/orders", {
      method: "POST",
      body: JSON.stringify({
        ...form,
        amount: Number(form.amount),
      }),
    });
    setForm({
      description: "",
      supplier: "",
      amount: "",
      category: "REPUESTOS",
      requestedBy: "",
    });
    await load();
  }

  function nextStatus(current: string) {
    const idx = STATUS_FLOW.indexOf(current as (typeof STATUS_FLOW)[number]);
    if (idx < 0 || idx >= STATUS_FLOW.length - 1) return null;
    return STATUS_FLOW[idx + 1];
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <PageIntro module="compras" title="Compras y proveedores" />
      <HowToBox
        steps={[
          "Registra una solicitud con descripción, proveedor y valor.",
          "Aprueba la orden y márcala como pedida cuando se envíe al proveedor.",
          "Al recibir repuestos o insumos, ciérrala como Recibida; se crea automáticamente una factura CxP en Finanzas.",
        ]}
      />

      <form
        onSubmit={onCreate}
        className="fsg-panel grid grid-cols-1 gap-3 p-4 md:grid-cols-6"
      >
        <input
          className="field md:col-span-2"
          placeholder="Descripción (ej. Filtros de aceite)"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          required
        />
        <input
          className="field"
          placeholder="Proveedor"
          value={form.supplier}
          onChange={(e) => setForm({ ...form, supplier: e.target.value })}
          required
        />
        <input
          className="field"
          type="number"
          placeholder="Valor COP"
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
          required
        />
        <select
          className="field"
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
        >
          <option value="REPUESTOS">Repuestos</option>
          <option value="COMBUSTIBLE">Combustible</option>
          <option value="PAPELERIA">Papelería</option>
          <option value="SERVICIOS">Servicios</option>
          <option value="GENERAL">General</option>
        </select>
        <Button type="submit" variant="primary">
          Nueva solicitud
        </Button>
      </form>

      <div className="fsg-panel data-shell overflow-hidden">
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
                <tr key={r.id} className="border-t border-[var(--brand-line)]">
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
                  <td className="px-4 py-2.5 font-data">
                    ${Number(r.amount).toLocaleString("es-CO")}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge
                      tone={
                        r.status === "RECEIVED"
                          ? "emerald"
                          : r.status === "CANCELLED"
                            ? "slate"
                            : "amber"
                      }
                    >
                      {STATUS_ES[r.status] || r.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    {next ? (
                      <Button
                        variant="ghost"
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
                    {r.status !== "CANCELLED" && r.status !== "RECEIVED" ? (
                      <Button
                        variant="ghost"
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
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
