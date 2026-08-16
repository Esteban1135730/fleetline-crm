"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  QUOTE_DEFAULT_MARGIN_PCT,
  QUOTE_VEHICLE_COSTS,
  statusEs,
  type QuoteCostBreakdown,
  type QuoteVehicleType,
} from "@fsg/shared";
import { Badge, Button, Tooltip } from "@fsg/ui";
import {
  Calculator,
  FileText,
  Plus,
  Users,
} from "lucide-react";
import { api } from "@/lib/api";
import { PageIntro } from "@/components/page-intro";
import { EmptyState, Modal, StatusPulseBadge } from "@/components/audit";
import { useShell } from "@/lib/shell-context";

type Customer = {
  id: string;
  name: string;
  nit: string;
  segment: string;
  email?: string | null;
  phone?: string | null;
  _count?: { quotes: number; trips: number; contracts: number };
};

type Quote = {
  id: string;
  code: string;
  amount: string | number;
  status: string;
  notes?: string | null;
  calcJson?: QuoteCostBreakdown | null;
  customer: { name: string };
  draftTrip?: { id: string; code: string; status: string } | null;
};

type Contract = {
  id: string;
  code: string;
  name: string;
  channel: string;
  status: string;
  route?: string | null;
  monthlyValue?: string | number | null;
  endDate?: string | null;
  customer: { name: string };
  _count: { trips: number };
};

type TabId = "cotizador" | "contratos" | "clientes";

const CHANNEL_ES: Record<string, string> = {
  PRIVATE: "Empresa privada",
  PUBLIC_TENDER: "Licitación pública",
};

const TABS: { id: TabId; label: string; icon: typeof Calculator }[] = [
  { id: "cotizador", label: "Cotizador", icon: Calculator },
  { id: "contratos", label: "Contratos Operativos", icon: FileText },
  { id: "clientes", label: "Directorio de Clientes", icon: Users },
];

function customerOrigin(c: Customer): {
  label: string;
  tone: "emerald" | "amber" | "info";
  detail: string;
} {
  const contracts = c._count?.contracts ?? 0;
  const quotes = c._count?.quotes ?? 0;
  if (contracts > 0) {
    return {
      label: "Contrato",
      tone: "emerald",
      detail:
        quotes > 0
          ? `${contracts} contrato${contracts === 1 ? "" : "s"} · ${quotes} cotización${quotes === 1 ? "" : "es"}`
          : `${contracts} contrato${contracts === 1 ? "" : "s"} operativo${contracts === 1 ? "" : "s"}`,
    };
  }
  if (quotes > 0) {
    return {
      label: "Solo cotización",
      tone: "amber",
      detail: `${quotes} cotización${quotes === 1 ? "" : "es"} · sin contrato`,
    };
  }
  return {
    label: "Directorio",
    tone: "info",
    detail: "Sin cotización ni contrato",
  };
}

function money(n: number) {
  return formatCop(n);
}

/** COP colombiano: 11000000 → $11´000.000 */
function formatCop(n: number) {
  if (!Number.isFinite(n)) return "";
  const abs = Math.round(Math.abs(n));
  const sign = n < 0 ? "-" : "";
  const s = String(abs);
  if (s.length <= 6) {
    return `${sign}$${abs.toLocaleString("es-CO")}`;
  }
  const head = Number(s.slice(0, -6)).toLocaleString("es-CO");
  const tail = s.slice(-6);
  return `${sign}$${head}´${tail.slice(0, 3)}.${tail.slice(3)}`;
}

const MARGIN_TIP =
  "Calculado automáticamente con un margen objetivo del 30% sobre costos de ruta y peajes (ajustable en el cotizador).";

