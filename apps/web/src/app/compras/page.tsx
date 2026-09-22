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
import {
  EmptyState,
  KpiCard,
  SlideOver,
  StatusPulseBadge,
} from "@/components/audit";
import { SarlaftBlockBadge } from "@/components/sarlaft/sarlaft-block-badge";
import { BentoPanel } from "@/components/nexa/bento-panel";
import { NexaTable, NexaRow, NexaCell } from "@/components/nexa/nexa-table";

type SupplierOpt = {
  id: string;
  name: string;
  nit: string;
  email?: string | null;
  phone?: string | null;
  rating: number;
  productTags?: string[];
  sarlaftBlocked?: boolean;
  sarlaftRiskScore?: number;
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

type ComprasBudget = {
  monthlyLimit: number;
  spentThisMonth: number;
  available: number;
  currency: string;
};

const STATUS_FLOW = ["REQUESTED", "APPROVED", "ORDERED", "RECEIVED"] as const;
const STATUS_ES: Record<string, string> = {
  REQUESTED: "Pendiente",
  APPROVED: "Aprobada",
  ORDERED: "En camino",
  RECEIVED: "Recibida",
  CANCELLED: "Cancelada",
};

function purchaseStatusTone(
  status: string,
): "active" | "fatiga" | "danger" | "neutral" {
  if (status === "RECEIVED") return "active";
  if (status === "CANCELLED") return "danger";
  if (status === "ORDERED") return "fatiga";
  if (status === "REQUESTED") return "fatiga";
  if (status === "APPROVED") return "active";
  return "neutral";
}

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
  return `$${Math.round(n).toLocaleString("es-CO")}`;
}

