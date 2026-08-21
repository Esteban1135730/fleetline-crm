"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button } from "@fsg/ui";
import {
  Building2,
  CheckCircle2,
  Package,
  Plus,
  ShoppingCart,
  ShieldAlert,
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

/** Cupo mensual operativo (Compras · PDF segundas). */
const MONTHLY_BUDGET_COP = 15_000_000;

type SupplierOpt = {
  id: string;
  name: string;
  nit: string;
  email?: string | null;
  phone?: string | null;
  rating: number;
  productTags?: string[];
  sarlaftBlocked?: boolean;
  active?: boolean;
};

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
  supplierId: "",
  amount: "",
  quantity: "1",
  category: "GENERAL",
  requestedBy: "",
};

const emptySupplierForm = {
  name: "",
  nit: "",
  email: "",
  phone: "",
  productTags: "",
  bankName: "",
  bankAccountNumber: "",
};

function formatCop(n: number) {
  if (!Number.isFinite(n) || n < 0) return "";
  const abs = Math.round(n);
  const s = String(abs);
  if (s.length <= 6) return `$${abs.toLocaleString("es-CO")}`;
  const head = Number(s.slice(0, -6)).toLocaleString("es-CO");
  const tail = s.slice(-6);
  return `$${head}´${tail.slice(0, 3)}.${tail.slice(3)}`;
}

