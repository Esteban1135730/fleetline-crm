"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { HARD_RULES } from "@fsg/shared";
import { api } from "@/lib/api";
import { HowToBox, PageIntro } from "@/components/page-intro";

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
      setError(e instanceof Error ? e.message : "Uplink fallido");
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
          entityName: bidEntity || "Gobernación Demo",
          category: "ESPECIAL",
          estimatedValue: 920_000_000,
          closeAt: close.toISOString(),
        },
      );
      setMsg(`${res.status}: ${res.message}`);
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

  return (
    <div className="space-y-8">
      <PageIntro module="comercial" title="Centro Analítico · Coordinación" />

      <HowToBox
        steps={[
          `Aprobación Nivel 1 hasta ${HARD_RULES.COORDINADOR_COMERCIAL_MAX_DISCOUNT_PCT}% — superior escala a CFO.`,
          `SLA ${HARD_RULES.COMERCIAL_LEAD_SLA_HOURS}h sin contacto → rojo y reasignación round-robin.`,
          "Licitaciones SECOP: tareas Jurídico / Archivo / Finanzas con deadlines inamovibles.",
        ]}
      />

      {error && (
        <p className="font-mono text-sm text-[var(--fl-critical)]">{error}</p>
      )}
      {msg && (
        <p className="font-mono text-sm text-[var(--fl-accent)]">{msg}</p>
      )}

      <section
        id="leaderboard"
        className="rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-5"
      >
        <h2 className="text-sm font-semibold text-[var(--fl-text)]">
          Leaderboard del equipo
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-[var(--fl-subtext)]">
              <tr>
                <th className="pb-2">#</th>
                <th className="pb-2">Gestor</th>
                <th className="pb-2">Abiertos</th>
                <th className="pb-2">Ganados</th>
                <th className="pb-2">Ventas</th>
                <th className="pb-2">Conv.</th>
              </tr>
            </thead>
            <tbody>
              {(dash?.leaderboard ?? []).map((l, i) => (
                <tr
                  key={l.userId}
                  className="border-t border-[var(--fl-border)]"
                >
                  <td className="py-2 font-mono">{i + 1}</td>
                  <td className="py-2 text-[var(--fl-text)]">{l.name}</td>
                  <td className="py-2 font-mono">{l.openDeals}</td>
                  <td className="py-2 font-mono">{l.wonDeals}</td>
                  <td className="py-2 font-mono text-[var(--fl-amber)]">
                    {money(l.wonValue)}
                  </td>
                  <td className="py-2 font-mono">{l.conversionRate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-5">
          <h2 className="text-sm font-semibold text-[var(--fl-text)]">
            Pipeline agregado · Forecast
          </h2>
          <p className="mt-2 font-mono text-2xl text-[var(--fl-accent)]">
            {money(dash?.forecast.weightedMonthlyCop ?? 0)}
          </p>
          <p className="text-xs text-[var(--fl-subtext)]">
            Proyección ponderada · {dash?.forecast.openDeals ?? 0} abiertos
          </p>
          <div className="mt-4 space-y-2">
            {Object.entries(dash?.funnel ?? {}).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2 text-xs">
                <span className="w-36 truncate text-[var(--fl-subtext)]">
                  {k.replace(/_/g, " ")}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded bg-[var(--fl-canvas)]">
                  <div
                    className="h-full bg-[var(--fl-accent)]"
                    style={{
                      width: `${funnelTotal ? (v / funnelTotal) * 100 : 0}%`,
                    }}
                  />
                </div>
                <span className="font-mono w-6 text-right">{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-5">
          <h2 className="text-sm font-semibold text-[var(--fl-text)]">
            Aprobación descuentos (Nivel 1)
          </h2>
          <ul className="space-y-2 text-sm">
            {(dash?.pendingDiscounts ?? []).map((q) => (
              <li
                key={q.id}
                className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-[var(--fl-border)] bg-[var(--fl-canvas)] px-3 py-2"
                onClick={() => setQuoteId(q.id)}
              >
                <div>
                  <p className="text-[var(--fl-text)]">{q.deal.accountName}</p>
                  <p className="font-mono text-[10px] text-[var(--fl-subtext)]">
                    {q.deal.code} · dcto {q.discountPct}%
                  </p>
                </div>
                <Badge tone={q.ebitdaImpactPct < -2 ? "rose" : "amber"}>
                  EBITDA {q.ebitdaImpactPct}%
                </Badge>
              </li>
            ))}
            {(dash?.pendingDiscounts ?? []).length === 0 && (
              <li className="text-xs text-[var(--fl-subtext)]">
                Sin solicitudes pendientes
              </li>
            )}
          </ul>
          <label className="block text-xs text-[var(--fl-subtext)]">
            Condición: años de contrato
            <input
              className="mt-1 w-24 rounded-lg border border-[var(--fl-border)] bg-[var(--fl-canvas)] px-2 py-1 font-mono"
              value={years}
              onChange={(e) => setYears(e.target.value)}
            />
          </label>
          <div className="flex gap-2">
            <Button disabled={busy} onClick={() => void aprobar(true)}>
              Aprobar condicionado
            </Button>
            <Button disabled={busy} onClick={() => void aprobar(false)}>
              Rechazar
            </Button>
          </div>
        </div>
      </section>

      <section
        id="secop"
        className="space-y-3 rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-5"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-sm font-semibold text-[var(--fl-text)]">
            Bidding Tracker SECOP · Gantt
          </h2>
          <div className="flex flex-wrap gap-2">
            <input
              className="rounded-lg border border-[var(--fl-border)] bg-[var(--fl-canvas)] px-2 py-1 text-sm"
              placeholder="Título proceso"
              value={bidTitle}
              onChange={(e) => setBidTitle(e.target.value)}
            />
            <input
              className="rounded-lg border border-[var(--fl-border)] bg-[var(--fl-canvas)] px-2 py-1 text-sm"
              placeholder="Entidad"
              value={bidEntity}
              onChange={(e) => setBidEntity(e.target.value)}
            />
            <Button disabled={busy} onClick={() => void crearBid()}>
              Crear proyecto
            </Button>
          </div>
        </div>
        {(dash?.bidding ?? []).map((b) => (
          <div
            key={b.id}
            className="rounded-lg border border-[var(--fl-border)] bg-[var(--fl-canvas)] p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm text-[var(--fl-text)]">{b.title}</p>
                <p className="font-mono text-[10px] text-[var(--fl-subtext)]">
                  {b.code} · {b.entityName}
                </p>
              </div>
              <Badge tone={b.daysToClose <= 7 ? "rose" : "amber"}>
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
                    ? Math.min(100, Math.max(0, ((due - start) / (end - start)) * 100))
                    : 50;
                return (
                  <div key={t.id} className="text-xs">
                    <div className="mb-1 flex justify-between text-[var(--fl-subtext)]">
                      <span>
                        {t.department}: {t.title}
                      </span>
                      <span className="font-mono">{t.status}</span>
                    </div>
                    <div className="relative h-2 rounded bg-[var(--fl-surface)]">
                      <div
                        className="absolute top-0 h-2 w-2 rounded-full bg-[var(--fl-accent)]"
                        style={{ left: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {(dash?.bidding ?? []).length === 0 && (
          <p className="text-xs text-[var(--fl-subtext)]">
            Sin proyectos de licitación activos
          </p>
        )}
      </section>

      <section
        id="sla"
        className="rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-5"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[var(--fl-text)]">
            SLA Ventas ({dash?.limits.slaHours ?? 2}h) · Round-Robin
          </h2>
          <Button disabled={busy} onClick={() => void roundRobin()}>
            Distribuir / Reasignar
          </Button>
        </div>
        <ul className="mt-3 space-y-2">
          {(dash?.slaAlerts ?? []).map((a) => (
            <li
              key={a.dealId}
              className="flex items-center justify-between rounded-lg border border-[var(--fl-border)] bg-[var(--fl-canvas)] px-3 py-2 text-sm"
            >
              <div>
                <p className="text-[var(--fl-text)]">{a.accountName}</p>
                <p className="font-mono text-[10px] text-[var(--fl-subtext)]">
                  {a.code} · {a.hoursElapsed}h
                </p>
              </div>
              <Badge tone={a.slaStatus === "RED" ? "rose" : "amber"}>
                {a.slaStatus}
              </Badge>
            </li>
          ))}
          {(dash?.slaAlerts ?? []).length === 0 && (
            <li className="text-xs text-[var(--fl-subtext)]">
              SLA nominal — sin alertas
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