export default function ComercialPage() {
  const { openInspector } = useShell();
  const [tab, setTab] = useState<TabId>("cotizador");
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [customerError, setCustomerError] = useState("");
  const [customerBusy, setCustomerBusy] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [customerForm, setCustomerForm] = useState({
    name: "",
    nit: "",
    email: "",
    phone: "",
    segment: "B2B" as "B2B" | "ESCOLAR" | "TURISMO",
  });
  const [contractError, setContractError] = useState("");
  const [contractBusy, setContractBusy] = useState(false);
  const [contractForm, setContractForm] = useState({
    name: "",
    customerId: "",
    channel: "PRIVATE" as "PRIVATE" | "PUBLIC_TENDER",
    route: "",
    startDate: "",
    endDate: "",
    monthlyValue: "",
  });

  const [calcForm, setCalcForm] = useState({
    customerId: "",
    origen: "Bogotá",
    destino: "Medellín",
    tipoVehiculo: "BUS" as QuoteVehicleType,
    distanciaKm: "420",
    cantidadPeajes: "8",
    margenDeseado: String(QUOTE_DEFAULT_MARGIN_PCT),
  });
  const [breakdown, setBreakdown] = useState<QuoteCostBreakdown | null>(null);
  const [calcBusy, setCalcBusy] = useState(false);
  const [calcError, setCalcError] = useState("");

  async function load() {
    const [c, q, ctr] = await Promise.all([
      api<Customer[]>("/comercial/customers"),
      api<Quote[]>("/comercial/quotes"),
      api<Contract[]>("/comercial/contracts"),
    ]);
    setCustomers(c);
    setQuotes(q);
    setContracts(ctr);
    if (!contractForm.customerId && c[0])
      setContractForm((f) => ({ ...f, customerId: c[0].id }));
    if (!calcForm.customerId && c[0])
      setCalcForm((f) => ({ ...f, customerId: c[0].id }));
  }

  useEffect(() => {
    void load().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const calcPayload = useMemo(
    () => ({
      origen: calcForm.origen,
      destino: calcForm.destino,
      tipoVehiculo: calcForm.tipoVehiculo,
      distanciaKm: Number(calcForm.distanciaKm) || 0,
      cantidadPeajes: Number(calcForm.cantidadPeajes) || 0,
      margenDeseado: Number(calcForm.margenDeseado) || QUOTE_DEFAULT_MARGIN_PCT,
    }),
    [calcForm],
  );

  async function runCalculate() {
    setCalcBusy(true);
    setCalcError("");
    try {
      const result = await api<QuoteCostBreakdown>(
        "/comercial/quotes/calculate",
        {
          method: "POST",
          body: JSON.stringify(calcPayload),
        },
      );
      setBreakdown(result);
    } catch (err) {
      setBreakdown(null);
      setCalcError(
        err instanceof Error ? err.message : "Fallo de cálculo — conexión",
      );
    } finally {
      setCalcBusy(false);
    }
  }

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (
        calcForm.origen.trim() &&
        calcForm.destino.trim() &&
        Number(calcForm.distanciaKm) > 0
      ) {
        void runCalculate();
      }
    }, 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calcPayload]);

  function closeCustomerModal() {
    setCustomerModalOpen(false);
    setEditingCustomerId(null);
    setCustomerError("");
    setCustomerForm({
      name: "",
      nit: "",
      email: "",
      phone: "",
      segment: "B2B",
    });
  }

  function openNewCustomer() {
    setEditingCustomerId(null);
    setCustomerError("");
    setCustomerForm({
      name: "",
      nit: "",
      email: "",
      phone: "",
      segment: "B2B",
    });
    setCustomerModalOpen(true);
  }

  function openEditCustomer(c: Customer) {
    setEditingCustomerId(c.id);
    setCustomerError("");
    setCustomerForm({
      name: c.name,
      nit: c.nit,
      email: c.email || "",
      phone: c.phone || "",
      segment:
        c.segment === "ESCOLAR" || c.segment === "TURISMO"
          ? c.segment
          : "B2B",
    });
    setCustomerModalOpen(true);
  }

  async function onSaveCustomer(e: FormEvent) {
    e.preventDefault();
    setCustomerError("");
    setCustomerBusy(true);
    try {
      if (editingCustomerId) {
        await api(`/comercial/customers/${editingCustomerId}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: customerForm.name.trim(),
            email: customerForm.email.trim() || undefined,
            phone: customerForm.phone.trim() || undefined,
            segment: customerForm.segment,
          }),
        });
      } else {
        await api("/comercial/customers", {
          method: "POST",
          body: JSON.stringify({
            name: customerForm.name.trim(),
            nit: customerForm.nit.trim(),
            email: customerForm.email.trim() || undefined,
            phone: customerForm.phone.trim() || undefined,
            segment: customerForm.segment,
          }),
        });
      }
      closeCustomerModal();
      await load();
    } catch (err) {
      setCustomerError(
        err instanceof Error ? err.message : "No se pudo guardar el cliente",
      );
    } finally {
      setCustomerBusy(false);
    }
  }

  async function onCreateContract(e: FormEvent) {
    e.preventDefault();
    setContractError("");
    const monthlyRaw = contractForm.monthlyValue.replace(/\D/g, "");
    if (!monthlyRaw) {
      setContractError("Indique el valor mensual del contrato");
      return;
    }
    if (monthlyRaw.length > 12) {
      setContractError("Valor mensual máximo: $999´999.999.999");
      return;
    }
    setContractBusy(true);
    try {
      await api("/comercial/contracts", {
        method: "POST",
        body: JSON.stringify({
          name: contractForm.name,
          customerId: contractForm.customerId,
          channel: contractForm.channel,
          route: contractForm.route,
          startDate: contractForm.startDate,
          endDate: contractForm.endDate,
          monthlyValue: Number(monthlyRaw),
        }),
      });
      setContractForm((f) => ({
        ...f,
        name: "",
        route: "",
        monthlyValue: "",
      }));
      await load();
    } catch (err) {
      setContractError(
        err instanceof Error ? err.message : "No se pudo crear el contrato",
      );
    } finally {
      setContractBusy(false);
    }
  }

  async function saveQuoteFromCalc(e: FormEvent) {
    e.preventDefault();
    if (!breakdown) {
      setCalcError("Calcule la tarifa antes de guardar la cotización");
      return;
    }
    await api("/comercial/quotes", {
      method: "POST",
      body: JSON.stringify({
        customerId: calcForm.customerId,
        calc: calcPayload,
        notes: `${breakdown.origen} → ${breakdown.destino} · ${breakdown.tipoVehiculoLabel}`,
      }),
    });
    await load();
  }

  async function approveAndConvert(q: Quote) {
    const res = await api<
      Quote & { draftTrip?: { code: string; id?: string }; tripError?: string | null }
    >(`/comercial/quotes/${q.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "WON" }),
    });
    await load();
    const tripCode = res.draftTrip?.code;
    openInspector(
      `${q.code} · convertida`,
      <div className="space-y-3 text-sm">
        <p className="font-semibold text-[var(--accent-primary)]">
          Cotización ganada — viaje borrador generado
        </p>
        {res.tripError ? (
          <p role="alert" className="text-[var(--brand-signal)]">
            {res.tripError}
          </p>
        ) : null}
        {tripCode ? (
          <>
            <p className="font-data text-xs text-[var(--text-primary)]">
              Viaje {tripCode} · Pendiente
            </p>
            <p className="text-xs text-[var(--text-secondary)]">
              Llega a Logística → Programación de servicios y seguimiento GPS.
              Queda sin conductor ni placa hasta que despacho lo asigne.
            </p>
            <Link
              href={`/logistica/servicios?code=${encodeURIComponent(tripCode)}`}
              className="inline-flex w-auto items-center rounded-md bg-[var(--brand-primary)] px-3 py-2 text-xs font-semibold text-[#04110c]"
            >
              Abrir en programación
            </Link>
          </>
        ) : (
          <p className="text-[var(--text-secondary)]">
            No se indexó el viaje. Vuelva a convertir o revise la conexión.
          </p>
        )}
      </div>,
    );
  }

  function openQuoteInspector(q: Quote) {
    const calc = q.calcJson;
    openInspector(
      `${q.code} · cotización`,
      <div className="space-y-4 text-sm">
        <div>
          <p className="font-data text-[10px] uppercase tracking-[0.14em] text-[var(--accent-primary)]">
            {q.customer.name}
          </p>
          <p className="mt-1 font-data text-lg font-bold text-[var(--text-primary)]">
            {money(Number(q.amount))}
          </p>
          <p className="text-xs text-[var(--text-secondary)]">{statusEs(q.status)}</p>
        </div>
        {calc ? (
          <dl className="space-y-2 font-data text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--text-secondary)]">Ruta</dt>
              <dd>
                {calc.origen} → {calc.destino}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--text-secondary)]">Costo ruta</dt>
              <dd>{money(calc.costoDistancia)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--text-secondary)]">Peajes</dt>
              <dd>{money(calc.costoPeajes)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--text-secondary)]">Conductor</dt>
              <dd>{money(calc.pagoConductor)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--text-secondary)]">Costo operativo</dt>
              <dd>{money(calc.costoOperativo)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--text-secondary)]">Utilidad bruta</dt>
              <dd className="text-[var(--accent-metric)]">
                {money(calc.utilidadBruta)}
              </dd>
            </div>
            <div className="flex justify-between gap-2 border-t border-[var(--border-subtle)] pt-2">
              <dt className="text-[var(--text-secondary)]">Precio cliente</dt>
              <dd className="font-bold text-[var(--accent-primary)]">
                {money(calc.precioSugerido)}
              </dd>
            </div>
            <p className="text-[10px] text-[var(--text-secondary)]">
              Margen {calc.margenDeseado}%
            </p>
          </dl>
        ) : (
          <p className="text-[var(--text-secondary)]">
            {q.notes || "Sin desglose de cotizador"}
          </p>
        )}
        {q.draftTrip ? (
          <div className="space-y-2 border-t border-[var(--border-subtle)] pt-3">
            <p className="font-data text-xs text-[var(--text-primary)]">
              Viaje {q.draftTrip.code} · {q.draftTrip.status}
            </p>
            <p className="text-xs text-[var(--text-secondary)]">
              Logística → Programación de servicios y seguimiento GPS. Sin
              conductor ni placa hasta que despacho lo asigne.
            </p>
            <Link
              href={`/logistica/servicios?code=${encodeURIComponent(q.draftTrip.code)}`}
              className="inline-flex w-auto items-center rounded-md bg-[var(--brand-primary)] px-3 py-2 text-xs font-semibold text-[#04110c]"
            >
              Abrir en programación
            </Link>
          </div>
        ) : q.status === "DRAFT" ||
          q.status === "SENT" ||
          q.status === "APPROVED" ||
          q.status === "WON" ? (
          <div className="flex justify-end">
            <Button
              variant="primary"
              className="w-auto"
              title="Aprueba la cotización ganada y genera viaje borrador en Logística"
              onClick={() => void approveAndConvert(q)}
            >
              {q.status === "WON"
                ? "GENERAR VIAJE EN LOGÍSTICA"
                : "APROBAR Y CONVERTIR A VIAJE"}
            </Button>
          </div>
        ) : null}
      </div>,
    );
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <PageIntro
        module="comercial"
        title="Comercial y contratos"
        action={
          <Button
            type="button"
            variant="primary"
            className="w-auto"
            onClick={openNewCustomer}
          >
            <Plus className="mr-1 h-4 w-4" />
            Nuevo Cliente
          </Button>
        }
      />

      <div
        className="flex flex-wrap gap-1 border-b border-[var(--brand-line)]"
        role="tablist"
        aria-label="Secciones comercial"
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors duration-150 ${
                active
                  ? "border-[var(--brand-primary)] text-[var(--brand-primary)]"
                  : "border-transparent text-[var(--brand-muted)] hover:text-[var(--brand-fg)]"
              }`}
              onClick={() => setTab(t.id)}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "cotizador" ? (
        <div className="space-y-4">
          <section className="fsg-panel space-y-4 p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold tracking-tight">
                  Cotizador inteligente
                </h2>
                <p className="text-sm text-[var(--text-secondary)]">
                  Algoritmo: (km × costo/km + peajes + conductor) / (1 − margen)
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                className="w-auto"
                loading={calcBusy}
                title="Recalcular tarifa sugerida"
                onClick={() => void runCalculate()}
              >
                Recalcular
              </Button>
            </div>

            <form
              onSubmit={(e) => void saveQuoteFromCalc(e)}
              className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-4"
            >
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--text-secondary)]">
                Cliente
                <select
                  className="field"
                  value={calcForm.customerId}
                  onChange={(e) =>
                    setCalcForm({ ...calcForm, customerId: e.target.value })
                  }
                  required
                  title="Cliente de la cotización"
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--text-secondary)]">
                Origen
                <input
                  className="field"
                  placeholder="Ciudad o punto de origen"
                  value={calcForm.origen}
                  onChange={(e) =>
                    setCalcForm({ ...calcForm, origen: e.target.value })
                  }
                  required
                  title="Origen de la ruta"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--text-secondary)]">
                Destino
                <input
                  className="field"
                  placeholder="Ciudad o punto de destino"
                  value={calcForm.destino}
                  onChange={(e) =>
                    setCalcForm({ ...calcForm, destino: e.target.value })
                  }
                  required
                  title="Destino de la ruta"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--text-secondary)]">
                Tipo de vehículo
                <select
                  className="field"
                  value={calcForm.tipoVehiculo}
                  onChange={(e) =>
                    setCalcForm({
                      ...calcForm,
                      tipoVehiculo: e.target.value as QuoteVehicleType,
                    })
                  }
                  title="Tipo de unidad — costo/km y pago conductor"
                >
                  {(Object.keys(QUOTE_VEHICLE_COSTS) as QuoteVehicleType[]).map(
                    (k) => (
                      <option key={k} value={k}>
                        {QUOTE_VEHICLE_COSTS[k].label}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--text-secondary)]">
                Kilómetros recorridos
                <input
                  className="field font-data"
                  type="number"
                  min={1}
                  placeholder="Ej. 360"
                  value={calcForm.distanciaKm}
                  onChange={(e) =>
                    setCalcForm({ ...calcForm, distanciaKm: e.target.value })
                  }
                  required
                  title="Kilómetros recorridos en la ruta"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--text-secondary)]">
                Peajes
                <input
                  className="field font-data"
                  type="number"
                  min={0}
                  placeholder="Cantidad"
                  value={calcForm.cantidadPeajes}
                  onChange={(e) =>
                    setCalcForm({ ...calcForm, cantidadPeajes: e.target.value })
                  }
                  title="Número de peajes en la ruta"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--text-secondary)]">
                Porcentaje de rentabilidad
                <input
                  className="field font-data"
                  type="number"
                  min={1}
                  max={80}
                  placeholder="%"
                  value={calcForm.margenDeseado}
                  onChange={(e) =>
                    setCalcForm({ ...calcForm, margenDeseado: e.target.value })
                  }
                  title={MARGIN_TIP}
                />
              </label>
              <div className="flex items-end justify-end md:col-span-3 lg:col-span-1">
                <Button
                  type="submit"
                  variant="primary"
                  className="w-auto"
                  title="Guarda cotización en borrador con precio sugerido y desglose"
                >
                  Guardar cotización
                </Button>
              </div>
            </form>

            {calcError ? (
              <p className="text-sm text-[var(--accent-alert)]">{calcError}</p>
            ) : null}

            {breakdown ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Tooltip
                  content="Costo de distancia: km × costo/km del tipo de unidad"
                  side="top"
                >
                  <div className="w-full rounded-lg border border-[var(--border-subtle)] p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-secondary)]">
                      Costo estimado ruta
                    </p>
                    <p className="mt-1 font-data text-xl font-bold text-[var(--text-primary)]">
                      {money(breakdown.costoDistancia)}
                    </p>
                  </div>
                </Tooltip>
                <Tooltip
                  content={`Peajes aprox.: ${breakdown.cantidadPeajes} × ${money(breakdown.costoPromedioPeaje)}`}
                  side="top"
                >
                  <div className="w-full rounded-lg border border-[var(--border-subtle)] p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-secondary)]">
                      Peajes aproximados
                    </p>
                    <p className="mt-1 font-data text-xl font-bold text-[var(--text-primary)]">
                      {money(breakdown.costoPeajes)}
                    </p>
                  </div>
                </Tooltip>
                <Tooltip content={MARGIN_TIP} side="top">
                  <div className="w-full rounded-lg border border-[var(--border-subtle)] border-l-[3px] border-l-[var(--accent-metric)] p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-secondary)]">
                      Utilidad bruta est.
                    </p>
                    <p className="mt-1 font-data text-xl font-bold text-[var(--accent-metric)]">
                      {money(breakdown.utilidadBruta)}
                    </p>
                  </div>
                </Tooltip>
                <Tooltip content={MARGIN_TIP} side="top">
                  <div className="w-full rounded-lg border border-[var(--border-subtle)] border-l-[3px] border-l-[var(--accent-primary)] p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-secondary)]">
                      Precio final sugerido
                    </p>
                    <p className="mt-1 font-data text-xl font-extrabold text-[var(--accent-primary)]">
                      {money(breakdown.precioSugerido)}
                    </p>
                  </div>
                </Tooltip>
              </div>
            ) : (
              <p className="text-sm text-[var(--text-secondary)]">
                Ajuste ruta y distancia para ver el desglose en tiempo real…
              </p>
            )}
          </section>

          <div className="fsg-panel data-shell overflow-hidden">
            <div className="border-b border-[var(--brand-line)] px-4 py-3 font-display text-sm font-semibold">
              Cotizaciones ({quotes.length})
            </div>
            {!quotes.length ? (
              <div className="p-6">
                <EmptyState
                  icon={<Calculator className="h-7 w-7" />}
                  title="Sin cotizaciones"
                  description="Calcule una tarifa y guarde la cotización en borrador."
                />
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th className="px-4 py-2">Código</th>
                    <th className="px-4 py-2">Cliente</th>
                    <th className="px-4 py-2">Monto</th>
                    <th className="px-4 py-2">Estado</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {quotes.map((q) => (
                    <tr
                      key={q.id}
                      className="cursor-pointer border-t border-[var(--brand-line)] hover:bg-[color-mix(in_srgb,var(--accent-primary)_6%,transparent)]"
                      onClick={() => openQuoteInspector(q)}
                      title="Abrir desglose en el inspector"
                    >
                      <td className="px-4 py-2.5 font-data text-xs">
                        {q.code}
                      </td>
                      <td className="px-4 py-2.5">{q.customer.name}</td>
                      <td className="px-4 py-2.5 font-data text-xs">
                        {money(Number(q.amount))}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge
                          tone={
                            q.status === "WON" || q.status === "APPROVED"
                              ? "emerald"
                              : q.status === "REJECTED"
                                ? "rose"
                                : "info"
                          }
                        >
                          {statusEs(q.status)}
                        </Badge>
                      </td>
                      <td
                        className="px-4 py-2.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex flex-wrap justify-end gap-1">
                          <Button
                            variant="ghost"
                            className="w-auto"
                            onClick={() => openQuoteInspector(q)}
                          >
                            Detalle
                          </Button>
                          {q.draftTrip ? (
                            <Link
                              href={`/logistica/servicios?code=${encodeURIComponent(q.draftTrip.code)}`}
                              className="inline-flex w-auto items-center rounded-md px-3 py-1.5 text-xs font-semibold text-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/10"
                            >
                              {q.draftTrip.code}
                            </Link>
                          ) : q.status === "DRAFT" ||
                            q.status === "SENT" ||
                            q.status === "WON" ||
                            q.status === "APPROVED" ? (
                            <Button
                              variant="primary"
                              className="w-auto"
                              onClick={() => void approveAndConvert(q)}
                            >
                              {q.status === "WON" || q.status === "APPROVED"
                                ? "Generar viaje"
                                : "Aprobar → Viaje"}
                            </Button>
                          ) : null}
                          {q.status === "DRAFT" ? (
                            <Button
                              variant="ghost"
                              className="w-auto"
                              onClick={async () => {
                                await api(`/comercial/quotes/${q.id}/status`, {
                                  method: "PATCH",
                                  body: JSON.stringify({ status: "SENT" }),
                                });
                                await load();
                              }}
                            >
                              Enviar
                            </Button>
                          ) : null}
                          {q.status === "DRAFT" || q.status === "SENT" ? (
                            <Button
                              variant="ghost"
                              className="w-auto"
                              onClick={async () => {
                                await api(`/comercial/quotes/${q.id}/status`, {
                                  method: "PATCH",
                                  body: JSON.stringify({ status: "REJECTED" }),
                                });
                                await load();
                              }}
                            >
                              Rechazar
                            </Button>
                          ) : null}
                          {q.status === "APPROVED" ||
                          q.status === "SENT" ||
                          q.status === "DRAFT" ||
                          q.status === "WON" ? (
                            <Button
                              variant="ghost"
                              className="w-auto"
                              onClick={async () => {
                                await api(
                                  `/comercial/quotes/${q.id}/to-contract`,
                                  { method: "POST" },
                                );
                                await load();
                              }}
                            >
                              → Contrato
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : null}

      {tab === "contratos" ? (
        <div className="space-y-4">
          <form
            onSubmit={onCreateContract}
            className="fsg-panel grid grid-cols-1 gap-3 p-4 md:grid-cols-3 lg:grid-cols-4"
          >
            <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--text-secondary)] md:col-span-2">
              Nombre del contrato
              <input
                className="field"
                data-field="legalName"
                placeholder="Ej. SKETCHERS"
                value={contractForm.name}
                onChange={(e) =>
                  setContractForm({ ...contractForm, name: e.target.value })
                }
                required
                title="Nombre comercial del contrato"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--text-secondary)]">
              Cliente
              <select
                className="field"
                value={contractForm.customerId}
                onChange={(e) =>
                  setContractForm({
                    ...contractForm,
                    customerId: e.target.value,
                  })
                }
                required
                title="Cliente del contrato"
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--text-secondary)]">
              Canal
              <select
                className="field"
                value={contractForm.channel}
                onChange={(e) =>
                  setContractForm({
                    ...contractForm,
                    channel: e.target.value as "PRIVATE" | "PUBLIC_TENDER",
                  })
                }
                title="Empresa privada o licitación pública"
              >
                <option value="PRIVATE">Empresa privada</option>
                <option value="PUBLIC_TENDER">Licitación pública</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--text-secondary)]">
              Ruta
              <input
                className="field"
                data-field="text"
                placeholder="Ej. RUTA 80"
                value={contractForm.route}
                onChange={(e) =>
                  setContractForm({ ...contractForm, route: e.target.value })
                }
                title="Corredor o ruta del contrato"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--text-secondary)]">
              Fecha inicio
              <input
                className="field"
                type="date"
                value={contractForm.startDate}
                onChange={(e) =>
                  setContractForm({
                    ...contractForm,
                    startDate: e.target.value,
                  })
                }
                required
                title="Inicio de vigencia"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--text-secondary)]">
              Fecha fin
              <input
                className="field"
                type="date"
                value={contractForm.endDate}
                onChange={(e) =>
                  setContractForm({ ...contractForm, endDate: e.target.value })
                }
                required
                title="Fin de vigencia"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--text-secondary)]">
              Valor mensual
              <input
                className="field font-data"
                data-field="skip"
                inputMode="decimal"
                placeholder="$11´000.000"
                value={
                  contractForm.monthlyValue
                    ? formatCop(Number(contractForm.monthlyValue))
                    : ""
                }
                onChange={(e) =>
                  setContractForm({
                    ...contractForm,
                    monthlyValue: e.target.value.replace(/\D/g, "").slice(0, 12),
                  })
                }
                title="Canon mensual en pesos colombianos"
              />
            </label>
            {contractError ? (
              <p
                role="alert"
                className="md:col-span-3 lg:col-span-4 rounded border border-[var(--brand-signal)]/40 bg-[var(--brand-signal)]/10 px-3 py-2 text-sm text-[var(--brand-signal)]"
              >
                {contractError}
              </p>
            ) : null}
            <div className="flex justify-end md:col-span-3 lg:col-span-4">
              <Button
                type="submit"
                variant="primary"
                className="w-auto"
                disabled={contractBusy}
              >
                Crear contrato operativo
              </Button>
            </div>
          </form>

          <div className="fsg-panel data-shell overflow-hidden">
            <div className="border-b border-[var(--brand-line)] px-4 py-3 font-display text-sm font-semibold">
              Contratos operativos ({contracts.length})
            </div>
            {!contracts.length ? (
              <div className="p-6">
                <EmptyState
                  icon={<FileText className="h-7 w-7" />}
                  title="Sin contratos"
                  description="Registra un contrato operativo de empresa o licitación."
                />
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th className="px-4 py-2">Código</th>
                    <th className="px-4 py-2">Cliente</th>
                    <th className="px-4 py-2">Canal</th>
                    <th className="px-4 py-2">Viajes</th>
                    <th className="px-4 py-2">Valor/mes</th>
                    <th className="px-4 py-2">Estado</th>
                    <th className="px-4 py-2">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {contracts.map((ctr) => (
                    <tr
                      key={ctr.id}
                      className="border-t border-[var(--brand-line)]"
                    >
                      <td className="px-4 py-2.5">
                        <span className="font-data text-xs text-[var(--brand-primary)]">
                          {ctr.code}
                        </span>
                        <div>{ctr.name}</div>
                      </td>
                      <td className="px-4 py-2.5">{ctr.customer.name}</td>
                      <td className="px-4 py-2.5">
                        <Badge
                          tone={
                            ctr.channel === "PUBLIC_TENDER" ? "info" : "emerald"
                          }
                        >
                          {CHANNEL_ES[ctr.channel] || ctr.channel}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 font-data">
                        {ctr._count.trips}
                      </td>
                      <td className="px-4 py-2.5 font-data text-xs">
                        {ctr.monthlyValue
                          ? formatCop(Number(ctr.monthlyValue))
                          : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusPulseBadge
                          tone={
                            ctr.status === "ACTIVE"
                              ? "active"
                              : ctr.status === "SUSPENDED"
                                ? "fatiga"
                                : "neutral"
                          }
                          pulse={false}
                        >
                          {statusEs(ctr.status)}
                        </StatusPulseBadge>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap justify-end gap-1">
                          <Button
                            variant="ghost"
                            className="w-auto"
                            onClick={async () => {
                              const n = window.prompt("Nombre", ctr.name);
                              if (n === null) return;
                              const route = window.prompt(
                                "Ruta",
                                ctr.route || "",
                              );
                              if (route === null) return;
                              const monthlyValue = window.prompt(
                                "Valor mensual COP",
                                ctr.monthlyValue
                                  ? String(ctr.monthlyValue)
                                  : "",
                              );
                              if (monthlyValue === null) return;
                              const endDate = window.prompt(
                                "Fecha fin (YYYY-MM-DD)",
                                ctr.endDate ? ctr.endDate.slice(0, 10) : "",
                              );
                              if (endDate === null) return;
                              await api(`/comercial/contracts/${ctr.id}`, {
                                method: "PATCH",
                                body: JSON.stringify({
                                  name: n.trim() || ctr.name,
                                  route: route.trim() || undefined,
                                  monthlyValue: monthlyValue.trim()
                                    ? Number(monthlyValue)
                                    : undefined,
                                  endDate: endDate.trim() || undefined,
                                }),
                              });
                              await load();
                            }}
                          >
                            Editar
                          </Button>
                          {ctr.status !== "ACTIVE" ? (
                            <Button
                              variant="ghost"
                              className="w-auto"
                              onClick={async () => {
                                await api(`/comercial/contracts/${ctr.id}`, {
                                  method: "PATCH",
                                  body: JSON.stringify({ status: "ACTIVE" }),
                                });
                                await load();
                              }}
                            >
                              Activar
                            </Button>
                          ) : null}
                          {ctr.status === "ACTIVE" ? (
                            <Button
                              variant="ghost"
                              className="w-auto"
                              onClick={async () => {
                                await api(`/comercial/contracts/${ctr.id}`, {
                                  method: "PATCH",
                                  body: JSON.stringify({
                                    status: "SUSPENDED",
                                  }),
                                });
                                await load();
                              }}
                            >
                              Suspender
                            </Button>
                          ) : null}
                          {ctr.status !== "ENDED" ? (
                            <Button
                              variant="ghost"
                              className="w-auto"
                              onClick={async () => {
                                await api(`/comercial/contracts/${ctr.id}`, {
                                  method: "PATCH",
                                  body: JSON.stringify({ status: "ENDED" }),
                                });
                                await load();
                              }}
                            >
                              Cerrar
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : null}

      {tab === "clientes" ? (
        <div className="fsg-panel data-shell overflow-hidden" id="clientes">
          <div className="flex items-center justify-between border-b border-[var(--brand-line)] px-4 py-3">
            <span className="font-display text-sm font-semibold">
              Clientes ({customers.length})
            </span>
            <Button
              type="button"
              variant="primary"
              className="w-auto"
              onClick={openNewCustomer}
            >
              <Plus className="mr-1 h-4 w-4" />
              Nuevo Cliente
            </Button>
          </div>
          {!customers.length ? (
            <div className="p-6">
              <EmptyState
                icon={<Users className="h-7 w-7" />}
                title="Sin clientes en directorio"
                description="Registra el primer cliente empresa, escolar o turismo."
                actionLabel="+ Nuevo Cliente"
                onAction={openNewCustomer}
              />
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                    <th className="px-4 py-2">Nombre</th>
                    <th className="px-4 py-2">Vínculo</th>
                    <th className="px-4 py-2">Segmento</th>
                    <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => {
                  const origin = customerOrigin(c);
                  return (
                  <tr
                    key={c.id}
                    className="border-t border-[var(--brand-line)]"
                  >
                    <td className="px-4 py-2.5">
                      {c.name}
                      <div className="font-data text-[10px] text-[var(--brand-muted)]">
                        {c.nit}
                      </div>
                      {c.email || c.phone ? (
                        <div className="text-[10px] text-[var(--brand-muted)]">
                          {[c.email, c.phone].filter(Boolean).join(" · ")}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={origin.tone} title={origin.detail}>
                        {origin.label}
                      </Badge>
                      <div className="mt-1 font-data text-[10px] text-[var(--brand-muted)]">
                        {origin.detail}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge>{c.segment}</Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end">
                        <Button
                          variant="ghost"
                          className="w-auto"
                          onClick={() => openEditCustomer(c)}
                        >
                          Editar
                        </Button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      ) : null}

      <Modal
        open={customerModalOpen}
        onClose={closeCustomerModal}
        title={editingCustomerId ? "Editar cliente" : "Nuevo cliente"}
        description={
          editingCustomerId
            ? "Actualiza razón social, contacto y segmento."
            : "Registro sujeto a chequeo SARLAFT por NIT."
        }
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              className="w-auto"
              onClick={closeCustomerModal}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="comercial-customer-form"
              variant="primary"
              className="w-auto"
              disabled={customerBusy}
            >
              {editingCustomerId ? "Guardar cambios" : "Crear cliente"}
            </Button>
          </>
        }
      >
        <form
          id="comercial-customer-form"
          onSubmit={(e) => void onSaveCustomer(e)}
          className="grid gap-3"
        >
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--text-secondary)]">
            Razón social
            <input
              className="field"
              data-field="legalName"
              placeholder="Ej. INREDESOFT SAS"
              value={customerForm.name}
              onChange={(e) =>
                setCustomerForm({ ...customerForm, name: e.target.value })
              }
              required
              title="Razón social del cliente"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--text-secondary)]">
            NIT
            <input
              className="field font-data"
              data-field="nit"
              placeholder="900123456-1"
              value={customerForm.nit}
              onChange={(e) =>
                setCustomerForm({ ...customerForm, nit: e.target.value })
              }
              required
              disabled={Boolean(editingCustomerId)}
              title="NIT sujeto a chequeo SARLAFT"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--text-secondary)]">
            Correo
            <input
              className="field"
              data-field="email"
              type="email"
              placeholder="contacto@empresa.com"
              value={customerForm.email}
              onChange={(e) =>
                setCustomerForm({ ...customerForm, email: e.target.value })
              }
              title="Correo de contacto"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--text-secondary)]">
            Teléfono
            <input
              className="field font-data"
              data-field="phone"
              inputMode="tel"
              placeholder="3001234567"
              value={customerForm.phone}
              onChange={(e) =>
                setCustomerForm({ ...customerForm, phone: e.target.value })
              }
              title="Teléfono de contacto"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--text-secondary)]">
            Segmento
            <select
              className="field"
              value={customerForm.segment}
              onChange={(e) =>
                setCustomerForm({
                  ...customerForm,
                  segment: e.target.value as typeof customerForm.segment,
                })
              }
              title="Segmento comercial"
            >
              <option value="B2B">Empresa</option>
              <option value="ESCOLAR">Colegio</option>
              <option value="TURISMO">Turismo</option>
            </select>
          </label>
          {customerError ? (
            <p
              role="alert"
              className="rounded border border-[var(--brand-signal)]/40 bg-[var(--brand-signal)]/10 px-3 py-2 text-sm text-[var(--brand-signal)]"
            >
              {customerError}
            </p>
          ) : null}
        </form>
      </Modal>
    </div>
  );
}