export default function ComprasPage() {
  const [rows, setRows] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOpt[]>([]);
  const [budget, setBudget] = useState<ComprasBudget | null>(null);
  const [slideOpen, setSlideOpen] = useState(false);
  const [supplierSlideOpen, setSupplierSlideOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [supplierForm, setSupplierForm] = useState(emptySupplierForm);
  const [formError, setFormError] = useState("");
  const [supplierError, setSupplierError] = useState("");
  const [busy, setBusy] = useState(false);
  const [supplierBusy, setSupplierBusy] = useState(false);

  async function load() {
    const [orders, supplierList, budgetRes] = await Promise.all([
      api<Purchase[]>("/compras/orders"),
      api<SupplierOpt[]>("/compras/proveedores").catch(async () => {
        const dash = await api<{ savings?: { suppliers?: SupplierOpt[] } }>(
          "/compras/dashboard",
        ).catch(() => ({ savings: { suppliers: [] as SupplierOpt[] } }));
        return dash.savings?.suppliers ?? [];
      }),
      api<ComprasBudget>("/compras/budget").catch(() => null),
    ]);
    setRows(orders);
    setSuppliers(Array.isArray(supplierList) ? supplierList : []);
    setBudget(budgetRes);
  }

  useEffect(() => {
    void load().catch(console.error);
  }, []);

  const monthlyLimit = budget?.monthlyLimit ?? 0;
  const kpis = useMemo(() => {
    const pending = rows.filter((r) => r.status === "REQUESTED").length;
    const monthSpend = budget?.spentThisMonth ?? 0;
    const presupuestoDisponible =
      budget?.available ?? Math.max(0, monthlyLimit - monthSpend);
    return { pending, monthSpend, presupuestoDisponible };
  }, [rows, budget, monthlyLimit]);

  const draftAmount = Number(form.amount.replace(/\D/g, "") || 0);
  const budgetImpactPct = useMemo(() => {
    if (!draftAmount || !monthlyLimit) return 0;
    return Math.min(100, Math.round((draftAmount / monthlyLimit) * 100));
  }, [draftAmount, monthlyLimit]);

  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.id === form.supplierId),
    [suppliers, form.supplierId],
  );

  const overBudget =
    monthlyLimit > 0 &&
    draftAmount > Math.max(0, monthlyLimit - kpis.monthSpend);

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
      setFormError("Seleccione un proveedor del directorio");
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
    const disponible = Math.max(0, monthlyLimit - kpis.monthSpend);
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
        err instanceof Error ? err.message : "No se pudo agregar el proveedor",
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
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-border pb-4">
        <div>
          <p className="font-data text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-primary">
            Compras
          </p>
          <h1 className="font-sans text-2xl font-semibold tracking-tight text-brand-text-primary md:text-3xl">
            Compras y proveedores
          </h1>
        </div>
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
            Agregar proveedor
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
            Crear solicitud
          </Button>
        </div>
      </header>

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
            monthlyLimit > 0 &&
            kpis.presupuestoDisponible <= monthlyLimit * 0.15
              ? "danger"
              : monthlyLimit > 0 &&
                  kpis.presupuestoDisponible <= monthlyLimit * 0.35
                ? "warn"
                : "ok"
          }
          delta={`Cupo mensual ${formatCop(monthlyLimit)}`}
          icon={<Wallet />}
        />
      </div>

      <section className="nexa-panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--brand-border)] px-4 py-3">
          <div>
            <h2 className="font-display text-sm font-semibold">
              Directorio de proveedores
            </h2>
            <p className="text-xs text-[var(--brand-text-secondary)]">
              Alta en directorio comercial — no crea usuarios del CRM
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
              title="Sin proveedores registrados"
              description="Registre NIT y razón social para usarlos en órdenes de compra."
              actionLabel="+ Agregar proveedor"
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
                className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-canvas)] p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-[var(--brand-text-primary)]">
                    {s.name}
                  </p>
                  {s.sarlaftBlocked ? (
                    <SarlaftBlockBadge blocked riskScore={s.sarlaftRiskScore} />
                  ) : (
                    <StatusPulseBadge tone="active" pulse={false}>
                      OK
                    </StatusPulseBadge>
                  )}
                </div>
                <p className="mt-1 font-mono text-xs text-[var(--brand-text-secondary)]">
                  NIT {s.nit}
                </p>
                {s.email || s.phone ? (
                  <p className="mt-1 text-xs text-[var(--brand-text-secondary)]">
                    {[s.email, s.phone].filter(Boolean).join(" · ")}
                  </p>
                ) : null}
                {s.productTags?.length ? (
                  <p className="mt-2 text-[11px] text-[var(--brand-text-secondary)]">
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

      <BentoPanel
        title="Órdenes de compra"
        subtitle={`${rows.length} solicitudes`}
        icon={<Package className="h-4 w-4" />}
        action={
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
            Nueva OC
          </Button>
        }
      >
        {!rows.length ? (
          <EmptyState
            icon={<Package className="h-7 w-7" />}
            title="Sin solicitudes de compra"
            description="Crea una OC con descripción, proveedor, cantidad y valor."
            actionLabel="+ Crear solicitud"
            onAction={() => {
              setFormError("");
              setSlideOpen(true);
            }}
          />
        ) : (
          <NexaTable columns={["Orden", "Proveedor", "Valor", "Estado", ""]}>
            {rows.map((r) => {
              const next = nextStatus(r.status);
              return (
                <NexaRow key={r.id}>
                  <NexaCell>
                    <span className="font-data text-xs text-brand-primary">{r.code}</span>
                    <div>{r.description}</div>
                    <div className="text-[11px] text-brand-text-secondary">{r.category}</div>
                  </NexaCell>
                  <NexaCell>{r.supplier}</NexaCell>
                  <NexaCell mono>{formatCop(Number(r.amount || 0))}</NexaCell>
                  <NexaCell>
                    <StatusPulseBadge
                      tone={purchaseStatusTone(r.status)}
                      pulse={
                        r.status === "REQUESTED" || r.status === "ORDERED"
                      }
                    >
                      {STATUS_ES[r.status] || r.status}
                    </StatusPulseBadge>
                  </NexaCell>
                  <NexaCell>
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
                      {r.status !== "CANCELLED" && r.status !== "RECEIVED" ? (
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
                  </NexaCell>
                </NexaRow>
              );
            })}
          </NexaTable>
        )}
      </BentoPanel>

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
          <div className="rounded-lg border border-[var(--brand-border)] p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold uppercase tracking-wide text-[var(--brand-text-secondary)]">
                Impacto presupuestal
              </span>
              <span
                className={`font-data tabular-nums ${overBudget ? "text-[var(--brand-danger)]" : "text-[var(--brand-primary)]"}`}
              >
                {budgetImpactPct}%
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--brand-border)]">
              <div
                className={`h-full transition-all duration-150 ${overBudget ? "bg-[var(--brand-danger)]" : budgetImpactPct >= 70 ? "bg-[var(--brand-warning)]" : "bg-[var(--brand-primary)]"}`}
                style={{ width: `${Math.min(100, budgetImpactPct)}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] text-[var(--brand-text-secondary)]">
              Disponible: {formatCop(kpis.presupuestoDisponible)} · Cupo{" "}
              {formatCop(monthlyLimit)}
            </p>
            {overBudget ? (
              <p className="mt-1 flex items-center gap-1 text-xs text-[var(--brand-danger)]">
                <ShieldAlert className="h-3.5 w-3.5" />
                Hard lock — requiere aprobación financiera
              </p>
            ) : null}
          </div>

          {formError ? (
            <p
              role="alert"
              className="rounded border border-[var(--brand-danger)]/40 bg-[var(--brand-danger)]/10 px-3 py-2 text-sm text-[var(--brand-danger)]"
            >
              {formError}
            </p>
          ) : null}
          <label className="text-xs text-brand-text-secondary">
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
          <label className="text-xs text-[var(--brand-text-secondary)]">
            Proveedor
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
              <p className="mt-1 flex items-center gap-1 text-xs text-[var(--brand-danger)]">
                <ShieldAlert className="h-3.5 w-3.5" />
                Proveedor sin auditoría SARLAFT — OC bloqueada
              </p>
            ) : selectedSupplier ? (
              <p className="mt-1 text-[10px] text-[var(--brand-text-secondary)]">
                Rating {selectedSupplier.rating.toFixed(1)}/5 · en directorio
              </p>
            ) : suppliers.length === 0 ? (
              <p className="mt-1 text-[10px] text-[var(--brand-warning)]">
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
                  agregar ahora
                </button>
              </p>
            ) : null}
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-brand-text-secondary">
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
            <label className="text-xs text-brand-text-secondary">
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
          <label className="text-xs text-brand-text-secondary">
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
          <label className="text-xs text-brand-text-secondary">
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
        title="Agregar proveedor"
        description="Alta en el directorio comercial. No crea cuenta de usuario ni acceso al CRM."
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
              className="rounded border border-[var(--brand-danger)]/40 bg-[color-mix(in_srgb,var(--brand-danger)_10%,transparent)] px-3 py-2 text-sm text-[var(--brand-danger)]"
            >
              {supplierError}
            </p>
          ) : null}
          <label className="text-xs text-[var(--brand-text-secondary)]">
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
          <label className="text-xs text-[var(--brand-text-secondary)]">
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
            <label className="text-xs text-[var(--brand-text-secondary)]">
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
            <label className="text-xs text-[var(--brand-text-secondary)]">
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
          <label className="text-xs text-[var(--brand-text-secondary)]">
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
            <label className="text-xs text-[var(--brand-text-secondary)]">
              Banco (opcional)
              <input
                className="field mt-1 w-full"
                value={supplierForm.bankName}
                onChange={(e) =>
                  setSupplierForm({ ...supplierForm, bankName: e.target.value })
                }
              />
            </label>
            <label className="text-xs text-[var(--brand-text-secondary)]">
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