export default function ComprasPage() {
  const [rows, setRows] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOpt[]>([]);
  const [slideOpen, setSlideOpen] = useState(false);
  const [supplierSlideOpen, setSupplierSlideOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [supplierForm, setSupplierForm] = useState(emptySupplierForm);
  const [formError, setFormError] = useState("");
  const [supplierError, setSupplierError] = useState("");
  const [busy, setBusy] = useState(false);
  const [supplierBusy, setSupplierBusy] = useState(false);

  async function load() {
    const [orders, supplierList] = await Promise.all([
      api<Purchase[]>("/compras/orders"),
      api<SupplierOpt[]>("/compras/proveedores").catch(async () => {
        const dash = await api<{ savings?: { suppliers?: SupplierOpt[] } }>(
          "/compras/dashboard",
        ).catch(() => ({ savings: { suppliers: [] as SupplierOpt[] } }));
        return dash.savings?.suppliers ?? [];
      }),
    ]);
    setRows(orders);
    setSuppliers(Array.isArray(supplierList) ? supplierList : []);
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
    const presupuestoDisponible = Math.max(0, MONTHLY_BUDGET_COP - monthSpend);
    return { pending, monthSpend, presupuestoDisponible };
  }, [rows]);

  const draftAmount = Number(form.amount.replace(/\D/g, "") || 0);
  const budgetImpactPct = useMemo(() => {
    if (!draftAmount || !MONTHLY_BUDGET_COP) return 0;
    return Math.min(100, Math.round((draftAmount / MONTHLY_BUDGET_COP) * 100));
  }, [draftAmount]);

  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.id === form.supplierId),
    [suppliers, form.supplierId],
  );

  const overBudget =
    draftAmount > Math.max(0, MONTHLY_BUDGET_COP - kpis.monthSpend);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    const qty = Math.max(1, Number(form.quantity.replace(/\D/g, "")) || 1);
    const amount = Number(form.amount.replace(/\D/g, ""));
    if (!form.description.trim()) {
      setFormError("Indique la descripción de la compra");
      return;
    }
    if (!form.supplierId) {
      setFormError("Seleccione un proveedor homologado del directorio");
      return;
    }
    if (selectedSupplier?.sarlaftBlocked) {
      setFormError(
        "Hard lock SARLAFT: proveedor bloqueado — no puede emitir OC",
      );
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError("Indique el valor en COP");
      return;
    }
    const disponible = Math.max(0, MONTHLY_BUDGET_COP - kpis.monthSpend);
    if (amount > disponible) {
      setFormError(
        `Hard lock presupuestal: excede el cupo disponible (${formatCop(disponible)}).`,
      );
      return;
    }
    const desc =
      qty > 1
        ? `${form.description.trim()} · ×${qty}`
        : form.description.trim();
    setBusy(true);
    try {
      await api("/compras/orders", {
        method: "POST",
        body: JSON.stringify({
          description: desc,
          supplierId: form.supplierId,
          supplier: selectedSupplier?.name ?? "",
          amount,
          category: form.category,
          requestedBy: form.requestedBy.trim() || undefined,
          quantity: qty,
        }),
      });
      setForm(emptyForm);
      setSlideOpen(false);
      await load();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "No se pudo crear la solicitud",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onCreateSupplier(e: FormEvent) {
    e.preventDefault();
    setSupplierError("");
    if (!supplierForm.name.trim() || supplierForm.name.trim().length < 2) {
      setSupplierError("Indique la razón social del proveedor");
      return;
    }
    if (!supplierForm.nit.trim() || supplierForm.nit.trim().length < 5) {
      setSupplierError("Indique el NIT del proveedor");
      return;
    }
    setSupplierBusy(true);
    try {
      const created = await api<SupplierOpt>("/compras/proveedores", {
        method: "POST",
        body: JSON.stringify({
          name: supplierForm.name.trim(),
          nit: supplierForm.nit.trim(),
          email: supplierForm.email.trim() || undefined,
          phone: supplierForm.phone.trim() || undefined,
          productTags: supplierForm.productTags.trim() || undefined,
          bankName: supplierForm.bankName.trim() || undefined,
          bankAccountNumber: supplierForm.bankAccountNumber.trim() || undefined,
        }),
      });
      setSupplierForm(emptySupplierForm);
      setSupplierSlideOpen(false);
      await load();
      setForm((f) => ({ ...f, supplierId: created.id }));
      setSlideOpen(true);
    } catch (err) {
      setSupplierError(
        err instanceof Error ? err.message : "No se pudo homologar el proveedor",
      );
    } finally {
      setSupplierBusy(false);
    }
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
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              className="w-auto px-3 py-2"
              onClick={() => {
                setSupplierError("");
                setSupplierSlideOpen(true);
              }}
            >
              <Building2 className="mr-1 h-4 w-4" />
              Homologar proveedor
            </Button>
            <Button
              type="button"
              variant="primary"
              className="w-auto"
              onClick={() => {
                setFormError("");
                setSlideOpen(true);
              }}
            >
              <Plus className="mr-1 h-4 w-4" />
              Crear Solicitud de Compra
            </Button>
          </div>
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
          value={formatCop(kpis.monthSpend)}
          tone="neutral"
          icon={<ShoppingCart />}
        />
        <KpiCard
          label="Presupuesto Disponible"
          value={formatCop(kpis.presupuestoDisponible)}
          tone={
            kpis.presupuestoDisponible <= MONTHLY_BUDGET_COP * 0.15
              ? "danger"
              : kpis.presupuestoDisponible <= MONTHLY_BUDGET_COP * 0.35
                ? "warn"
                : "ok"
          }
          delta={`Cupo mensual ${formatCop(MONTHLY_BUDGET_COP)}`}
          icon={<Wallet />}
        />
      </div>

      <section className="fsg-panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--brand-line)] px-4 py-3">
          <div>
            <h2 className="font-display text-sm font-semibold">
              Directorio de proveedores
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Homologación comercial — no crea usuarios del CRM
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            className="w-auto px-3 py-2"
            onClick={() => {
              setSupplierError("");
              setSupplierSlideOpen(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" />
            Nuevo proveedor
          </Button>
        </div>
        {!suppliers.length ? (
          <div className="p-6">
            <EmptyState
              icon={<Building2 className="h-7 w-7" />}
              title="Sin proveedores homologados"
              description="Registre NIT y razón social para usarlos en órdenes de compra."
              actionLabel="+ Homologar proveedor"
              onAction={() => {
                setSupplierError("");
                setSupplierSlideOpen(true);
              }}
            />
          </div>
        ) : (
          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {suppliers.map((s) => (
              <article
                key={s.id}
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {s.name}
                  </p>
                  <StatusPulseBadge
                    tone={s.sarlaftBlocked ? "danger" : "active"}
                    pulse={false}
                  >
                    {s.sarlaftBlocked ? "BLOQUEO" : "OK"}
                  </StatusPulseBadge>
                </div>
                <p className="mt-1 font-mono text-xs text-[var(--text-secondary)]">
                  NIT {s.nit}
                </p>
                {s.email || s.phone ? (
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    {[s.email, s.phone].filter(Boolean).join(" · ")}
                  </p>
                ) : null}
                {s.productTags?.length ? (
                  <p className="mt-2 text-[11px] text-[var(--text-secondary)]">
                    {s.productTags.slice(0, 4).join(" · ")}
                  </p>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  className="mt-3 w-auto px-2 py-1 text-xs"
                  disabled={Boolean(s.sarlaftBlocked)}
                  onClick={() => {
                    setForm((f) => ({ ...f, supplierId: s.id }));
                    setFormError("");
                    setSlideOpen(true);
                  }}
                >
                  Usar en OC
                </Button>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="fsg-panel data-shell overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--brand-line)] px-4 py-3">
          <span className="font-display text-sm font-semibold">
            Órdenes ({rows.length})
          </span>
          <Button
            type="button"
            variant="primary"
            className="w-auto"
            onClick={() => {
              setFormError("");
              setSlideOpen(true);
            }}
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
              onAction={() => {
                setFormError("");
                setSlideOpen(true);
              }}
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
                      {formatCop(Number(r.amount || 0))}
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
                        {next === "RECEIVED" ? (
                          <span className="mr-2 text-[10px] text-[var(--text-secondary)]">
                            3-Way → CxP
                          </span>
                        ) : null}
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
        description="3-Way Matching · Hard lock presupuestal activo"
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
              data-testid="compras-submit"
              disabled={busy || overBudget || selectedSupplier?.sarlaftBlocked}
            >
              {overBudget ? "Cupo excedido" : "Crear solicitud"}
            </Button>
          </>
        }
      >
        <form
          id="compras-create-form"
          onSubmit={onCreate}
          className="grid gap-3"
        >
          <div className="rounded-lg border border-[var(--border-subtle)] p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                Impacto presupuestal
              </span>
              <span
                className={`font-data tabular-nums ${overBudget ? "text-[var(--accent-alert)]" : "text-[var(--accent-primary)]"}`}
              >
                {budgetImpactPct}%
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--border-subtle)]">
              <div
                className={`h-full transition-all duration-150 ${overBudget ? "bg-[var(--accent-alert)]" : budgetImpactPct >= 70 ? "bg-[var(--accent-metric)]" : "bg-[var(--accent-primary)]"}`}
                style={{ width: `${Math.min(100, budgetImpactPct)}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] text-[var(--text-secondary)]">
              Disponible: {formatCop(kpis.presupuestoDisponible)} · Cupo{" "}
              {formatCop(MONTHLY_BUDGET_COP)}
            </p>
            {overBudget ? (
              <p className="mt-1 flex items-center gap-1 text-xs text-[var(--accent-alert)]">
                <ShieldAlert className="h-3.5 w-3.5" />
                Hard lock — requiere aprobación financiera
              </p>
            ) : null}
          </div>

          {formError ? (
            <p
              role="alert"
              className="rounded border border-[var(--brand-signal)]/40 bg-[var(--brand-signal)]/10 px-3 py-2 text-sm text-[var(--brand-signal)]"
            >
              {formError}
            </p>
          ) : null}
          <label className="text-xs text-slate-400">
            Descripción
            <input
              className="field mt-1 w-full"
              data-field="text"
              placeholder="Ej. Compra de botellas de agua"
              data-testid="compras-description"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              required
            />
          </label>
          <label className="text-xs text-[var(--text-secondary)]">
            Proveedor homologado
            <select
              className="field mt-1 w-full"
              data-testid="compras-supplier"
              value={form.supplierId}
              onChange={(e) =>
                setForm({ ...form, supplierId: e.target.value })
              }
              required
            >
              <option value="">Seleccionar proveedor…</option>
              {suppliers.map((s) => (
                <option
                  key={s.id}
                  value={s.id}
                  disabled={Boolean(s.sarlaftBlocked)}
                >
                  {s.name} · NIT {s.nit}
                  {s.sarlaftBlocked ? " · SARLAFT bloqueado" : ""}
                </option>
              ))}
            </select>
            {selectedSupplier?.sarlaftBlocked ? (
              <p className="mt-1 flex items-center gap-1 text-xs text-[var(--accent-alert)]">
                <ShieldAlert className="h-3.5 w-3.5" />
                Proveedor sin auditoría SARLAFT — OC bloqueada
              </p>
            ) : selectedSupplier ? (
              <p className="mt-1 text-[10px] text-[var(--text-secondary)]">
                Rating {selectedSupplier.rating.toFixed(1)}/5 · homologado
              </p>
            ) : suppliers.length === 0 ? (
              <p className="mt-1 text-[10px] text-[var(--accent-metric)]">
                Sin proveedores —{" "}
                <button
                  type="button"
                  className="underline underline-offset-2"
                  onClick={() => {
                    setSlideOpen(false);
                    setSupplierError("");
                    setSupplierSlideOpen(true);
                  }}
                >
                  homologar ahora
                </button>
              </p>
            ) : null}
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-slate-400">
              Cantidad
              <input
                className="field mt-1 w-full font-data"
                data-field="integer"
                inputMode="numeric"
                placeholder="1"
                data-testid="compras-qty"
                value={form.quantity}
                onChange={(e) =>
                  setForm({
                    ...form,
                    quantity: e.target.value.replace(/\D/g, "").slice(0, 6) || "",
                  })
                }
                required
              />
            </label>
            <label className="text-xs text-slate-400">
              Valor COP
              <input
                className="field mt-1 w-full font-data"
                data-field="skip"
                inputMode="numeric"
                placeholder="$600.000"
                data-testid="compras-amount"
                value={
                  form.amount ? formatCop(Number(form.amount)) : ""
                }
                onChange={(e) =>
                  setForm({
                    ...form,
                    amount: e.target.value.replace(/\D/g, "").slice(0, 12),
                  })
                }
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
              data-field="text"
              placeholder="Área o nombre"
              value={form.requestedBy}
              onChange={(e) =>
                setForm({ ...form, requestedBy: e.target.value })
              }
            />
          </label>
        </form>
      </SlideOver>

      <SlideOver
        open={supplierSlideOpen}
        onClose={() => setSupplierSlideOpen(false)}
        title="Homologar proveedor"
        description="Directorio comercial. No crea cuenta de usuario ni acceso al CRM."
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              className="w-auto px-4 py-2"
              onClick={() => setSupplierSlideOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="compras-supplier-form"
              variant="primary"
              className="w-auto px-4 py-2"
              loading={supplierBusy}
              disabled={supplierBusy}
            >
              Guardar proveedor
            </Button>
          </>
        }
      >
        <form
          id="compras-supplier-form"
          onSubmit={(e) => void onCreateSupplier(e)}
          className="space-y-3"
        >
          {supplierError ? (
            <p
              role="alert"
              className="rounded border border-[var(--accent-alert)]/40 bg-[color-mix(in_srgb,var(--accent-alert)_10%,transparent)] px-3 py-2 text-sm text-[var(--accent-alert)]"
            >
              {supplierError}
            </p>
          ) : null}
          <label className="text-xs text-[var(--text-secondary)]">
            Razón social
            <input
              className="field mt-1 w-full"
              value={supplierForm.name}
              onChange={(e) =>
                setSupplierForm({ ...supplierForm, name: e.target.value })
              }
              placeholder="Ej. Repuestos del Norte SAS"
              required
              autoFocus
            />
          </label>
          <label className="text-xs text-[var(--text-secondary)]">
            NIT
            <input
              className="field mt-1 w-full font-mono"
              value={supplierForm.nit}
              onChange={(e) =>
                setSupplierForm({ ...supplierForm, nit: e.target.value })
              }
              placeholder="900111222-3"
              required
            />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs text-[var(--text-secondary)]">
              Correo
              <input
                className="field mt-1 w-full"
                type="email"
                value={supplierForm.email}
                onChange={(e) =>
                  setSupplierForm({ ...supplierForm, email: e.target.value })
                }
                placeholder="ventas@proveedor.com"
              />
            </label>
            <label className="text-xs text-[var(--text-secondary)]">
              Teléfono
              <input
                className="field mt-1 w-full font-mono"
                value={supplierForm.phone}
                onChange={(e) =>
                  setSupplierForm({ ...supplierForm, phone: e.target.value })
                }
                placeholder="6015550101"
              />
            </label>
          </div>
          <label className="text-xs text-[var(--text-secondary)]">
            Categorías / tags (separados por coma)
            <input
              className="field mt-1 w-full"
              value={supplierForm.productTags}
              onChange={(e) =>
                setSupplierForm({
                  ...supplierForm,
                  productTags: e.target.value,
                })
              }
              placeholder="frenos, filtros, aceite"
            />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs text-[var(--text-secondary)]">
              Banco (opcional)
              <input
                className="field mt-1 w-full"
                value={supplierForm.bankName}
                onChange={(e) =>
                  setSupplierForm({ ...supplierForm, bankName: e.target.value })
                }
              />
            </label>
            <label className="text-xs text-[var(--text-secondary)]">
              Cuenta (opcional)
              <input
                className="field mt-1 w-full font-mono"
                value={supplierForm.bankAccountNumber}
                onChange={(e) =>
                  setSupplierForm({
                    ...supplierForm,
                    bankAccountNumber: e.target.value,
                  })
                }
              />
            </label>
          </div>
        </form>
      </SlideOver>
    </div>
  );
}
