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
  Pencil,
  Plus,
  Users,
  ShieldCheck,
  AlertTriangle,
  TrendingUp,
  Target,
} from "lucide-react";
import { api } from "@/lib/api";
import { EmptyState, KpiCard, SlideOver, StatusPulseBadge } from "@/components/audit";
import { BentoPanel } from "@/components/nexa/bento-panel";
import { NexaTable, NexaRow, NexaCell } from "@/components/nexa/nexa-table";
import { PlaceSuggestInput } from "@/components/comercial/place-suggest-input";
import {
  WorkbenchSearch,
  WorkbenchTabs,
  WorkbenchToolbar,
} from "@/components/workbench-toolbar";
import { useShell } from "@/lib/shell-context";

type Customer = {
  id: string;
  name: string;
  nit: string;
  segment: string;
  email?: string | null;
  phone?: string | null;
  sarlaftBlocked?: boolean;
  sarlaftRiskScore?: number;
  _count?: { quotes: number; trips: number; contracts: number };
};

const PIPELINE_COLUMNS = [
  { key: "DRAFT", label: "Borrador" },
  { key: "SENT", label: "Enviada" },
  { key: "APPROVED", label: "Negociación" },
] as const;

function sarlaftTrust(c: Customer): {
  label: string;
  tone: "active" | "fatiga" | "danger";
} {
  if (c.sarlaftBlocked) {
    return { label: "SARLAFT bloqueado", tone: "danger" };
  }
  const score = c.sarlaftRiskScore ?? 0;
  if (score <= 25) return { label: "Confianza alta", tone: "active" };
  if (score <= 60) return { label: "Riesgo medio", tone: "fatiga" };
  return { label: "Riesgo elevado", tone: "danger" };
}

function marginTone(pct: number): string {
  if (pct >= 25) return "text-brand-primary";
  if (pct >= 15) return "text-brand-warning";
  return "text-brand-danger";
}

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
  routeLabel?: string | null;
  monthlyValue?: string | number | null;
  endDate?: string | null;
  endsAt?: string | null;
  customer: { name: string };
  _count: { trips: number };
};

type ContractsListResponse = {
  items: Contract[];
  meta: { total: number; page: number; take: number; pages: number };
  summary: { activeCount: number; mrr: number };
};

type TabId = "cotizador" | "contratos" | "clientes";

const CONTRACTS_PAGE_SIZE = 10;

const CHANNEL_ES: Record<string, string> = {
  PRIVATE: "Empresa privada",
  PUBLIC_TENDER: "Licitación pública",
};

