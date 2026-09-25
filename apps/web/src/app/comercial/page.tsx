"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  COMMERCIAL_PIPELINE,
  QUOTE_DEFAULT_MARGIN_PCT,
  QUOTE_MIN_MARGIN_PCT,
  QUOTE_VEHICLE_COSTS,
  URBAN_TRAFFIC_FACTORS,
  commercialLeadScore,
  estimateTollsForRoute,
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
import { EmptyState, KpiCard, Modal, SlideOver, StatusPulseBadge } from "@/components/audit";
import { SarlaftBlockBadge } from "@/components/sarlaft/sarlaft-block-badge";
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
  contactName?: string | null;
  creditKind?: string | null;
  serviceFrequency?: string | null;
  servicesPerMonth?: string | null;
  preferredVehicle?: string | null;
  logisticsOwner?: string | null;
  commercialNote?: string | null;
  branch?: string | null;
  sarlaftBlocked?: boolean;
  sarlaftRiskScore?: number;
  _count?: { quotes: number; trips: number; contracts: number };
};

function stageOf(q: { pipelineStage?: string | null; status: string }) {
  if (
    q.pipelineStage &&
    COMMERCIAL_PIPELINE.some((col) => col.key === q.pipelineStage)
  ) {
    return q.pipelineStage;
  }
  if (q.status === "SENT") return "COTIZADA";
  if (q.status === "APPROVED") return "NEGOCIACION";
  if (q.status === "WON") return "GANADO";
  if (q.status === "REJECTED" || q.status === "EXPIRED") return "PERDIDO";
  return "BANT";
}

