"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { HARD_RULES, statusEs } from "@fsg/shared";
import {
  AlertTriangle,
  BarChart3,
  ClipboardList,
  Gavel,
  Users,
} from "lucide-react";
import { api } from "@/lib/api";
import { EmptyState, KpiCard, SlideOver } from "@/components/audit";
import { BentoPanel } from "@/components/nexa/bento-panel";
import { NexaTable, NexaRow, NexaCell } from "@/components/nexa/nexa-table";

type Leader = {
  userId: string;
  name: string;
  openDeals: number;
  wonDeals: number;
  wonValue: number;
  conversionRate: number;
};

type Bid = {
  id: string;
  code: string;
  title: string;
  entityName: string;
  closeAt: string;
  daysToClose: number;
  progressPct: number;
  estimatedValue: number;
  tasks: Array<{
    id: string;
    department: string;
    title: string;
    dueAt: string;
    status: string;
  }>;
};

type Dash = {
  leaderboard: Leader[];
  funnel: Record<string, number>;
  forecast: { weightedMonthlyCop: number; openDeals: number };
  pendingDiscounts: Array<{
    id: string;
    discountPct: number;
    ebitdaImpactPct: number;
    deal: { code: string; accountName: string };
  }>;
  bidding: Bid[];
  slaAlerts: Array<{
    dealId: string;
    code: string;
    accountName: string;
    slaStatus: string;
    hoursElapsed: number;
  }>;
  limits: { maxDiscountPct: number; slaHours: number };
};