function customerOrigin(c: Customer): {
  label: string;
  tone: "success" | "warning" | "info";
  detail: string;
} {
  const contracts = c._count?.contracts ?? 0;
  const quotes = c._count?.quotes ?? 0;
  if (contracts > 0) {
    return {
      label: "Contrato",
      tone: "success",
      detail:
        quotes > 0
          ? `${contracts} contrato${contracts === 1 ? "" : "s"} · ${quotes} cotización${quotes === 1 ? "" : "es"}`
          : `${contracts} contrato${contracts === 1 ? "" : "s"} operativo${contracts === 1 ? "" : "s"}`,
    };
  }
  if (quotes > 0) {
    return {
      label: "Solo cotización",
      tone: "warning",
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

/** COP colombiano vía locale es-CO (ej. 11000000 → $11.000.000) */
function formatCop(n: number) {
  if (!Number.isFinite(n)) return "";
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.round(Math.abs(n)).toLocaleString("es-CO")}`;
}

const MARGIN_TIP =
  "Calculado automáticamente con un margen objetivo del 30% sobre costos de ruta y peajes (ajustable en el cotizador).";

export default function ComercialPage() {
  const { openInspector } = useShell();
  const [tab, setTab] = useState<TabId>("cotizador");
  const [customerSlideOpen, setCustomerSlideOpen] = useState(false);
  const [contractSlideOpen, setContractSlideOpen] = useState(false);
  const [clientQuery, setClientQuery] = useState("");
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
  const [editingContractId, setEditingContractId] = useState<string | null>(
    null,
  );
  const [contractsPage, setContractsPage] = useState(1);
  const [contractsTotal, setContractsTotal] = useState(0);
  const [contractsSummary, setContractsSummary] = useState({
    activeCount: 0,
    mrr: 0,
  });
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
  const [quoteView, setQuoteView] = useState<"pipeline" | "historial">("pipeline");
  const [conversionOpen, setConversionOpen] = useState(false);
  const [conversionQuote, setConversionQuote] = useState<Quote | null>(null);
  const [conversionTripCode, setConversionTripCode] = useState<string | null>(null);

  async function load(page = contractsPage) {
    const [c, q, ctr] = await Promise.all([
      api<Customer[]>("/comercial/customers"),
      api<Quote[]>("/comercial/quotes"),
      api<ContractsListResponse>(
        `/comercial/contracts?page=${page}&limit=${CONTRACTS_PAGE_SIZE}`,
      ),
    ]);
    setCustomers(c);
    setQuotes(q);
    setContracts(ctr.items);
    setContractsTotal(ctr.meta.total);
    setContractsPage(ctr.meta.page);
    setContractsSummary(ctr.summary);
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

  const marginPct = useMemo(
    () => Number(calcForm.margenDeseado) || QUOTE_DEFAULT_MARGIN_PCT,
    [calcForm.margenDeseado],
  );

  const pipelineQuotes = useMemo(
    () =>
      quotes.filter((q) =>
        PIPELINE_COLUMNS.some((col) => col.key === q.status),
      ),
    [quotes],
  );

  const historyQuotes = useMemo(
    () =>
      quotes.filter(
        (q) => !PIPELINE_COLUMNS.some((col) => col.key === q.status),
      ),
    [quotes],
  );

  const pipelineStats = useMemo(() => {
    const negociacion = quotes.filter((q) => q.status === "APPROVED").length;
    const ganado = quotes.filter((q) => q.status === "WON").length;
    const pipelineValue = pipelineQuotes.reduce(
      (sum, q) => sum + Number(q.amount),
      0,
    );
    const mrr = contractsSummary.mrr;
    return {
      negociacion,
      ganado,
      pipelineValue,
      mrr,
      activas: pipelineQuotes.length,
      contratosActivos: contractsSummary.activeCount,
    };
  }, [quotes, pipelineQuotes, contractsSummary]);

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

  function closeCustomerSlide() {
    setCustomerSlideOpen(false);
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
    setCustomerSlideOpen(true);
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
    setCustomerSlideOpen(true);
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
      closeCustomerSlide();
      await load();
    } catch (err) {
      setCustomerError(
        err instanceof Error ? err.message : "No se pudo guardar el cliente",
      );
    } finally {
      setCustomerBusy(false);
    }
  }

  function closeContractSlide() {
    setContractSlideOpen(false);
    setEditingContractId(null);
    setContractError("");
    setContractForm((f) => ({
      ...f,
      name: "",
      route: "",
      startDate: "",
      endDate: "",
      monthlyValue: "",
      channel: "PRIVATE",
    }));
  }

  function openNewContract() {
    setEditingContractId(null);
    setContractError("");
    setContractForm((f) => ({
      ...f,
      name: "",
      route: "",
      startDate: "",
      endDate: "",
      monthlyValue: "",
      channel: "PRIVATE",
      customerId: f.customerId || customers[0]?.id || "",
    }));
    setContractSlideOpen(true);
  }

  function openEditContract(ctr: Contract) {
    const endRaw = ctr.endDate || ctr.endsAt || "";
    setEditingContractId(ctr.id);
    setContractError("");
    setContractForm({
      name: ctr.name,
      customerId: customers.find((c) => c.name === ctr.customer.name)?.id || "",
      channel:
        ctr.channel === "PUBLIC_TENDER" ? "PUBLIC_TENDER" : "PRIVATE",
      route: ctr.route || ctr.routeLabel || "",
      startDate: "",
      endDate: endRaw ? String(endRaw).slice(0, 10) : "",
      monthlyValue: ctr.monthlyValue
        ? String(Math.round(Number(ctr.monthlyValue)))
        : "",
    });
    setContractSlideOpen(true);
  }

  async function onSaveContract(e: FormEvent) {
    e.preventDefault();
    setContractError("");
    const monthlyRaw = contractForm.monthlyValue.replace(/\D/g, "");
    if (!monthlyRaw) {
      setContractError("Indique el valor mensual del contrato");
      return;
    }
    if (monthlyRaw.length > 12) {
      setContractError("Valor mensual máximo: $999.999.999.999");
      return;
    }
    setContractBusy(true);
    try {
      if (editingContractId) {
        await api(`/comercial/contracts/${editingContractId}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: contractForm.name.trim() || undefined,
            route: contractForm.route.trim() || undefined,
            monthlyValue: Number(monthlyRaw),
            endDate: contractForm.endDate.trim() || undefined,
          }),
        });
      } else {
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
      }
      const pageToLoad = editingContractId ? contractsPage : 1;
      closeContractSlide();
      await load(pageToLoad);
    } catch (err) {
      setContractError(
        err instanceof Error
          ? err.message
          : editingContractId
            ? "No se pudo actualizar el contrato"
            : "No se pudo crear el contrato",
      );
    } finally {
      setContractBusy(false);
    }
  }

  async function patchContractStatus(id: string, status: string) {
    await api(`/comercial/contracts/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    await load(contractsPage);
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
    setConversionQuote({ ...q, ...res });
    setConversionTripCode(res.draftTrip?.code ?? null);
    setConversionOpen(true);
    if (res.tripError) setCalcError(res.tripError);
  }

  function renderQuoteActions(q: Quote, compact?: boolean) {
    return (
      <div
        className={`flex flex-wrap gap-1 ${compact ? "" : "justify-end"}`}
        onClick={(e) => e.stopPropagation()}
      >
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
          q.status === "APPROVED" ? (
          <Button
            variant="primary"
            className="w-auto"
            onClick={() => void approveAndConvert(q)}
          >
            {q.status === "APPROVED" ? "Ganar → Viaje" : "Aprobar → Viaje"}
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
        {q.status === "SENT" ? (
          <Button
            variant="ghost"
            className="w-auto"
            onClick={async () => {
              await api(`/comercial/quotes/${q.id}/status`, {
                method: "PATCH",
                body: JSON.stringify({ status: "APPROVED" }),
              });
              await load();
            }}
          >
            Negociar
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
              await api(`/comercial/quotes/${q.id}/to-contract`, {
                method: "POST",
              });
              await load();
            }}
          >
            → Contrato
          </Button>
        ) : null}
      </div>
    );
  }

  function openQuoteInspector(q: Quote) {
    const calc = q.calcJson;
    openInspector(
      `${q.code} · cotización`,
      <div className="space-y-4 text-sm">
        <div>
          <p className="font-data text-[10px] uppercase tracking-[0.14em] text-[var(--brand-primary)]">
            {q.customer.name}
          </p>
          <p className="mt-1 font-data text-lg font-bold text-[var(--brand-text-primary)]">
            {money(Number(q.amount))}
          </p>
          <p className="text-xs text-[var(--brand-text-secondary)]">{statusEs(q.status)}</p>
        </div>
        {calc ? (
          <dl className="space-y-2 font-data text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--brand-text-secondary)]">Ruta</dt>
              <dd>
                {calc.origen} → {calc.destino}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--brand-text-secondary)]">Costo ruta</dt>
              <dd>{money(calc.costoDistancia)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--brand-text-secondary)]">Peajes</dt>
              <dd>{money(calc.costoPeajes)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--brand-text-secondary)]">Conductor</dt>
              <dd>{money(calc.pagoConductor)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--brand-text-secondary)]">Costo operativo</dt>
              <dd>{money(calc.costoOperativo)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--brand-text-secondary)]">Utilidad bruta</dt>
              <dd className="text-[var(--brand-warning)]">
                {money(calc.utilidadBruta)}
              </dd>
            </div>
            <div className="flex justify-between gap-2 border-t border-[var(--brand-border)] pt-2">
              <dt className="text-[var(--brand-text-secondary)]">Precio cliente</dt>
              <dd className="font-bold text-[var(--brand-primary)]">
                {money(calc.precioSugerido)}
              </dd>
            </div>
            <p className="text-[10px] text-[var(--brand-text-secondary)]">
              Margen {calc.margenDeseado}%
            </p>
          </dl>
        ) : (
          <p className="text-[var(--brand-text-secondary)]">
            {q.notes || "Sin desglose de cotizador"}
          </p>
        )}
        {q.draftTrip ? (
          <div className="space-y-2 border-t border-[var(--brand-border)] pt-3">
            <p className="font-data text-xs text-[var(--brand-text-primary)]">
              Viaje {q.draftTrip.code} · {q.draftTrip.status}
            </p>
            <p className="text-xs text-brand-text-secondary">
              Logística → Programación de servicios y seguimiento GPS. Sin
              conductor ni placa hasta que despacho lo asigne.
            </p>
            <Link
              href={`/logistica/servicios?code=${encodeURIComponent(q.draftTrip.code)}`}
              className="inline-flex w-auto items-center rounded-md bg-[var(--brand-primary)] px-3 py-2 text-xs font-semibold text-brand-on-primary"
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

  const filteredCustomers = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.nit.includes(q) ||
        (c.email ?? "").toLowerCase().includes(q),
    );
  }, [customers, clientQuery]);

  const workbenchTabs = useMemo(
    () => [
      {
        id: "cotizador" as const,
        label: "Cotizador",
        count: quotes.length,
        tip: "Pipeline, cotizador inteligente e historial",
      },
      {
        id: "contratos" as const,
        label: "Contratos",
        count: contracts.length,
        tip: "Contratos operativos B2B y licitación",
      },
      {
        id: "clientes" as const,
        label: "Clientes",
        count: customers.length,
        tip: "Directorio comercial y SARLAFT",
      },
    ],
    [quotes.length, contracts.length, customers.length],
  );

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-border pb-4">
        <div>
          <p className="font-data text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-primary">
            Comercial · Revenue
          </p>
          <h1 className="font-sans text-2xl font-semibold tracking-tight text-brand-text-primary md:text-3xl">
            Comercial y contratos
          </h1>
          <p className="mt-1 font-sans text-sm text-brand-text-secondary">
            Pipeline · cotizador · MRR · SARLAFT
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {tab === "contratos" ? (
            <Button
              type="button"
              variant="primary"
              className="w-auto px-4 py-2"
              onClick={openNewContract}
            >
              <Plus className="mr-1.5 h-4 w-4" aria-hidden />
              Nuevo contrato
            </Button>
          ) : (
            <Button
              type="button"
              variant="primary"
              className="w-auto px-4 py-2"
              onClick={openNewCustomer}
            >
              <Plus className="mr-1.5 h-4 w-4" aria-hidden />
              Nuevo cliente
            </Button>
          )}
        </div>
      </header>

      <WorkbenchToolbar>
        <WorkbenchTabs
          tabs={workbenchTabs}
          value={tab}
          onChange={(id) => setTab(id as TabId)}
        />
        {tab === "clientes" ? (
          <WorkbenchSearch
            value={clientQuery}
            onChange={setClientQuery}
            placeholder="Buscar por nombre, NIT o correo…"
          />
        ) : null}
      </WorkbenchToolbar>

      {tab === "cotizador" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              label="Pipeline activo"
              value={pipelineStats.activas}
              delta={`${money(pipelineStats.pipelineValue)} en juego`}
              icon={<Target className="h-10 w-10" />}
            />
            <KpiCard
              label="En negociación"
              value={pipelineStats.negociacion}
              tone="warn"
              icon={<TrendingUp className="h-10 w-10" />}
            />
            <KpiCard
              label="Ganadas"
              value={pipelineStats.ganado}
              tone="ok"
              icon={<ShieldCheck className="h-10 w-10" />}
            />
            <KpiCard
              label="MRR contratos"
              value={money(pipelineStats.mrr)}
              delta={`${pipelineStats.contratosActivos} activo${pipelineStats.contratosActivos === 1 ? "" : "s"}`}
              tone="ok"
              icon={<FileText className="h-10 w-10" />}
            />
          </div>

          <BentoPanel
            title="Cotizador inteligente"
            subtitle="(km × costo/km + peajes + conductor) / (1 − margen)"
            icon={<Calculator aria-hidden />}
            action={
              <Button
                type="button"
                variant="secondary"
                className="w-auto px-3 py-1.5"
                loading={calcBusy}
                title="Recalcular tarifa sugerida"
                onClick={() => void runCalculate()}
              >
                Recalcular
              </Button>
            }
          >
            <div className="space-y-4">
            <form
              onSubmit={(e) => void saveQuoteFromCalc(e)}
              className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-4"
            >
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--brand-text-secondary)]">
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
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-brand-text-secondary">
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
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--brand-text-secondary)]">
                Destino
                <PlaceSuggestInput
                  placeholder="Ciudad o punto de destino"
                  value={calcForm.destino}
                  onChange={(destino) => setCalcForm({ ...calcForm, destino })}
                  required
                  title="Destino de la ruta — sugerencias Nominatim CO"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--brand-text-secondary)]">
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
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--brand-text-secondary)]">
                Kilómetros recorridos
                <input
                  className="field font-data tabular-nums"
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
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--brand-text-secondary)]">
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
              <label className="flex flex-col gap-2 text-[11px] uppercase tracking-wide text-[var(--brand-text-secondary)] md:col-span-2">
                Margen objetivo
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={5}
                    max={50}
                    step={1}
                    value={marginPct}
                    onChange={(e) =>
                      setCalcForm({
                        ...calcForm,
                        margenDeseado: e.target.value,
                      })
                    }
                    title={MARGIN_TIP}
                    className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[var(--brand-border)] accent-[var(--brand-primary)] [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--brand-primary)]"
                    style={{
                      background: `linear-gradient(to right, ${
                        marginPct >= 25
                          ? "var(--brand-primary)"
                          : marginPct >= 15
                            ? "var(--brand-warning)"
                            : "var(--brand-danger)"
                      } 0%, ${
                        marginPct >= 25
                          ? "var(--brand-primary)"
                          : marginPct >= 15
                            ? "var(--brand-warning)"
                            : "var(--brand-danger)"
                      } ${((marginPct - 5) / 45) * 100}%, var(--brand-border) ${((marginPct - 5) / 45) * 100}%)`,
                    }}
                  />
                  <span
                    className={`min-w-[3.5rem] font-data text-lg font-bold tabular-nums ${marginTone(marginPct)}`}
                  >
                    {marginPct}%
                  </span>
                </div>
                <span className="normal-case text-[10px] text-[var(--brand-text-secondary)]">
                  {marginPct >= 25
                    ? "Zona verde — margen saludable"
                    : marginPct >= 15
                      ? "Zona ámbar — revisar costos"
                      : "Zona roja — rentabilidad crítica"}
                </span>
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
              <p className="text-sm text-[var(--brand-danger)]">{calcError}</p>
            ) : null}

            {breakdown ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Tooltip
                  content="Costo de distancia: km × costo/km del tipo de unidad"
                  side="top"
                >
                  <div className="w-full rounded-lg border border-[var(--brand-border)] p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--brand-text-secondary)]">
                      Costo estimado ruta
                    </p>
                    <p className="mt-1 font-data text-xl font-bold text-[var(--brand-text-primary)]">
                      {money(breakdown.costoDistancia)}
                    </p>
                  </div>
                </Tooltip>
                <Tooltip
                  content={`Peajes aprox.: ${breakdown.cantidadPeajes} × ${money(breakdown.costoPromedioPeaje)}`}
                  side="top"
                >
                  <div className="w-full rounded-lg border border-[var(--brand-border)] p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--brand-text-secondary)]">
                      Peajes aproximados
                    </p>
                    <p className="mt-1 font-data text-xl font-bold text-[var(--brand-text-primary)]">
                      {money(breakdown.costoPeajes)}
                    </p>
                  </div>
                </Tooltip>
                <Tooltip content={MARGIN_TIP} side="top">
                  <div className="w-full rounded-lg border border-[var(--brand-border)] border-l-[3px] border-l-[var(--brand-warning)] p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--brand-text-secondary)]">
                      Utilidad bruta est.
                    </p>
                    <p className="mt-1 font-data text-xl font-bold text-[var(--brand-warning)]">
                      {money(breakdown.utilidadBruta)}
                    </p>
                  </div>
                </Tooltip>
                <Tooltip content={MARGIN_TIP} side="top">
                  <div className="w-full rounded-lg border border-[var(--brand-border)] border-l-[3px] border-l-[var(--brand-primary)] p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--brand-text-secondary)]">
                      Precio final sugerido
                    </p>
                    <p className="mt-1 font-data text-xl font-extrabold text-[var(--brand-primary)]">
                      {money(breakdown.precioSugerido)}
                    </p>
                  </div>
                </Tooltip>
              </div>
            ) : (
              <p className="text-sm text-brand-text-secondary">
                Ajuste ruta y distancia para ver el desglose en tiempo real…
              </p>
            )}
            </div>
          </BentoPanel>

          <BentoPanel
            title="Deal Desk · Cotizaciones"
            subtitle={`${quotes.length} registro(s) · pipeline ${money(pipelineStats.pipelineValue)}`}
            icon={<FileText aria-hidden />}
            action={
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant={quoteView === "pipeline" ? "primary" : "ghost"}
                  className="w-auto px-3 py-1.5"
                  onClick={() => setQuoteView("pipeline")}
                >
                  Pipeline
                </Button>
                <Button
                  type="button"
                  variant={quoteView === "historial" ? "primary" : "ghost"}
                  className="w-auto px-3 py-1.5"
                  onClick={() => setQuoteView("historial")}
                >
                  Historial
                </Button>
              </div>
            }
          >
            {quoteView === "pipeline" ? (
              !pipelineQuotes.length ? (
                <EmptyState
                  icon={<Calculator className="h-7 w-7" />}
                  title="Pipeline vacío"
                  description="Calcule una tarifa y guarde la cotización en borrador."
                />
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  {PIPELINE_COLUMNS.map((col) => {
                    const colQuotes = pipelineQuotes.filter(
                      (q) => q.status === col.key,
                    );
                    const colValue = colQuotes.reduce(
                      (sum, q) => sum + Number(q.amount),
                      0,
                    );
                    return (
                      <BentoPanel
                        key={col.key}
                        title={col.label}
                        subtitle={`${colQuotes.length} · ${money(colValue)}`}
                        className="!p-3"
                      >
                        <div className="flex flex-1 flex-col gap-2">
                          {!colQuotes.length ? (
                            <p className="px-2 py-4 text-center text-xs text-[var(--brand-text-secondary)]">
                              Sin cotizaciones
                            </p>
                          ) : (
                            colQuotes.map((q) => (
                              <article
                                key={q.id}
                                className="cursor-pointer rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface)] p-3 transition-colors duration-150 hover:border-[color-mix(in_srgb,var(--brand-primary)_35%,transparent)]"
                                onClick={() => openQuoteInspector(q)}
                                title="Abrir desglose en el inspector"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <p className="font-data text-[10px] text-[var(--brand-primary)]">
                                    {q.code}
                                  </p>
                                  <Badge
                                    tone={
                                      q.status === "APPROVED"
                                        ? "success"
                                        : q.status === "SENT"
                                          ? "info"
                                          : "neutral"
                                    }
                                  >
                                    {statusEs(q.status)}
                                  </Badge>
                                </div>
                                <p className="mt-1 text-sm font-medium text-[var(--brand-text-primary)]">
                                  {q.customer.name}
                                </p>
                                <p className="mt-1 font-data text-base font-bold tabular-nums text-[var(--brand-text-primary)]">
                                  {money(Number(q.amount))}
                                </p>
                                {q.calcJson ? (
                                  <>
                                    <p className="mt-1 text-[10px] text-brand-text-secondary">
                                      {q.calcJson.origen} → {q.calcJson.destino}
                                    </p>
                                    <p
                                      className={`mt-0.5 font-data text-[10px] tabular-nums ${marginTone(q.calcJson.margenDeseado)}`}
                                    >
                                      Margen {q.calcJson.margenDeseado}%
                                    </p>
                                  </>
                                ) : null}
                                <div className="mt-2 border-t border-[var(--brand-border)] pt-2">
                                  {renderQuoteActions(q, true)}
                                </div>
                              </article>
                            ))
                          )}
                        </div>
                      </BentoPanel>
                    );
                  })}
                </div>
              )
            ) : !historyQuotes.length ? (
              <EmptyState
                icon={<FileText className="h-7 w-7" />}
                title="Sin historial"
                description="Las cotizaciones ganadas, rechazadas o vencidas aparecerán aquí."
              />
            ) : (
              <NexaTable
                columns={["Código", "Cliente", "Monto", "Margen", "Estado", ""]}
              >
                {historyQuotes.map((q) => (
                  <NexaRow
                    key={q.id}
                    onClick={() => openQuoteInspector(q)}
                  >
                    <NexaCell mono>{q.code}</NexaCell>
                    <NexaCell>{q.customer.name}</NexaCell>
                    <NexaCell mono>{money(Number(q.amount))}</NexaCell>
                    <NexaCell mono>
                      {q.calcJson ? `${q.calcJson.margenDeseado}%` : "—"}
                    </NexaCell>
                    <NexaCell>
                      <Badge
                        tone={
                          q.status === "WON"
                            ? "success"
                            : q.status === "REJECTED"
                              ? "danger"
                              : "info"
                        }
                      >
                        {statusEs(q.status)}
                      </Badge>
                    </NexaCell>
                    <NexaCell>
                      <div onClick={(e) => e.stopPropagation()}>
                        {renderQuoteActions(q)}
                      </div>
                    </NexaCell>
                  </NexaRow>
                ))}
              </NexaTable>
            )}
          </BentoPanel>
        </div>
      ) : null}

      {tab === "contratos" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              label="Contratos activos"
              value={pipelineStats.contratosActivos}
              tone="ok"
              icon={<FileText className="h-10 w-10" />}
            />
            <KpiCard
              label="MRR total"
              value={money(pipelineStats.mrr)}
              delta="Ingreso recurrente mensual"
              tone="ok"
              icon={<TrendingUp className="h-10 w-10" />}
            />
            <KpiCard
              label="Contratos totales"
              value={contracts.length}
              icon={<Target className="h-10 w-10" />}
            />
            <KpiCard
              label="Cotizaciones ganadas"
              value={pipelineStats.ganado}
              tone="warn"
              icon={<ShieldCheck className="h-10 w-10" />}
            />
          </div>

          <BentoPanel
            title="Contratos operativos"
            subtitle={`${contractsTotal} registro(s)`}
            icon={<FileText aria-hidden />}
          >
            {!contracts.length ? (
              <EmptyState
                icon={<FileText className="h-7 w-7" />}
                title="Sin contratos"
                description="Registra un contrato operativo de empresa o licitación."
                actionLabel="+ Nuevo contrato"
                onAction={openNewContract}
              />
            ) : (
              <>
                <NexaTable
                  columns={[
                    "Código",
                    "Cliente",
                    "Canal",
                    "Viajes",
                    "Valor/mes",
                    "Estado",
                    "Acciones",
                  ]}
                >
                  {contracts.map((ctr) => (
                    <NexaRow key={ctr.id}>
                      <NexaCell>
                        <span className="font-data text-xs text-brand-primary">
                          {ctr.code}
                        </span>
                        <div>{ctr.name}</div>
                      </NexaCell>
                      <NexaCell>{ctr.customer.name}</NexaCell>
                      <NexaCell>
                        <Badge
                          tone={
                            ctr.channel === "PUBLIC_TENDER"
                              ? "info"
                              : "success"
                          }
                        >
                          {CHANNEL_ES[ctr.channel] || ctr.channel}
                        </Badge>
                      </NexaCell>
                      <NexaCell mono>{ctr._count.trips}</NexaCell>
                      <NexaCell mono>
                        {ctr.monthlyValue
                          ? formatCop(Number(ctr.monthlyValue))
                          : "—"}
                      </NexaCell>
                      <NexaCell>
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
                      </NexaCell>
                      <NexaCell>
                        <div className="flex flex-wrap justify-end gap-1">
                          <Button
                            variant="secondary"
                            className="w-auto"
                            title="Editar contrato"
                            onClick={() => openEditContract(ctr)}
                          >
                            <Pencil
                              className="mr-1 inline h-3.5 w-3.5"
                              aria-hidden
                            />
                            Editar
                          </Button>
                          {ctr.status !== "ACTIVE" ? (
                            <Button
                              variant="ghost"
                              className="w-auto"
                              onClick={() =>
                                void patchContractStatus(ctr.id, "ACTIVE")
                              }
                            >
                              Activar
                            </Button>
                          ) : null}
                          {ctr.status === "ACTIVE" ? (
                            <Button
                              variant="ghost"
                              className="w-auto"
                              onClick={() =>
                                void patchContractStatus(ctr.id, "SUSPENDED")
                              }
                            >
                              Suspender
                            </Button>
                          ) : null}
                          {ctr.status !== "ENDED" ? (
                            <Button
                              variant="ghost"
                              className="w-auto"
                              onClick={() =>
                                void patchContractStatus(ctr.id, "ENDED")
                              }
                            >
                              Cerrar
                            </Button>
                          ) : null}
                        </div>
                      </NexaCell>
                    </NexaRow>
                  ))}
                </NexaTable>
                {contractsTotal > CONTRACTS_PAGE_SIZE ? (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-brand-border pt-3">
                    <p className="font-data text-xs text-brand-text-secondary">
                      Página {contractsPage} de{" "}
                      {Math.max(
                        1,
                        Math.ceil(contractsTotal / CONTRACTS_PAGE_SIZE),
                      )}{" "}
                      · {contractsTotal} total
                    </p>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        className="w-auto px-3 py-1.5"
                        disabled={contractsPage <= 1}
                        onClick={() => void load(contractsPage - 1)}
                      >
                        Anterior
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="w-auto px-3 py-1.5"
                        disabled={
                          contractsPage >=
                          Math.ceil(contractsTotal / CONTRACTS_PAGE_SIZE)
                        }
                        onClick={() => void load(contractsPage + 1)}
                      >
                        Siguiente
                      </Button>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </BentoPanel>
        </div>
      ) : null}

      {tab === "clientes" ? (
        <BentoPanel
          id="clientes"
          title="Directorio de clientes"
          subtitle={`${filteredCustomers.length} registro(s)`}
          icon={<Users aria-hidden />}
        >
          {!filteredCustomers.length ? (
            <EmptyState
              icon={<Users className="h-7 w-7" />}
              title="Sin clientes en directorio"
              description="Registra el primer cliente empresa, escolar o turismo."
              actionLabel="+ Nuevo cliente"
              onAction={openNewCustomer}
            />
          ) : (
            <NexaTable
              columns={[
                "Nombre",
                "Confianza SARLAFT",
                "Vínculo",
                "Segmento",
                "",
              ]}
            >
              {filteredCustomers.map((c) => {
                const origin = customerOrigin(c);
                const trust = sarlaftTrust(c);
                return (
                  <NexaRow key={c.id}>
                    <NexaCell>
                      {c.name}
                      <div className="font-data text-[10px] text-brand-text-secondary">
                        {c.nit}
                      </div>
                      {c.email || c.phone ? (
                        <div className="text-[10px] text-brand-text-secondary">
                          {[c.email, c.phone].filter(Boolean).join(" · ")}
                        </div>
                      ) : null}
                    </NexaCell>
                    <NexaCell>
                      <StatusPulseBadge
                        tone={trust.tone}
                        pulse={trust.tone === "danger"}
                      >
                        {trust.label}
                      </StatusPulseBadge>
                      {c.sarlaftRiskScore != null ? (
                        <div className="mt-1 font-data text-[10px] tabular-nums text-brand-text-secondary">
                          Score {c.sarlaftRiskScore}/100
                        </div>
                      ) : null}
                    </NexaCell>
                    <NexaCell>
                      <Badge tone={origin.tone} title={origin.detail}>
                        {origin.label}
                      </Badge>
                      <div className="mt-1 font-data text-[10px] text-brand-text-secondary">
                        {origin.detail}
                      </div>
                    </NexaCell>
                    <NexaCell>
                      <Badge>{c.segment}</Badge>
                    </NexaCell>
                    <NexaCell>
                      <div className="flex justify-end">
                        <Button
                          variant="ghost"
                          className="w-auto"
                          onClick={() => openEditCustomer(c)}
                        >
                          Editar
                        </Button>
                      </div>
                    </NexaCell>
                  </NexaRow>
                );
              })}
            </NexaTable>
          )}
        </BentoPanel>
      ) : null}

      <SlideOver
        open={customerSlideOpen}
        onClose={closeCustomerSlide}
        title={editingCustomerId ? "Editar cliente" : "Nuevo cliente"}
        description={
          editingCustomerId
            ? "Actualiza razón social, contacto y segmento."
            : "Registro sujeto a chequeo SARLAFT por NIT."
        }
        widthClass="max-w-lg"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              className="w-auto px-4 py-2"
              onClick={closeCustomerSlide}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="comercial-customer-form"
              variant="primary"
              className="w-auto px-4 py-2"
              disabled={customerBusy}
            >
              {editingCustomerId ? "Guardar cambios" : "Crear cliente"}
            </Button>
          </div>
        }
      >
        <form
          id="comercial-customer-form"
          onSubmit={(e) => void onSaveCustomer(e)}
          className="grid gap-3"
        >
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-brand-text-secondary">
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
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-brand-text-secondary">
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
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-brand-text-secondary">
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
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-brand-text-secondary">
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
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-brand-text-secondary">
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
              className="rounded border border-brand-danger/40 bg-brand-danger/10 px-3 py-2 text-sm text-brand-danger"
            >
              {customerError}
            </p>
          ) : null}
        </form>
      </SlideOver>

      <SlideOver
        open={contractSlideOpen}
        onClose={closeContractSlide}
        title={
          editingContractId
            ? "Editar contrato operativo"
            : "Nuevo contrato operativo"
        }
        description={
          editingContractId
            ? "Actualiza nombre, ruta, valor mensual o fecha de fin"
            : "Contrato B2B o licitación pública con MRR"
        }
        widthClass="max-w-2xl"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              className="w-auto px-4 py-2"
              onClick={closeContractSlide}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="comercial-contract-form"
              variant="primary"
              className="w-auto px-4 py-2"
              disabled={contractBusy}
            >
              {editingContractId ? "Guardar cambios" : "Crear contrato"}
            </Button>
          </div>
        }
      >
        <form
          id="comercial-contract-form"
          onSubmit={onSaveContract}
          className="grid grid-cols-1 gap-3 md:grid-cols-2"
        >
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-brand-text-secondary md:col-span-2">
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
          {!editingContractId ? (
            <>
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-brand-text-secondary">
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
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-brand-text-secondary">
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
            </>
          ) : null}
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-brand-text-secondary md:col-span-2">
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
          {!editingContractId ? (
            <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-brand-text-secondary">
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
          ) : null}
          <label
            className={`flex flex-col gap-1 text-[11px] uppercase tracking-wide text-brand-text-secondary ${editingContractId ? "md:col-span-2" : ""}`}
          >
            Fecha fin
            <input
              className="field"
              type="date"
              value={contractForm.endDate}
              onChange={(e) =>
                setContractForm({ ...contractForm, endDate: e.target.value })
              }
              required={!editingContractId}
              title="Fin de vigencia"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-brand-text-secondary md:col-span-2">
            Valor mensual
            <input
              className="field font-data tabular-nums"
              data-field="skip"
              inputMode="decimal"
              placeholder="$11.000.000"
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
              className="md:col-span-2 rounded border border-brand-danger/40 bg-brand-danger/10 px-3 py-2 text-sm text-brand-danger"
            >
              {contractError}
            </p>
          ) : null}
        </form>
      </SlideOver>

      <SlideOver
        open={conversionOpen}
        onClose={() => {
          setConversionOpen(false);
          setConversionQuote(null);
          setConversionTripCode(null);
        }}
        title="Quote-to-Cash · Cotización ganada"
        description="Conversión comercial completada. Continúe el flujo operativo."
        widthClass="max-w-lg"
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              className="w-auto"
              onClick={() => {
                setConversionOpen(false);
                setConversionQuote(null);
                setConversionTripCode(null);
              }}
            >
              Cerrar
            </Button>
            {conversionTripCode ? (
              <Link
                href={`/logistica/servicios?code=${encodeURIComponent(conversionTripCode)}`}
              >
                <Button type="button" variant="primary" className="w-auto">
                  Abrir viaje en Logística
                </Button>
              </Link>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              className="w-auto"
              onClick={() => {
                setConversionOpen(false);
                setTab("contratos");
              }}
            >
              Ir a contratos
            </Button>
          </>
        }
      >
        {conversionQuote ? (
          <div className="space-y-4">
            <div>
              <p className="font-data text-xs uppercase tracking-[0.12em] text-[var(--brand-text-secondary)]">
                {conversionQuote.code}
              </p>
              <p className="mt-1 text-lg font-semibold text-[var(--brand-text-primary)]">
                {conversionQuote.customer.name}
              </p>
              <p className="mt-2 font-data text-2xl font-bold tabular-nums text-[var(--brand-primary)]">
                {money(Number(conversionQuote.amount))}
              </p>
            </div>
            {conversionTripCode ? (
              <div className="rounded-lg border border-[var(--brand-border)] p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--brand-text-secondary)]">
                  Viaje borrador generado
                </p>
                <p className="mt-1 font-data text-lg font-bold text-[var(--brand-primary)]">
                  {conversionTripCode}
                </p>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-lg border border-[color-mix(in_srgb,var(--brand-warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--brand-warning)_8%,transparent)] p-3 text-sm text-[var(--brand-warning)]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                Viaje en cola — verifique Logística si no aparece en unos segundos.
              </div>
            )}
            <ol className="list-decimal space-y-2 pl-4 text-sm text-[var(--brand-text-secondary)]">
              <li>Confirmar despacho y asignación de unidad en Logística</li>
              <li>Formalizar contrato operativo si el servicio es recurrente</li>
              <li>Activar facturación y seguimiento de MRR en Tesorería</li>
            </ol>
          </div>
        ) : null}
      </SlideOver>
    </div>
  );
}