function blankCustomer() {
  return {
    name: "",
    nit: "",
    email: "",
    phone: "",
    segment: "B2B" as "B2B" | "ESCOLAR" | "TURISMO",
    contactName: "",
    creditKind: "CONTADO",
    serviceFrequency: "",
    servicesPerMonth: "",
    preferredVehicle: "",
    logisticsOwner: "",
    commercialNote: "",
    branch: "BOGOTA",
  };
}

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
  customer: { name: string; sarlaftBlocked?: boolean };
  draftTrip?: { id: string; code: string; status: string } | null;
  pipelineStage?: string | null;
  nextAction?: string | null;
  followUpAt?: string | null;
  lossReason?: string | null;
  fitScore?: number | null;
  urgencyScore?: number | null;
  budgetScore?: number | null;
  docStatus?: string | null;
  wonAt?: string | null;
  createdAt?: string;
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
  const [customerForm, setCustomerForm] = useState(blankCustomer);
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
    modo: "NACIONAL" as "NACIONAL" | "URBANO",
    cantidadVehiculos: "1",
    dias: "1",
    idaYRegreso: false,
    paradas: "",
    factorTrafico: "1",
    tarifaMinima: "",
    salida: "",
    regreso: "",
    formaPago: "Contado",
    comentario: "",
  });
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const [stageError, setStageError] = useState("");
  const [followQuote, setFollowQuote] = useState<Quote | null>(null);
  const [followForm, setFollowForm] = useState({
    stage: "BANT",
    nextAction: "",
    followUpAt: "",
    lossReason: "",
    fitScore: "",
    urgencyScore: "",
    budgetScore: "",
    docStatus: "",
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

  useEffect(() => {
    const est = estimateTollsForRoute(calcForm.origen, calcForm.destino);
    if (est.source === "catalog") {
      setCalcForm((f) => ({
        ...f,
        cantidadPeajes: String(est.cantidadPeajes),
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calcForm.origen, calcForm.destino]);

  const calcPayload = useMemo(
    () => ({
      origen: calcForm.origen,
      destino: calcForm.destino,
      tipoVehiculo: calcForm.tipoVehiculo,
      distanciaKm: Number(calcForm.distanciaKm) || 0,
      cantidadPeajes: Number(calcForm.cantidadPeajes) || 0,
      margenDeseado: Number(calcForm.margenDeseado) || QUOTE_DEFAULT_MARGIN_PCT,
      modo: calcForm.modo,
      cantidadVehiculos: Number(calcForm.cantidadVehiculos) || 1,
      dias: Number(calcForm.dias) || 1,
      idaYRegreso: calcForm.idaYRegreso,
      paradas: calcForm.paradas
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      factorTrafico: Number(calcForm.factorTrafico) || 1,
      tarifaMinima: Number(calcForm.tarifaMinima) || 0,
      salida: calcForm.salida || undefined,
      regreso: calcForm.regreso || undefined,
      formaPago: calcForm.formaPago || undefined,
      comentario: calcForm.comentario || undefined,
    }),
    [calcForm],
  );

  const marginPct = useMemo(
    () => Number(calcForm.margenDeseado) || QUOTE_DEFAULT_MARGIN_PCT,
    [calcForm.margenDeseado],
  );

  const historyQuotes = useMemo(
    () =>
      quotes.filter((q) => {
        const stage = stageOf(q);
        return stage === "GANADO" || stage === "PERDIDO";
      }),
    [quotes],
  );

  const pipelineStats = useMemo(() => {
    const open = quotes.filter((q) =>
      COMMERCIAL_PIPELINE.some((col) => col.open && col.key === stageOf(q)),
    );
    const weighted = open.reduce((sum, q) => {
      const prob =
        COMMERCIAL_PIPELINE.find((col) => col.key === stageOf(q))?.probability ??
        0;
      return sum + Number(q.amount) * prob;
    }, 0);
    const ganado = quotes.filter((q) => stageOf(q) === "GANADO");
    const perdido = quotes.filter((q) => stageOf(q) === "PERDIDO");
    const closed = ganado.length + perdido.length;
    const winRate = closed ? Math.round((ganado.length / closed) * 100) : 0;
    const closeDays = ganado
      .map((q) => {
        if (!q.createdAt || !q.wonAt) return null;
        return Math.max(
          0,
          Math.round(
            (new Date(q.wonAt).getTime() - new Date(q.createdAt).getTime()) /
              86_400_000,
          ),
        );
      })
      .filter((n): n is number => n != null);
    const avgDays = closeDays.length
      ? Math.round(closeDays.reduce((sum, n) => sum + n, 0) / closeDays.length)
      : 0;
    const overdue = open.filter(
      (q) => q.followUpAt && new Date(q.followUpAt).getTime() < Date.now(),
    ).length;
    return {
      negociacion: quotes.filter((q) => stageOf(q) === "NEGOCIACION").length,
      ganado: ganado.length,
      pipelineValue: open.reduce((sum, q) => sum + Number(q.amount), 0),
      weighted,
      winRate,
      avgDays,
      overdue,
      mrr: contractsSummary.mrr,
      activas: open.length,
      contratosActivos: contractsSummary.activeCount,
    };
  }, [quotes, contractsSummary]);

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
    setCustomerForm(blankCustomer());
  }

  function openNewCustomer() {
    setEditingCustomerId(null);
    setCustomerError("");
    setCustomerForm(blankCustomer());
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
      contactName: c.contactName || "",
      creditKind: c.creditKind === "CREDITO" ? "CREDITO" : "CONTADO",
      serviceFrequency: c.serviceFrequency || "",
      servicesPerMonth: c.servicesPerMonth || "",
      preferredVehicle: c.preferredVehicle || "",
      logisticsOwner: c.logisticsOwner || "",
      commercialNote: c.commercialNote || "",
      branch: c.branch === "BARRANQUILLA" ? "BARRANQUILLA" : "BOGOTA",
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
            contactName: customerForm.contactName,
            creditKind: customerForm.creditKind,
            serviceFrequency: customerForm.serviceFrequency,
            servicesPerMonth: customerForm.servicesPerMonth,
            preferredVehicle: customerForm.preferredVehicle,
            logisticsOwner: customerForm.logisticsOwner,
            commercialNote: customerForm.commercialNote,
            branch: customerForm.branch,
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
            contactName: customerForm.contactName,
            creditKind: customerForm.creditKind,
            serviceFrequency: customerForm.serviceFrequency,
            servicesPerMonth: customerForm.servicesPerMonth,
            preferredVehicle: customerForm.preferredVehicle,
            logisticsOwner: customerForm.logisticsOwner,
            commercialNote: customerForm.commercialNote,
            branch: customerForm.branch,
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
    const selected = customers.find((c) => c.id === calcForm.customerId);
    if (selected?.sarlaftBlocked) {
      setCalcError("Cliente bloqueado por SARLAFT. No se puede cotizar.");
      return;
    }
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

  function openFollow(q: Quote, stage = stageOf(q)) {
    setStageError("");
    setFollowQuote(q);
    setFollowForm({
      stage,
      nextAction: q.nextAction || "",
      followUpAt: q.followUpAt ? q.followUpAt.slice(0, 16) : "",
      lossReason: q.lossReason || "",
      fitScore: q.fitScore ? String(q.fitScore) : "",
      urgencyScore: q.urgencyScore ? String(q.urgencyScore) : "",
      budgetScore: q.budgetScore ? String(q.budgetScore) : "",
      docStatus: q.docStatus || "",
    });
  }

  async function submitFollow(e: FormEvent) {
    e.preventDefault();
    if (!followQuote) return;
    setStageError("");
    try {
      const res = await api<
        Quote & { contractCode?: string | null; tripError?: string | null }
      >(`/comercial/quotes/${followQuote.id}/stage`, {
        method: "PATCH",
        body: JSON.stringify({
          stage: followForm.stage,
          nextAction: followForm.nextAction,
          followUpAt: followForm.followUpAt || null,
          lossReason: followForm.lossReason,
          fitScore: followForm.fitScore ? Number(followForm.fitScore) : undefined,
          urgencyScore: followForm.urgencyScore
            ? Number(followForm.urgencyScore)
            : undefined,
          budgetScore: followForm.budgetScore
            ? Number(followForm.budgetScore)
            : undefined,
          docStatus: followForm.docStatus,
        }),
      });
      setFollowQuote(null);
      await load();
      if (followForm.stage === "GANADO") {
        setConversionQuote({ ...followQuote, ...res });
        setConversionTripCode(res.draftTrip?.code ?? null);
        setConversionOpen(true);
        if (res.tripError) setStageError(res.tripError);
      }
    } catch (err) {
      setStageError(
        err instanceof Error ? err.message : "No se pudo mover la etapa",
      );
    }
  }

  function approveAndConvert(q: Quote) {
    openFollow(q, "GANADO");
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
          onClick={() => openFollow(q)}
        >
          Seguimiento
        </Button>
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
        {stageOf(q) === "BANT" || stageOf(q) === "DIAGNOSTICO" ? (
          <Button
            variant="ghost"
            className="w-auto"
            onClick={() => openFollow(q, "COTIZADA")}
          >
            Radicar
          </Button>
        ) : null}
        {stageOf(q) === "COTIZADA" ? (
          <Button
            variant="ghost"
            className="w-auto"
            onClick={() => openFollow(q, "NEGOCIACION")}
          >
            Negociar
          </Button>
        ) : null}
        {COMMERCIAL_PIPELINE.some((col) => col.open && col.key === stageOf(q)) ? (
          <Button
            variant="ghost"
            className="w-auto"
            onClick={() => openFollow(q, "PERDIDO")}
          >
            Perder
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
              title="Aprueba la cotización ganada (sin crear viaje automático)"
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
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
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
              label="Pipeline ponderado"
              value={money(pipelineStats.weighted)}
              delta={`${pipelineStats.activas} abiertas · ${money(pipelineStats.pipelineValue)}`}
              icon={<Target className="h-10 w-10" />}
              onClick={() => {
                setStageFilter(null);
                setQuoteView("pipeline");
              }}
            />
            <KpiCard
              label="Win rate"
              value={`${pipelineStats.winRate}%`}
              delta={`${pipelineStats.ganado} ganadas`}
              tone="ok"
              icon={<ShieldCheck className="h-10 w-10" />}
              onClick={() => {
                setStageFilter("CERRADAS");
                setQuoteView("historial");
              }}
            />
            <KpiCard
              label="Días hasta cierre"
              value={pipelineStats.avgDays}
              delta="Promedio de ganadas"
              icon={<TrendingUp className="h-10 w-10" />}
              onClick={() => {
                setStageFilter("GANADO");
                setQuoteView("pipeline");
              }}
            />
            <KpiCard
              label="Seguimientos vencidos"
              value={pipelineStats.overdue}
              tone={pipelineStats.overdue ? "warn" : "ok"}
              icon={<AlertTriangle className="h-10 w-10" />}
              onClick={() => {
                setStageFilter("OVERDUE");
                setQuoteView("pipeline");
              }}
            />
          </div>

          <BentoPanel
            title="Cotizador"
            subtitle="Nacional y Bogotá · km manuales · peajes estimados"
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
                  title="Auto-relleno por corredor; editable"
                />
                <span className="font-sans text-[10px] normal-case tracking-normal text-[var(--brand-text-secondary)]">
                  Estimado ·{" "}
                  {
                    estimateTollsForRoute(calcForm.origen, calcForm.destino)
                      .label
                  }{" "}
                  · $
                  {estimateTollsForRoute(
                    calcForm.origen,
                    calcForm.destino,
                  ).avgCop.toLocaleString("es-CO")}
                  /peaje
                </span>
              </label>
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-brand-text-secondary">
                Cobertura
                <select
                  className="field"
                  value={calcForm.modo}
                  onChange={(e) => {
                    const modo = e.target.value as "NACIONAL" | "URBANO";
                    setCalcForm({
                      ...calcForm,
                      modo,
                      factorTrafico:
                        modo === "URBANO" ? "1.05" : "1",
                    });
                  }}
                >
                  <option value="NACIONAL">Nacional</option>
                  <option value="URBANO">Bogotá</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-brand-text-secondary">
                Unidades
                <input
                  className="field font-data"
                  type="number"
                  min={1}
                  value={calcForm.cantidadVehiculos}
                  onChange={(e) =>
                    setCalcForm({ ...calcForm, cantidadVehiculos: e.target.value })
                  }
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-brand-text-secondary">
                Días
                <input
                  className="field font-data"
                  type="number"
                  min={1}
                  value={calcForm.dias}
                  onChange={(e) =>
                    setCalcForm({ ...calcForm, dias: e.target.value })
                  }
                />
              </label>
              <label className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-brand-text-secondary">
                <input
                  type="checkbox"
                  checked={calcForm.idaYRegreso}
                  onChange={(e) =>
                    setCalcForm({ ...calcForm, idaYRegreso: e.target.checked })
                  }
                />
                Ida y regreso
              </label>
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-brand-text-secondary md:col-span-2">
                Paradas
                <input
                  className="field"
                  placeholder="Separadas por coma"
                  value={calcForm.paradas}
                  onChange={(e) =>
                    setCalcForm({ ...calcForm, paradas: e.target.value })
                  }
                />
              </label>
              {calcForm.modo === "URBANO" ? (
                <>
                  <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-brand-text-secondary">
                    Tráfico
                    <select
                      className="field"
                      value={calcForm.factorTrafico}
                      onChange={(e) =>
                        setCalcForm({
                          ...calcForm,
                          factorTrafico: e.target.value,
                        })
                      }
                    >
                      {URBAN_TRAFFIC_FACTORS.map((item) => (
                        <option key={item.key} value={String(item.factor)}>
                          {item.label} ×{item.factor}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-brand-text-secondary">
                    Tarifa mínima
                    <input
                      className="field font-data"
                      type="number"
                      min={0}
                      value={calcForm.tarifaMinima}
                      onChange={(e) =>
                        setCalcForm({ ...calcForm, tarifaMinima: e.target.value })
                      }
                    />
                  </label>
                </>
              ) : null}
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-brand-text-secondary">
                Salida
                <input
                  className="field"
                  type="datetime-local"
                  value={calcForm.salida}
                  onChange={(e) =>
                    setCalcForm({ ...calcForm, salida: e.target.value })
                  }
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-brand-text-secondary">
                Regreso
                <input
                  className="field"
                  type="datetime-local"
                  value={calcForm.regreso}
                  onChange={(e) =>
                    setCalcForm({ ...calcForm, regreso: e.target.value })
                  }
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-brand-text-secondary">
                Pago
                <input
                  className="field"
                  value={calcForm.formaPago}
                  onChange={(e) =>
                    setCalcForm({ ...calcForm, formaPago: e.target.value })
                  }
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-brand-text-secondary md:col-span-2">
                Comentario
                <input
                  className="field"
                  value={calcForm.comentario}
                  onChange={(e) =>
                    setCalcForm({ ...calcForm, comentario: e.target.value })
                  }
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
                      : `Zona roja — bajo el mínimo de ${QUOTE_MIN_MARGIN_PCT}%`}
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
            {stageError ? (
              <p role="alert" className="mb-3 text-sm text-[var(--brand-danger)]">
                {stageError}
              </p>
            ) : null}
            {quoteView === "pipeline" ? (
              !quotes.length ? (
                <EmptyState
                  icon={<Calculator className="h-7 w-7" />}
                  title="Pipeline vacío"
                  description="Calcule una tarifa y guarde la cotización en borrador."
                />
              ) : (
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {COMMERCIAL_PIPELINE.filter((col) => {
                    if (stageFilter === "CERRADAS") return !col.open;
                    if (stageFilter === "OVERDUE" || !stageFilter) return col.open;
                    return col.key === stageFilter;
                  }).map((col) => {
                    const colQuotes = quotes.filter((q) => {
                      if (stageOf(q) !== col.key) return false;
                      if (stageFilter !== "OVERDUE") return true;
                      return Boolean(
                        q.followUpAt && new Date(q.followUpAt).getTime() < Date.now(),
                      );
                    });
                    const colValue = colQuotes.reduce(
                      (sum, q) => sum + Number(q.amount),
                      0,
                    );
                    const overdue = (q: Quote) =>
                      Boolean(
                        q.followUpAt &&
                          new Date(q.followUpAt).getTime() < Date.now() &&
                          col.open,
                      );
                    return (
                      <div
                        key={col.key}
                        className="min-w-[240px] flex-1"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const id = e.dataTransfer.getData("text/plain");
                          const quote = quotes.find((item) => item.id === id);
                          if (quote) openFollow(quote, col.key);
                        }}
                      >
                      <BentoPanel
                        title={`${col.label} · ${Math.round(col.probability * 100)}%`}
                        subtitle={`${colQuotes.length} · ${money(colValue)}`}
                        className="!p-3 h-full"
                      >
                        <div className="flex flex-1 flex-col gap-2">
                          {!colQuotes.length ? (
                            <p className="px-2 py-4 text-center text-xs text-[var(--brand-text-secondary)]">
                              Sin cotizaciones
                            </p>
                          ) : (
                            colQuotes.map((q) => {
                              const score = commercialLeadScore(
                                q.fitScore,
                                q.urgencyScore,
                                q.budgetScore,
                              );
                              return (
                              <article
                                key={q.id}
                                draggable
                                onDragStart={(e) => {
                                  e.dataTransfer.setData("text/plain", q.id);
                                  e.stopPropagation();
                                }}
                                className={`cursor-pointer rounded-md border bg-[var(--brand-surface)] p-3 transition-colors duration-150 hover:border-[color-mix(in_srgb,var(--brand-primary)_35%,transparent)] ${
                                  overdue(q)
                                    ? "border-[var(--brand-danger)]"
                                    : "border-[var(--brand-border)]"
                                }`}
                                onClick={() => openQuoteInspector(q)}
                                title="Arrastrar para cambiar de etapa"
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
                                {score != null ? (
                                  <p className="mt-0.5 font-data text-[10px] tabular-nums text-brand-text-secondary">
                                    Lead {score}/5
                                    {q.docStatus ? ` · docs ${q.docStatus}` : ""}
                                  </p>
                                ) : null}
                                {q.followUpAt ? (
                                  <p
                                    className={`mt-0.5 text-[10px] ${
                                      overdue(q)
                                        ? "text-[var(--brand-danger)]"
                                        : "text-brand-text-secondary"
                                    }`}
                                  >
                                    Seguimiento{" "}
                                    {new Date(q.followUpAt).toLocaleString("es-CO", {
                                      day: "2-digit",
                                      month: "short",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </p>
                                ) : null}
                                <div className="mt-2 border-t border-[var(--brand-border)] pt-2">
                                  {renderQuoteActions(q, true)}
                                </div>
                              </article>
                              );
                            })
                          )}
                        </div>
                      </BentoPanel>
                      </div>
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
                      {c.email || c.phone || c.contactName ? (
                        <div className="text-[10px] text-brand-text-secondary">
                          {[c.contactName, c.email, c.phone].filter(Boolean).join(" · ")}
                        </div>
                      ) : null}
                      {c.creditKind || c.branch ? (
                        <div className="text-[10px] text-brand-text-secondary">
                          {[
                            c.branch === "BARRANQUILLA" ? "Barranquilla" : c.branch ? "Bogotá" : null,
                            c.creditKind === "CREDITO" ? "Crédito" : c.creditKind ? "Contado" : null,
                            c.serviceFrequency,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      ) : null}
                    </NexaCell>
                    <NexaCell>
                      {c.sarlaftBlocked ? (
                        <SarlaftBlockBadge
                          blocked
                          riskScore={c.sarlaftRiskScore}
                          variant="full"
                        />
                      ) : (
                        <>
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
                        </>
                      )}
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

      <Modal
        open={Boolean(followQuote)}
        onClose={() => setFollowQuote(null)}
        title="Mover etapa"
        description={followQuote ? `${followQuote.code} · ${followQuote.customer.name}` : undefined}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              className="w-auto px-4 py-2"
              onClick={() => setFollowQuote(null)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="comercial-follow-form"
              variant="primary"
              className="w-auto px-4 py-2"
            >
              Guardar etapa
            </Button>
          </div>
        }
      >
        <form
          id="comercial-follow-form"
          className="grid gap-3"
          onSubmit={(e) => void submitFollow(e)}
        >
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-brand-text-secondary">
            Etapa
            <select
              className="field"
              value={followForm.stage}
              onChange={(e) =>
                setFollowForm({ ...followForm, stage: e.target.value })
              }
            >
              {COMMERCIAL_PIPELINE.map((col) => (
                <option key={col.key} value={col.key}>
                  {col.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-brand-text-secondary">
            Próxima acción
            <input
              className="field"
              value={followForm.nextAction}
              onChange={(e) =>
                setFollowForm({ ...followForm, nextAction: e.target.value })
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-brand-text-secondary">
            Fecha de seguimiento
            <input
              className="field"
              type="datetime-local"
              value={followForm.followUpAt}
              onChange={(e) =>
                setFollowForm({ ...followForm, followUpAt: e.target.value })
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-brand-text-secondary">
            Documentos
            <select
              className="field"
              value={followForm.docStatus}
              onChange={(e) =>
                setFollowForm({ ...followForm, docStatus: e.target.value })
              }
            >
              <option value="">Sin marcar</option>
              <option value="FALTAN">Faltan</option>
              <option value="REVISION">En revisión</option>
              <option value="COMPLETOS">Completos</option>
            </select>
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["fitScore", "Encaje"],
                ["urgencyScore", "Urgencia"],
                ["budgetScore", "Presupuesto"],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-brand-text-secondary"
              >
                {label}
                <input
                  className="field font-data"
                  type="number"
                  min={1}
                  max={5}
                  value={followForm[key]}
                  onChange={(e) =>
                    setFollowForm({ ...followForm, [key]: e.target.value })
                  }
                />
              </label>
            ))}
          </div>
          {followForm.stage === "PERDIDO" ? (
            <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-brand-text-secondary">
              Motivo de pérdida
              <input
                className="field"
                required
                value={followForm.lossReason}
                onChange={(e) =>
                  setFollowForm({ ...followForm, lossReason: e.target.value })
                }
              />
            </label>
          ) : null}
          {stageError ? (
            <p role="alert" className="text-sm text-[var(--brand-danger)]">
              {stageError}
            </p>
          ) : null}
        </form>
      </Modal>

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
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-brand-text-secondary">
            Contacto
            <input
              className="field"
              value={customerForm.contactName}
              onChange={(e) =>
                setCustomerForm({ ...customerForm, contactName: e.target.value })
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-brand-text-secondary">
            Sede
            <select
              className="field"
              value={customerForm.branch}
              onChange={(e) =>
                setCustomerForm({ ...customerForm, branch: e.target.value })
              }
            >
              <option value="BOGOTA">Bogotá</option>
              <option value="BARRANQUILLA">Barranquilla</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-brand-text-secondary">
            Crédito
            <select
              className="field"
              value={customerForm.creditKind}
              onChange={(e) =>
                setCustomerForm({ ...customerForm, creditKind: e.target.value })
              }
            >
              <option value="CONTADO">Contado</option>
              <option value="CREDITO">Crédito</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-brand-text-secondary">
            Frecuencia
            <input
              className="field"
              placeholder="Semanal, mensual, por evento"
              value={customerForm.serviceFrequency}
              onChange={(e) =>
                setCustomerForm({
                  ...customerForm,
                  serviceFrequency: e.target.value,
                })
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-brand-text-secondary">
            Servicios / mes
            <input
              className="field font-data"
              value={customerForm.servicesPerMonth}
              onChange={(e) =>
                setCustomerForm({
                  ...customerForm,
                  servicesPerMonth: e.target.value,
                })
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-brand-text-secondary">
            Vehículo habitual
            <input
              className="field"
              value={customerForm.preferredVehicle}
              onChange={(e) =>
                setCustomerForm({
                  ...customerForm,
                  preferredVehicle: e.target.value,
                })
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-brand-text-secondary">
            Responsable logístico
            <input
              className="field"
              value={customerForm.logisticsOwner}
              onChange={(e) =>
                setCustomerForm({
                  ...customerForm,
                  logisticsOwner: e.target.value,
                })
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-brand-text-secondary">
            Nota comercial
            <input
              className="field"
              value={customerForm.commercialNote}
              onChange={(e) =>
                setCustomerForm({
                  ...customerForm,
                  commercialNote: e.target.value,
                })
              }
            />
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
