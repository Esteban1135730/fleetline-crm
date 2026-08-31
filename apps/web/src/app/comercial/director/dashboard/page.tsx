"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { HARD_RULES } from "@fsg/shared";
import {
  FileText,
  PenLine,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { api } from "@/lib/api";
import { EmptyState, KpiCard, SlideOver } from "@/components/audit";
import { BentoPanel } from "@/components/nexa/bento-panel";
import { NexaTable, NexaRow, NexaCell } from "@/components/nexa/nexa-table";

type Deal = {
  id: string;
  code: string;
  accountName: string;
  stage: string;
  estimatedMonthlyValue: number | string;
  npsScore?: number | null;
  zone?: string;
};

type Renewal = {
  contractId: string;
  code: string;
  accountName: string;
  endsAt: string | null;
  daysLeft: number | null;
  monthlyValue: number;
  npsScore: number;
  portfolioCompliancePct: number;
  suggestedUpliftPct: number;
  task: string | null;
};

type Dash = {
  kanban: Record<string, Deal[]>;
  metrics: {
    quotaCop: number;
    wonMonthlyCop: number;
    quotaPct: number;
    openDeals: number;
    wonDeals: number;
    minMarginPct: number;
  };
  keyAccounts: Array<{
    id: string;
    code: string;
    accountName: string;
    stage: string;
    estimatedMonthlyValue: number;
    npsScore?: number | null;
    portfolioCompliancePct?: number | null;
    endsAt?: string | null;
  }>;
  renewals: Renewal[];
};

const STAGES: Array<{ key: string; label: string }> = [
  { key: "NUEVO_LEAD", label: "Nuevos prospectos" },
  { key: "REUNION_AGENDADA", label: "Reunión agendada" },
  { key: "COTIZACION_ENVIADA", label: "Cotización enviada" },
  { key: "EN_NEGOCIACION", label: "En negociación" },
  { key: "CERRADO_GANADO", label: "Cerrado ganado" },
];

function money(n: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function DirectorComercialDashboardPage() {
  const [dash, setDash] = useState<Dash | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cotizarOpen, setCotizarOpen] = useState(false);
  const [firmarOpen, setFirmarOpen] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [zone, setZone] = useState("BOGOTA");
  const [rate, setRate] = useState("4500");
  const [discount, setDiscount] = useState("0");
  const [signerEmail, setSignerEmail] = useState("");
  const [signDealId, setSignDealId] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await api.get<Dash>("/api/v1/comercial/director/dashboard");
      setDash(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Conexión fallida");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runCotizar() {
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const res = await api.post<{
        status: string;
        message: string;
        dealId: string;
        pdfRef?: string;
      }>("/api/v1/comercial/director/cotizar", {
        accountName: accountName.trim() || "Cuenta corporativa",
        zone,
        vehicleType: "BUS",
        distanceKm: 45,
        proposedRatePerKm: Number(rate) || undefined,
        discountPct: Number(discount) || 0,
        estimatedMonthlyValue: 22_000_000,
      });
      setMsg(`${res.status}: ${res.message}`);
      if (res.dealId) setSignDealId(res.dealId);
      setCotizarOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cotización fallida");
    } finally {
      setBusy(false);
    }
  }

  async function runFirmar() {
    if (!signDealId || !signerEmail) {
      setError("ID de oportunidad y correo del firmante requeridos");
      return;
    }
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const res = await api.post<{
        status: string;
        message: string;
        costCenter?: { code: string };
      }>("/api/v1/comercial/director/contrato/firmar-docusign", {
        dealId: signDealId,
        signerEmail,
        completeSign: true,
        vehiclesRequired: 2,
        monthlyValue: 22_000_000,
      });
      setMsg(
        `${res.status}: ${res.message}${
          res.costCenter ? ` · CC ${res.costCenter.code}` : ""
        }`,
      );
      setFirmarOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Firma fallida");
    } finally {
      setBusy(false);
    }
  }

  const quotaPct = dash?.metrics.quotaPct ?? 0;
  const gaugeRotation = -90 + (quotaPct / 100) * 180;

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-border pb-4">
        <div>
          <p className="font-data text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-primary">
            Comercial · Dirección
          </p>
          <h1 className="font-sans text-2xl font-semibold tracking-tight text-brand-text-primary md:text-3xl">
            Centro de comando de conversión
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            className="w-auto px-4 py-2"
            onClick={() => setCotizarOpen(true)}
          >
            Cotizar
          </Button>
          <Button
            type="button"
            variant="primary"
            className="w-auto px-4 py-2"
            onClick={() => setFirmarOpen(true)}
          >
            <PenLine className="mr-1.5 h-4 w-4" aria-hidden />
            Firma electrónica
          </Button>
        </div>
      </header>

      {error ? (
        <p className="rounded-lg border border-brand-danger/40 bg-brand-danger/10 px-4 py-3 font-data text-sm text-brand-danger">
          {error}
        </p>
      ) : null}
      {msg ? (
        <p className="rounded-lg border border-brand-primary/40 bg-brand-primary/10 px-4 py-3 font-data text-sm text-brand-primary">
          {msg}
        </p>
      ) : null}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Cuota mensual"
          value={`${quotaPct}%`}
          delta={money(dash?.metrics.wonMonthlyCop ?? 0)}
          tone={quotaPct >= 80 ? "ok" : quotaPct >= 50 ? "warn" : "danger"}
          icon={<Target />}
        />
        <KpiCard
          label="Meta COP"
          value={money(
            dash?.metrics.quotaCop ?? HARD_RULES.COMERCIAL_MONTHLY_QUOTA_COP,
          )}
          tone="neutral"
          icon={<TrendingUp />}
        />
        <KpiCard
          label="Abiertos"
          value={dash?.metrics.openDeals ?? 0}
          tone="warn"
          icon={<FileText />}
        />
        <KpiCard
          label="Ganados"
          value={dash?.metrics.wonDeals ?? 0}
          tone="ok"
          icon={<Users />}
        />
      </section>

      <BentoPanel
        id="pipeline"
        title="Embudo de ventas"
        subtitle={`Margen mín. ${dash?.metrics.minMarginPct ?? HARD_RULES.COMERCIAL_MIN_MARGIN_PCT}%`}
        icon={<TrendingUp aria-hidden />}
      >
        <div className="mb-4 flex flex-wrap items-end gap-8">
          <div className="relative h-28 w-56 overflow-hidden">
            <div
              className="absolute bottom-0 left-1/2 h-24 w-24 -translate-x-1/2 rounded-t-full border-[10px] border-b-0 border-brand-border"
              style={{
                borderTopColor: "var(--brand-primary)",
                borderLeftColor: "var(--brand-primary)",
                borderRightColor:
                  "color-mix(in srgb, var(--brand-chart-neutral) 25%, transparent)",
              }}
            />
            <div
              className="absolute bottom-0 left-1/2 h-20 w-1 origin-bottom bg-brand-warning"
              style={{ transform: `translateX(-50%) rotate(${gaugeRotation}deg)` }}
            />
            <p className="absolute bottom-1 left-0 right-0 text-center font-data text-2xl tabular-nums text-brand-text-primary">
              {quotaPct}%
            </p>
          </div>
        </div>
        <div className="grid gap-3 overflow-x-auto md:grid-cols-5">
          {STAGES.map((col) => {
            const deals = dash?.kanban?.[col.key] ?? [];
            const stageValue = deals.reduce(
              (sum, d) => sum + Number(d.estimatedMonthlyValue),
              0,
            );
            return (
              <BentoPanel
                key={col.key}
                title={col.label}
                subtitle={`${deals.length} · ${money(stageValue)}`}
                className="!p-3 min-w-[160px]"
              >
                <div className="space-y-2">
                  {deals.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setSignDealId(d.id)}
                      className="w-full rounded-lg border border-brand-border bg-brand-canvas p-2 text-left transition-colors duration-150 hover:border-brand-border-active"
                    >
                      <p className="truncate text-sm text-brand-text-primary">
                        {d.accountName}
                      </p>
                      <p className="font-data text-[10px] text-brand-text-secondary">
                        {d.code}
                      </p>
                      <p className="mt-1 font-data text-xs tabular-nums text-brand-warning">
                        {money(Number(d.estimatedMonthlyValue))}
                      </p>
                    </button>
                  ))}
                  {!deals.length ? (
                    <p className="text-xs text-brand-text-secondary">
                      Sin oportunidades
                    </p>
                  ) : null}
                </div>
              </BentoPanel>
            );
          })}
        </div>
      </BentoPanel>

      <div className="grid gap-4 lg:grid-cols-2">
        <BentoPanel title="Cuentas clave" icon={<Users aria-hidden />}>
          {(dash?.keyAccounts ?? []).length === 0 ? (
            <EmptyState
              icon={<Users className="h-7 w-7" />}
              title="Sin cuentas clave"
              description="Sin cuentas en negociación o ganado."
            />
          ) : (
            <NexaTable columns={["Cuenta", "Etapa", "Valor/mes"]}>
              {(dash?.keyAccounts ?? []).map((a) => (
                <NexaRow key={a.id}>
                  <NexaCell>
                    {a.accountName}
                    <div className="font-data text-[10px] text-brand-text-secondary">
                      {a.code}
                    </div>
                  </NexaCell>
                  <NexaCell>
                    <Badge tone="info">{a.stage.replace(/_/g, " ")}</Badge>
                  </NexaCell>
                  <NexaCell mono>
                    {money(Number(a.estimatedMonthlyValue))}
                  </NexaCell>
                </NexaRow>
              ))}
            </NexaTable>
          )}
        </BentoPanel>

        <BentoPanel
          id="renovaciones"
          title={`Radar renovaciones (${HARD_RULES.COMERCIAL_RENEWAL_RADAR_DAYS}d)`}
          icon={<FileText aria-hidden />}
        >
          {(dash?.renewals ?? []).length === 0 ? (
            <p className="text-xs text-brand-text-secondary">
              Sin vencimientos en horizonte 90 días
            </p>
          ) : (
            <ul className="space-y-3">
              {(dash?.renewals ?? []).map((r) => (
                <li
                  key={r.contractId}
                  className="rounded-lg border border-brand-border bg-brand-canvas p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm text-brand-text-primary">
                        {r.accountName}
                      </p>
                      <p className="font-data text-[10px] tabular-nums text-brand-text-secondary">
                        {r.code} · {r.daysLeft}d
                      </p>
                    </div>
                    <Badge tone="warning">+{r.suggestedUpliftPct}%</Badge>
                  </div>
                  <p className="mt-1 font-data text-xs tabular-nums text-brand-text-secondary">
                    Satisfacción {r.npsScore} · Cartera {r.portfolioCompliancePct}% ·{" "}
                    {money(r.monthlyValue)}
                  </p>
                  {r.task ? (
                    <p className="mt-1 text-xs text-brand-primary">{r.task}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </BentoPanel>
      </div>

      <SlideOver
        open={cotizarOpen}
        onClose={() => setCotizarOpen(false)}
        title="Cotizador inteligente"
        description="Costo real $/km · margen mínimo escala a CFO"
        widthClass="max-w-lg"
        footer={
          <Button
            type="button"
            variant="primary"
            className="w-auto px-4 py-2"
            disabled={busy}
            onClick={() => void runCotizar()}
          >
            Generar cotización
          </Button>
        }
      >
        <div className="space-y-3">
          <label className="block text-xs text-brand-text-secondary">
            Cuenta
            <input
              className="field mt-1 w-full"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="Colegio / Empresa"
            />
          </label>
          <div className="grid grid-cols-3 gap-2">
            <label className="block text-xs text-brand-text-secondary">
              Zona
              <select
                className="field mt-1 w-full"
                value={zone}
                onChange={(e) => setZone(e.target.value)}
              >
                <option value="BOGOTA">Bogotá</option>
                <option value="MEDELLIN">Medellín</option>
                <option value="CALI">Cali</option>
                <option value="BARRANQUILLA">Barranquilla</option>
              </select>
            </label>
            <label className="block text-xs text-brand-text-secondary">
              Tarifa $/km
              <input
                className="field mt-1 w-full font-data tabular-nums"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
            </label>
            <label className="block text-xs text-brand-text-secondary">
              Dcto %
              <input
                className="field mt-1 w-full font-data tabular-nums"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
            </label>
          </div>
        </div>
      </SlideOver>

      <SlideOver
        open={firmarOpen}
        onClose={() => setFirmarOpen(false)}
        title="Firma electrónica · Pase de relevo"
        description="DocuSign → cerrado ganado → centro de costos"
        widthClass="max-w-lg"
        footer={
          <Button
            type="button"
            variant="primary"
            className="w-auto px-4 py-2"
            disabled={busy}
            onClick={() => void runFirmar()}
          >
            Enviar a firma y cerrar ganado
          </Button>
        }
      >
        <div className="space-y-3">
          <label className="block text-xs text-brand-text-secondary">
            ID de oportunidad
            <input
              className="field mt-1 w-full font-data"
              value={signDealId}
              onChange={(e) => setSignDealId(e.target.value)}
              placeholder="Selecciona del tablero o cotiza"
            />
          </label>
          <label className="block text-xs text-brand-text-secondary">
            Correo del firmante
            <input
              className="field mt-1 w-full"
              value={signerEmail}
              onChange={(e) => setSignerEmail(e.target.value)}
              placeholder="legal@cliente.com"
            />
          </label>
        </div>
      </SlideOver>
    </div>
  );
}
