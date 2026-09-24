"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Button } from "@fsg/ui";
import { FileDown, Kanban, Plus, RefreshCw } from "lucide-react";
import { api, apiDownload } from "@/lib/api";
import { EmptyState, SlideOver } from "@/components/audit";
import { BentoPanel } from "@/components/nexa/bento-panel";
import { SarlaftBlockBadge } from "@/components/sarlaft/sarlaft-block-badge";
import {
  CommercialKanbanBoard,
  type CommercialDealCard,
  PIPELINE_COLUMNS,
} from "@/components/comercial/commercial-kanban-board";

type Dash = {
  kanban: Record<string, CommercialDealCard[]>;
  metrics?: {
    openDeals: number;
    wonDeals: number;
    quotaPct: number;
  };
};

function moneyInput(n: number | string | null | undefined) {
  if (n == null || n === "") return "";
  return String(n);
}

export default function ComercialTableroPage() {
  const [dash, setDash] = useState<Dash | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const [selected, setSelected] = useState<CommercialDealCard | null>(null);
  const [fichaOpen, setFichaOpen] = useState(false);
  const [cotizarOpen, setCotizarOpen] = useState(false);

  const [accountName, setAccountName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [nit, setNit] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [zone, setZone] = useState("BOGOTA");
  const [vehicleType, setVehicleType] = useState("BUS");
  const [distanceKm, setDistanceKm] = useState("45");
  const [estimatedMonthly, setEstimatedMonthly] = useState("0");

  const [quoteDealId, setQuoteDealId] = useState("");
  const [quoteAccount, setQuoteAccount] = useState("");
  const [quoteZone, setQuoteZone] = useState("BOGOTA");
  const [quoteVehicle, setQuoteVehicle] = useState("BUS");
  const [quoteKm, setQuoteKm] = useState("45");
  const [quoteRate, setQuoteRate] = useState("15000");
  const [quoteDiscount, setQuoteDiscount] = useState("0");
  const [lastQuoteId, setLastQuoteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get<Dash>("/api/v1/comercial/director/dashboard");
      setDash(data);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el embudo");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openFicha(deal: CommercialDealCard) {
    setSelected(deal);
    setAccountName(deal.accountName);
    setCustomerName(deal.customer?.name || deal.accountName);
    setNit(deal.customer?.nit || "");
    setEmail(deal.customer?.email || "");
    setPhone(deal.customer?.phone || "");
    setZone(deal.zone || "BOGOTA");
    setVehicleType(deal.vehicleType || "BUS");
    setDistanceKm(moneyInput(deal.distanceKm ?? 45));
    setEstimatedMonthly(moneyInput(deal.estimatedMonthlyValue));
    setLastQuoteId(deal.latestQuoteId || null);
    setFichaOpen(true);
  }

  function openCotizar(deal?: CommercialDealCard | null) {
    if (deal) {
      setQuoteDealId(deal.id);
      setQuoteAccount(deal.accountName);
      setQuoteZone(deal.zone || "BOGOTA");
      setQuoteVehicle(deal.vehicleType || "BUS");
      setQuoteKm(moneyInput(deal.distanceKm ?? 45));
      setLastQuoteId(deal.latestQuoteId || null);
    } else {
      setQuoteDealId("");
      setQuoteAccount("");
      setQuoteZone("BOGOTA");
      setQuoteVehicle("BUS");
      setQuoteKm("45");
      setLastQuoteId(null);
    }
    setQuoteRate("15000");
    setQuoteDiscount("0");
    setCotizarOpen(true);
  }

  async function moveDeal(dealId: string, stage: string) {
    const current = Object.values(dash?.kanban || {})
      .flat()
      .find((d) => d.id === dealId);
    if (!current || current.stage === stage) return;

    setBusy(true);
    setError("");
    try {
      await api.patch(
        `/api/v1/comercial/director/deals/${dealId}`,
        { stage },
        { confirm: { skip: true } },
      );
      setInfo(`Etapa actualizada · ${PIPELINE_COLUMNS.find((c) => c.key === stage)?.label || stage}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo mover la tarjeta");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function saveFicha(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const updated = await api.patch<CommercialDealCard>(
        `/api/v1/comercial/director/deals/${selected.id}`,
        {
          accountName: accountName.trim(),
          customerName: customerName.trim() || undefined,
          nit: nit.trim() || undefined,
          email: email.trim(),
          phone: phone.trim(),
          zone: zone.trim().toUpperCase(),
          vehicleType,
          distanceKm: Number(distanceKm) || undefined,
          estimatedMonthlyValue: Number(estimatedMonthly) || 0,
        },
        { confirm: { skip: true } },
      );
      setSelected({ ...selected, ...updated });
      setInfo("Ficha guardada");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }

  async function submitCotizar(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const res = await api.post<{
        status: string;
        message: string;
        dealId: string;
        quote?: { id: string };
        pdfRef?: string;
        pdfGenerated?: boolean;
      }>("/api/v1/comercial/director/cotizar", {
        dealId: quoteDealId || undefined,
        accountName: quoteAccount.trim() || undefined,
        zone: quoteZone.trim().toUpperCase() || "BOGOTA",
        vehicleType: quoteVehicle,
        distanceKm: Number(quoteKm) || 45,
        proposedRatePerKm: Number(quoteRate) || undefined,
        discountPct: Number(quoteDiscount) || 0,
        estimatedMonthlyValue: Number(estimatedMonthly) || undefined,
      });
      const qid = res.quote?.id || null;
      setLastQuoteId(qid);
      setInfo(
        res.pdfGenerated
          ? `${res.message} · PDF listo`
          : `${res.status}: ${res.message}`,
      );
      await load();
      if (qid) {
        setQuoteDealId(res.dealId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cotización fallida");
    } finally {
      setBusy(false);
    }
  }

  async function downloadPdf(quoteId: string) {
    setBusy(true);
    setError("");
    try {
      await apiDownload(
        `/api/v1/comercial/director/quotes/${quoteId}/pdf`,
        `oferta-${quoteId.slice(-6)}.pdf`,
      );
      setInfo("PDF descargado");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo descargar el PDF");
    } finally {
      setBusy(false);
    }
  }

  const totalCards = Object.values(dash?.kanban || {}).reduce(
    (n, col) => n + col.length,
    0,
  );

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--brand-border)] pb-4">
        <div>
          <p className="font-data text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--brand-primary)]">
            Comercial · Embudo
          </p>
          <h1 className="mt-1 font-sans text-2xl font-semibold tracking-tight text-[var(--brand-text-primary)] md:text-3xl">
            Tablero y cotización
          </h1>
          <p className="mt-1 text-sm text-[var(--brand-text-secondary)]">
            Arrastre tarjetas entre etapas · abra la ficha · cotice y descargue PDF
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="ghost"
            className="w-auto px-3 py-1.5 text-xs"
            disabled={busy}
            onClick={() => void load()}
          >
            <RefreshCw className="mr-1 inline h-3 w-3" aria-hidden />
            Refrescar
          </Button>
          <Button
            type="button"
            variant="primary"
            className="w-auto px-3 py-1.5 text-xs"
            disabled={busy}
            onClick={() => openCotizar(null)}
          >
            <Plus className="mr-1 inline h-3 w-3" aria-hidden />
            Nueva cotización
          </Button>
        </div>
      </header>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-[var(--brand-danger)]/30 bg-[var(--brand-danger)]/10 px-3 py-2 text-sm text-[var(--brand-danger)]"
        >
          {error}
        </p>
      ) : null}
      {info ? (
        <p className="rounded-lg border border-[var(--brand-success)]/30 bg-[var(--brand-success)]/10 px-3 py-2 text-sm text-[var(--brand-success)]">
          {info}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <BentoPanel title="Abiertas" subtitle="En embudo">
          <p className="font-data text-2xl tabular-nums text-[var(--brand-text-primary)]">
            {dash?.metrics?.openDeals ?? "—"}
          </p>
        </BentoPanel>
        <BentoPanel title="Ganadas" subtitle="Cerrado ganado">
          <p className="font-data text-2xl tabular-nums text-[var(--brand-text-primary)]">
            {dash?.metrics?.wonDeals ?? "—"}
          </p>
        </BentoPanel>
        <BentoPanel title="Cuota" subtitle="% meta mensual">
          <p className="font-data text-2xl tabular-nums text-[var(--brand-text-primary)]">
            {dash?.metrics?.quotaPct != null ? `${dash.metrics.quotaPct}%` : "—"}
          </p>
        </BentoPanel>
      </div>

      <BentoPanel
        title="Embudo de ventas"
        subtitle={`${totalCards} oportunidad(es) · arrastre para cambiar etapa`}
        icon={<Kanban className="h-4 w-4" aria-hidden />}
      >
        {!dash ? (
          <EmptyState
            title="Cargando embudo"
            description="Sincronizando oportunidades comerciales…"
          />
        ) : totalCards === 0 ? (
          <EmptyState
            icon={<Kanban className="h-7 w-7" />}
            title="Sin oportunidades"
            description="Cree una cotización para abrir el primer prospecto en el tablero."
            actionLabel="Nueva cotización"
            onAction={() => openCotizar(null)}
          />
        ) : (
          <CommercialKanbanBoard
            kanban={dash.kanban}
            busy={busy}
            onOpenDeal={openFicha}
            onMoveDeal={moveDeal}
          />
        )}
      </BentoPanel>

      <SlideOver
        open={fichaOpen}
        onClose={() => {
          setFichaOpen(false);
          setSelected(null);
        }}
        title={selected ? `Ficha · ${selected.code}` : "Ficha del cliente"}
        description="Datos de la oportunidad y del cliente. Guarde para actualizar."
        widthClass="max-w-lg"
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              className="w-auto px-4 py-2"
              onClick={() => {
                if (selected) openCotizar(selected);
              }}
              disabled={!selected || busy}
            >
              Cotizar
            </Button>
            {selected?.latestQuoteId || lastQuoteId ? (
              <Button
                type="button"
                variant="secondary"
                className="w-auto px-4 py-2"
                disabled={busy}
                onClick={() =>
                  void downloadPdf(
                    (selected?.latestQuoteId || lastQuoteId) as string,
                  )
                }
              >
                <FileDown className="mr-1 inline h-3.5 w-3.5" aria-hidden />
                PDF
              </Button>
            ) : null}
            <Button
              type="submit"
              form="comercial-ficha-form"
              variant="primary"
              className="w-auto px-4 py-2"
              disabled={busy}
            >
              Guardar ficha
            </Button>
          </>
        }
      >
        {selected ? (
          <form
            id="comercial-ficha-form"
            onSubmit={(e) => void saveFicha(e)}
            className="space-y-3"
          >
            {selected.customer?.sarlaftBlocked ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--brand-danger)]/30 bg-[var(--brand-danger)]/10 px-3 py-2">
                <SarlaftBlockBadge
                  blocked
                  riskScore={selected.customer.sarlaftRiskScore}
                  variant="full"
                />
                <p className="text-xs text-[var(--brand-danger)]">
                  Hard-lock AML: no cotice ni avance hasta liberación del Oficial
                  de Cumplimiento.
                </p>
              </div>
            ) : null}
            <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-secondary)]">
              Cuenta / razón social
              <input
                className="field mt-1 w-full"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                required
              />
            </label>
            <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-secondary)]">
              Nombre cliente
              <input
                className="field mt-1 w-full"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-secondary)]">
                NIT
                <input
                  className="field mt-1 w-full font-data"
                  value={nit}
                  onChange={(e) => setNit(e.target.value)}
                />
              </label>
              <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-secondary)]">
                Teléfono
                <input
                  className="field mt-1 w-full"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </label>
            </div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-secondary)]">
              Correo
              <input
                className="field mt-1 w-full"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-secondary)]">
                Zona
                <input
                  className="field mt-1 w-full"
                  value={zone}
                  onChange={(e) => setZone(e.target.value)}
                />
              </label>
              <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-secondary)]">
                Tipo vehículo
                <select
                  className="field mt-1 w-full"
                  value={vehicleType}
                  onChange={(e) => setVehicleType(e.target.value)}
                >
                  <option value="BUS">Bus</option>
                  <option value="VAN">Van</option>
                  <option value="MICROBUS">Microbús</option>
                  <option value="CAMIONETA">Camioneta</option>
                </select>
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-secondary)]">
                Distancia (km)
                <input
                  className="field mt-1 w-full font-data"
                  type="number"
                  min={1}
                  value={distanceKm}
                  onChange={(e) => setDistanceKm(e.target.value)}
                />
              </label>
              <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-secondary)]">
                Valor estimado / mes
                <input
                  className="field mt-1 w-full font-data"
                  type="number"
                  min={0}
                  value={estimatedMonthly}
                  onChange={(e) => setEstimatedMonthly(e.target.value)}
                />
              </label>
            </div>
            <p className="text-xs text-[var(--brand-text-secondary)]">
              Etapa actual:{" "}
              <span className="font-data text-[var(--brand-text-primary)]">
                {PIPELINE_COLUMNS.find((c) => c.key === selected.stage)?.label ||
                  selected.stage}
              </span>
            </p>
          </form>
        ) : null}
      </SlideOver>

      <SlideOver
        open={cotizarOpen}
        onClose={() => setCotizarOpen(false)}
        title="Cotizador"
        description="Precios básicos · el backend calcula margen y genera el PDF de oferta."
        widthClass="max-w-lg"
        footer={
          <>
            {lastQuoteId ? (
              <Button
                type="button"
                variant="secondary"
                className="w-auto px-4 py-2"
                disabled={busy}
                onClick={() => void downloadPdf(lastQuoteId)}
              >
                <FileDown className="mr-1 inline h-3.5 w-3.5" aria-hidden />
                Descargar PDF
              </Button>
            ) : null}
            <Button
              type="submit"
              form="comercial-cotizar-form"
              variant="primary"
              className="w-auto px-4 py-2"
              disabled={busy || (!quoteDealId && !quoteAccount.trim())}
            >
              Crear cotización
            </Button>
          </>
        }
      >
        <form
          id="comercial-cotizar-form"
          onSubmit={(e) => void submitCotizar(e)}
          className="space-y-3"
        >
          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-secondary)]">
            Cuenta
            <input
              className="field mt-1 w-full"
              value={quoteAccount}
              onChange={(e) => setQuoteAccount(e.target.value)}
              placeholder="Nombre de la empresa"
              required={!quoteDealId}
              disabled={Boolean(quoteDealId)}
            />
          </label>
          {quoteDealId ? (
            <p className="font-data text-[11px] text-[var(--brand-text-secondary)]">
              Vinculada a oportunidad {quoteDealId.slice(0, 8)}…
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-secondary)]">
              Zona
              <input
                className="field mt-1 w-full"
                value={quoteZone}
                onChange={(e) => setQuoteZone(e.target.value)}
              />
            </label>
            <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-secondary)]">
              Vehículo
              <select
                className="field mt-1 w-full"
                value={quoteVehicle}
                onChange={(e) => setQuoteVehicle(e.target.value)}
              >
                <option value="BUS">Bus</option>
                <option value="VAN">Van</option>
                <option value="MICROBUS">Microbús</option>
                <option value="CAMIONETA">Camioneta</option>
              </select>
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-secondary)]">
              Km
              <input
                className="field mt-1 w-full font-data"
                type="number"
                min={1}
                value={quoteKm}
                onChange={(e) => setQuoteKm(e.target.value)}
              />
            </label>
            <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-secondary)]">
              Tarifa $/km
              <input
                className="field mt-1 w-full font-data"
                type="number"
                min={1}
                value={quoteRate}
                onChange={(e) => setQuoteRate(e.target.value)}
              />
            </label>
            <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-secondary)]">
              Descuento %
              <input
                className="field mt-1 w-full font-data"
                type="number"
                min={0}
                max={50}
                value={quoteDiscount}
                onChange={(e) => setQuoteDiscount(e.target.value)}
              />
            </label>
          </div>
        </form>
      </SlideOver>
    </div>
  );
}