function money(n: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function CoordinadorComercialDashboardPage() {
  const [dash, setDash] = useState<Dash | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [bidOpen, setBidOpen] = useState(false);
  const [quoteId, setQuoteId] = useState("");
  const [years, setYears] = useState("2");
  const [bidTitle, setBidTitle] = useState("");
  const [bidEntity, setBidEntity] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await api.get<Dash>(
        "/api/v1/comercial/coordinador/dashboard",
      );
      setDash(data);
      if (data.pendingDiscounts[0]) {
        setQuoteId(data.pendingDiscounts[0].id);
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Conexión fallida");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function aprobar(approve: boolean) {
    if (!quoteId) {
      setError("Selecciona cotización pendiente");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.post<{ status: string; message: string }>(
        "/api/v1/comercial/coordinador/descuento/aprobar",
        {
          quoteId,
          approve,
          requireContractYears: approve ? Number(years) || 2 : undefined,
        },
      );
      setMsg(`${res.status}: ${res.message}`);
      setDiscountOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Aprobación fallida");
    } finally {
      setBusy(false);
    }
  }

  async function crearBid() {
    setBusy(true);
    setMsg(null);
    try {
      const close = new Date();
      close.setDate(close.getDate() + 21);
      const res = await api.post<{ status: string; message: string }>(
        "/api/v1/comercial/coordinador/licitaciones/crear-proyecto",
        {
          title: bidTitle || "Transporte especial — entidad territorial",
          entityName: bidEntity.trim() || "Entidad territorial",
          category: "ESPECIAL",
          estimatedValue: 920_000_000,
          closeAt: close.toISOString(),
        },
      );
      setMsg(`${res.status}: ${res.message}`);
      setBidOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Licitación fallida");
    } finally {
      setBusy(false);
    }
  }

  async function roundRobin() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.post<{ status: string; message: string }>(
        "/api/v1/comercial/coordinador/leads/distribuir-round-robin",
        { includeUnassigned: true, reassignSlaBreached: true },
      );
      setMsg(`${res.status}: ${res.message}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Round-robin fallido");
    } finally {
      setBusy(false);
    }
  }

  const funnelTotal = Object.values(dash?.funnel ?? {}).reduce(
    (a, b) => a + b,
    0,
  );
  const slaRed = (dash?.slaAlerts ?? []).filter((a) => a.slaStatus === "RED").length;

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-border pb-4">
        <div>
          <p className="font-data text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-primary">
            Comercial · Coordinación
          </p>
          <h1 className="font-sans text-2xl font-semibold tracking-tight text-brand-text-primary md:text-3xl">
            Centro analítico · Coordinación
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            className="w-auto px-4 py-2"
            onClick={() => setDiscountOpen(true)}
          >
            Aprobar descuento
          </Button>
          <Button
            type="button"
            variant="primary"
            className="w-auto px-4 py-2"
            onClick={() => setBidOpen(true)}
          >
            <Gavel className="mr-1.5 h-4 w-4" aria-hidden />
            Proyecto SECOP
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
          label="Pronóstico ponderado"
          value={money(dash?.forecast.weightedMonthlyCop ?? 0)}
          delta={`${dash?.forecast.openDeals ?? 0} abiertos`}
          tone="ok"
          icon={<BarChart3 />}
        />
        <KpiCard
          label="Descuentos pendientes"
          value={dash?.pendingDiscounts.length ?? 0}
          tone={(dash?.pendingDiscounts.length ?? 0) > 0 ? "warn" : "ok"}
          icon={<ClipboardList />}
        />
        <KpiCard
          label="Licitaciones activas"
          value={dash?.bidding.length ?? 0}
          tone="neutral"
          icon={<Gavel />}
        />
        <KpiCard
          label={`SLA ${dash?.limits.slaHours ?? HARD_RULES.COMERCIAL_LEAD_SLA_HOURS}h`}
          value={slaRed}
          delta={slaRed > 0 ? "Alertas rojas" : "Nominal"}
          tone={slaRed > 0 ? "danger" : "ok"}
          icon={<AlertTriangle />}
        />
      </section>

      <BentoPanel
        id="leaderboard"
        title="Leaderboard del equipo"
        icon={<Users aria-hidden />}
      >
        {(dash?.leaderboard ?? []).length === 0 ? (
          <EmptyState
            icon={<Users className="h-7 w-7" />}
            title="Sin datos de equipo"
            description="El leaderboard se poblará con actividad comercial."
          />
        ) : (
          <NexaTable
            columns={["#", "Gestor", "Abiertos", "Ganados", "Ventas", "Conv."]}
          >
            {(dash?.leaderboard ?? []).map((l, i) => (
              <NexaRow key={l.userId}>
                <NexaCell mono>{i + 1}</NexaCell>
                <NexaCell>{l.name}</NexaCell>
                <NexaCell mono>{l.openDeals}</NexaCell>
                <NexaCell mono>{l.wonDeals}</NexaCell>
                <NexaCell mono className="text-brand-warning">
                  {money(l.wonValue)}
                </NexaCell>
                <NexaCell mono>{l.conversionRate}%</NexaCell>
              </NexaRow>
            ))}
          </NexaTable>
        )}
      </BentoPanel>

      <div className="grid gap-4 lg:grid-cols-2">
        <BentoPanel title="Embudo agregado · Pronóstico" icon={<BarChart3 aria-hidden />}>
          <p className="font-data text-2xl tabular-nums text-brand-primary">
            {money(dash?.forecast.weightedMonthlyCop ?? 0)}
          </p>
          <p className="text-xs text-brand-text-secondary">
            Proyección ponderada · {dash?.forecast.openDeals ?? 0} abiertos
          </p>
          <div className="mt-4 space-y-2">
            {Object.entries(dash?.funnel ?? {}).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2 text-xs">
                <span className="w-36 truncate text-brand-text-secondary">
                  {k.replace(/_/g, " ")}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded bg-brand-canvas">
                  <div
                    className="h-full bg-brand-primary"
                    style={{
                      width: `${funnelTotal ? (v / funnelTotal) * 100 : 0}%`,
                    }}
                  />
                </div>
                <span className="font-data w-6 text-right tabular-nums">{v}</span>
              </div>
            ))}
          </div>
        </BentoPanel>

        <BentoPanel
          title={`Aprobación descuentos (Nivel 1 · máx ${HARD_RULES.COORDINADOR_COMERCIAL_MAX_DISCOUNT_PCT}%)`}
          icon={<ClipboardList aria-hidden />}
        >
          <ul className="space-y-2 text-sm">
            {(dash?.pendingDiscounts ?? []).map((q) => (
              <li
                key={q.id}
                className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-brand-border bg-brand-canvas px-3 py-2"
                onClick={() => setQuoteId(q.id)}
              >
                <div>
                  <p className="text-brand-text-primary">{q.deal.accountName}</p>
                  <p className="font-data text-[10px] tabular-nums text-brand-text-secondary">
                    {q.deal.code} · dcto {q.discountPct}%
                  </p>
                </div>
                <Badge tone={q.ebitdaImpactPct < -2 ? "danger" : "warning"}>
                  EBITDA {q.ebitdaImpactPct}%
                </Badge>
              </li>
            ))}
            {(dash?.pendingDiscounts ?? []).length === 0 ? (
              <li className="text-xs text-brand-text-secondary">
                Sin solicitudes pendientes
              </li>
            ) : null}
          </ul>
        </BentoPanel>
      </div>

      <BentoPanel
        id="secop"
        title="Seguimiento SECOP · Cronograma"
        icon={<Gavel aria-hidden />}
      >
        {(dash?.bidding ?? []).length === 0 ? (
          <p className="text-xs text-brand-text-secondary">
            Sin proyectos de licitación activos
          </p>
        ) : (
          (dash?.bidding ?? []).map((b) => (
            <div
              key={b.id}
              className="mb-3 rounded-lg border border-brand-border bg-brand-canvas p-4 last:mb-0"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm text-brand-text-primary">{b.title}</p>
                  <p className="font-data text-[10px] text-brand-text-secondary">
                    {b.code} · {b.entityName}
                  </p>
                </div>
                <Badge tone={b.daysToClose <= 7 ? "danger" : "warning"}>
                  {b.daysToClose}d
                </Badge>
              </div>
              <div className="mt-3 space-y-2">
                {b.tasks.map((t) => {
                  const start = new Date(b.tasks[0]?.dueAt ?? t.dueAt).getTime();
                  const end = new Date(b.closeAt).getTime();
                  const due = new Date(t.dueAt).getTime();
                  const pct =
                    end > start
                      ? Math.min(
                          100,
                          Math.max(0, ((due - start) / (end - start)) * 100),
                        )
                      : 50;
                  return (
                    <div key={t.id} className="text-xs">
                      <div className="mb-1 flex justify-between text-brand-text-secondary">
                        <span>
                          {t.department}: {t.title}
                        </span>
                        <span className="font-data">{statusEs(t.status)}</span>
                      </div>
                      <div className="relative h-2 rounded bg-brand-surface">
                        <div
                          className="absolute top-0 h-2 w-2 rounded-full bg-brand-primary"
                          style={{ left: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </BentoPanel>

      <BentoPanel
        id="sla"
        title={`SLA Ventas (${dash?.limits.slaHours ?? 2}h) · Round-Robin`}
        icon={<AlertTriangle aria-hidden />}
        action={
          <Button
            type="button"
            variant="primary"
            className="w-auto px-3 py-1.5"
            disabled={busy}
            onClick={() => void roundRobin()}
          >
            Distribuir / Reasignar
          </Button>
        }
      >
        <ul className="space-y-2">
          {(dash?.slaAlerts ?? []).map((a) => (
            <li
              key={a.dealId}
              className="flex items-center justify-between rounded-lg border border-brand-border bg-brand-canvas px-3 py-2 text-sm"
            >
              <div>
                <p className="text-brand-text-primary">{a.accountName}</p>
                <p className="font-data text-[10px] tabular-nums text-brand-text-secondary">
                  {a.code} · {a.hoursElapsed}h
                </p>
              </div>
              <Badge tone={a.slaStatus === "RED" ? "danger" : "warning"}>
                {a.slaStatus}
              </Badge>
            </li>
          ))}
          {(dash?.slaAlerts ?? []).length === 0 ? (
            <li className="text-xs text-brand-text-secondary">
              SLA nominal — sin alertas
            </li>
          ) : null}
        </ul>
      </BentoPanel>

      <SlideOver
        open={discountOpen}
        onClose={() => setDiscountOpen(false)}
        title="Aprobación descuento · Nivel 1"
        description={`Hasta ${HARD_RULES.COORDINADOR_COMERCIAL_MAX_DISCOUNT_PCT}% — superior escala a CFO`}
        widthClass="max-w-md"
        footer={
          <div className="flex gap-2">
            <Button
              type="button"
              variant="primary"
              className="w-auto px-4 py-2"
              disabled={busy}
              onClick={() => void aprobar(true)}
            >
              Aprobar condicionado
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-auto px-4 py-2"
              disabled={busy}
              onClick={() => void aprobar(false)}
            >
              Rechazar
            </Button>
          </div>
        }
      >
        <label className="block text-xs text-brand-text-secondary">
          Condición: años de contrato
          <input
            className="field mt-1 w-24 font-data tabular-nums"
            value={years}
            onChange={(e) => setYears(e.target.value)}
          />
        </label>
      </SlideOver>

      <SlideOver
        open={bidOpen}
        onClose={() => setBidOpen(false)}
        title="Crear proyecto SECOP"
        description="Tareas Jurídico / Archivo / Finanzas con deadlines"
        widthClass="max-w-lg"
        footer={
          <Button
            type="button"
            variant="primary"
            className="w-auto px-4 py-2"
            disabled={busy}
            onClick={() => void crearBid()}
          >
            Crear proyecto
          </Button>
        }
      >
        <div className="space-y-3">
          <label className="block text-xs text-brand-text-secondary">
            Título proceso
            <input
              className="field mt-1 w-full"
              placeholder="Transporte especial"
              value={bidTitle}
              onChange={(e) => setBidTitle(e.target.value)}
            />
          </label>
          <label className="block text-xs text-brand-text-secondary">
            Entidad
            <input
              className="field mt-1 w-full"
              placeholder="Gobernación / Alcaldía"
              value={bidEntity}
              onChange={(e) => setBidEntity(e.target.value)}
            />
          </label>
        </div>
      </SlideOver>
    </div>
  );
}
