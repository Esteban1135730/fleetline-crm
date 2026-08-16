"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { HARD_RULES } from "@fsg/shared";
import { api } from "@/lib/api";
import { HowToBox, PageIntro } from "@/components/page-intro";

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
  { key: "REUNION_AGENDADA", label: "Reunión Agendada" },
  { key: "COTIZACION_ENVIADA", label: "Cotización Enviada" },
  { key: "EN_NEGOCIACION", label: "En Negociación" },
  { key: "CERRADO_GANADO", label: "Cerrado Ganado" },
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
        accountName: accountName || "Cuenta empresas demo",
        zone,
        vehicleType: "BUS",
        distanceKm: 45,
        proposedRatePerKm: Number(rate) || undefined,
        discountPct: Number(discount) || 0,
        estimatedMonthlyValue: 22_000_000,
      });
      setMsg(`${res.status}: ${res.message}`);
      if (res.dealId) setSignDealId(res.dealId);
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
    <div className="space-y-8">
      <PageIntro
        module="comercial"
        title="Centro de Comando de Conversión"
      />

      <HowToBox
        steps={[
          "Cotiza con costo real $/km (taller + combustible + salario zona).",
          `Margen < ${HARD_RULES.COMERCIAL_MIN_MARGIN_PCT}% escala a CFO antes del PDF.`,
          "Firma electrónica → Cerrado ganado crea centro de costos, capacidad y facturación.",
        ]}
      />

      {error && (
        <p className="font-mono text-sm text-[var(--fl-critical)]">{error}</p>
      )}
      {msg && (
        <p className="font-mono text-sm text-[var(--fl-accent)]">{msg}</p>
      )}

      {/* Velocímetro de cuota */}
      <section className="rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-6">
        <h2 className="text-sm font-semibold tracking-wide text-[var(--fl-text)]">
          Velocímetro de cuota mensual
        </h2>
        <div className="mt-4 flex flex-wrap items-end gap-8">
          <div className="relative h-28 w-56 overflow-hidden">
            <div
              className="absolute bottom-0 left-1/2 h-24 w-24 -translate-x-1/2 rounded-t-full border-[10px] border-b-0 border-[var(--fl-border)]"
              style={{
                borderTopColor: "var(--fl-accent)",
                borderLeftColor: "var(--fl-accent)",
                borderRightColor: "rgba(148,163,184,0.25)",
              }}
            />
            <div
              className="absolute bottom-0 left-1/2 h-20 w-1 origin-bottom bg-[var(--fl-amber)]"
              style={{ transform: `translateX(-50%) rotate(${gaugeRotation}deg)` }}
            />
            <p className="absolute bottom-1 left-0 right-0 text-center font-mono text-2xl text-[var(--fl-text)]">
              {quotaPct}%
            </p>
          </div>
          <div className="space-y-1 text-sm text-[var(--fl-subtext)]">
            <p>
              Ganado:{" "}
              <span className="font-mono text-[var(--fl-text)]">
                {money(dash?.metrics.wonMonthlyCop ?? 0)}
              </span>
            </p>
            <p>
              Cuota:{" "}
              <span className="font-mono text-[var(--fl-text)]">
                {money(dash?.metrics.quotaCop ?? HARD_RULES.COMERCIAL_MONTHLY_QUOTA_COP)}
              </span>
            </p>
            <p>
              Abiertos:{" "}
              <span className="font-mono">{dash?.metrics.openDeals ?? 0}</span>
              {" · "}
              Ganados:{" "}
              <span className="font-mono">{dash?.metrics.wonDeals ?? 0}</span>
            </p>
          </div>
        </div>
      </section>

      {/* Pipeline Kanban */}
      <section id="pipeline" className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--fl-text)]">
          Embudo de ventas
        </h2>
        <div className="grid gap-3 overflow-x-auto md:grid-cols-5">
          {STAGES.map((col) => (
            <div
              key={col.key}
              className="min-w-[160px] rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-3"
            >
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--fl-subtext)]">
                {col.label}
              </p>
              <div className="space-y-2">
                {(dash?.kanban?.[col.key] ?? []).map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setSignDealId(d.id)}
                    className="w-full rounded-lg border border-[var(--fl-border)] bg-[var(--fl-canvas)] p-2 text-left transition hover:border-[var(--fl-accent)]"
                  >
                    <p className="truncate text-sm text-[var(--fl-text)]">
                      {d.accountName}
                    </p>
                    <p className="font-mono text-[10px] text-[var(--fl-subtext)]">
                      {d.code}
                    </p>
                    <p className="mt-1 font-mono text-xs text-[var(--fl-amber)]">
                      {money(Number(d.estimatedMonthlyValue))}
                    </p>
                  </button>
                ))}
                {(dash?.kanban?.[col.key] ?? []).length === 0 && (
                  <p className="text-xs text-[var(--fl-subtext)]">Sin oportunidades</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Cotizador + DocuSign */}
      <section
        id="cotizador"
        className="grid gap-4 rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-6 lg:grid-cols-2"
      >
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-[var(--fl-text)]">
            Cotizador Inteligente
          </h2>
          <label className="block text-xs text-[var(--fl-subtext)]">
            Cuenta
            <input
              className="mt-1 w-full rounded-lg border border-[var(--fl-border)] bg-[var(--fl-canvas)] px-3 py-2 text-sm text-[var(--fl-text)]"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="Colegio / Empresa"
            />
          </label>
          <div className="grid grid-cols-3 gap-2">
            <label className="block text-xs text-[var(--fl-subtext)]">
              Zona
              <select
                className="mt-1 w-full rounded-lg border border-[var(--fl-border)] bg-[var(--fl-canvas)] px-2 py-2 text-sm"
                value={zone}
                onChange={(e) => setZone(e.target.value)}
              >
                <option value="BOGOTA">Bogotá</option>
                <option value="MEDELLIN">Medellín</option>
                <option value="CALI">Cali</option>
                <option value="BARRANQUILLA">Barranquilla</option>
              </select>
            </label>
            <label className="block text-xs text-[var(--fl-subtext)]">
              Tarifa $/km
              <input
                className="mt-1 w-full rounded-lg border border-[var(--fl-border)] bg-[var(--fl-canvas)] px-2 py-2 font-mono text-sm"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
            </label>
            <label className="block text-xs text-[var(--fl-subtext)]">
              Dcto %
              <input
                className="mt-1 w-full rounded-lg border border-[var(--fl-border)] bg-[var(--fl-canvas)] px-2 py-2 font-mono text-sm"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
            </label>
          </div>
          <Button disabled={busy} onClick={() => void runCotizar()}>
            Generar cotización
          </Button>
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-[var(--fl-text)]">
            Firma electrónica — Pase de relevo
          </h2>
          <label className="block text-xs text-[var(--fl-subtext)]">
            ID de oportunidad
            <input
              className="mt-1 w-full rounded-lg border border-[var(--fl-border)] bg-[var(--fl-canvas)] px-3 py-2 font-mono text-sm"
              value={signDealId}
              onChange={(e) => setSignDealId(e.target.value)}
              placeholder="Selecciona del tablero o cotiza"
            />
          </label>
          <label className="block text-xs text-[var(--fl-subtext)]">
            Correo del firmante
            <input
              className="mt-1 w-full rounded-lg border border-[var(--fl-border)] bg-[var(--fl-canvas)] px-3 py-2 text-sm"
              value={signerEmail}
              onChange={(e) => setSignerEmail(e.target.value)}
              placeholder="legal@cliente.com"
            />
          </label>
          <Button disabled={busy} onClick={() => void runFirmar()}>
            Enviar a firma y cerrar ganado
          </Button>
        </div>
      </section>

      {/* Insights */}
      <section
        id="renovaciones"
        className="grid gap-4 lg:grid-cols-2"
      >
        <div className="rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-5">
          <h2 className="text-sm font-semibold text-[var(--fl-text)]">
            Cuentas clave
          </h2>
          <ul className="mt-3 space-y-2">
            {(dash?.keyAccounts ?? []).map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-2 border-b border-[var(--fl-border)] pb-2 text-sm last:border-0"
              >
                <div>
                  <p className="text-[var(--fl-text)]">{a.accountName}</p>
                  <p className="font-mono text-[10px] text-[var(--fl-subtext)]">
                    {a.code}
                  </p>
                </div>
                <Badge tone="slate">{a.stage.replace(/_/g, " ")}</Badge>
              </li>
            ))}
            {(dash?.keyAccounts ?? []).length === 0 && (
              <li className="text-xs text-[var(--fl-subtext)]">
                Sin cuentas en negociación / ganado
              </li>
            )}
          </ul>
        </div>

        <div className="rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-5">
          <h2 className="text-sm font-semibold text-[var(--fl-text)]">
            Radar renovaciones ({HARD_RULES.COMERCIAL_RENEWAL_RADAR_DAYS}d)
          </h2>
          <ul className="mt-3 space-y-3">
            {(dash?.renewals ?? []).map((r) => (
              <li
                key={r.contractId}
                className="rounded-lg border border-[var(--fl-border)] bg-[var(--fl-canvas)] p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm text-[var(--fl-text)]">
                      {r.accountName}
                    </p>
                    <p className="font-mono text-[10px] text-[var(--fl-subtext)]">
                      {r.code} · {r.daysLeft}d
                    </p>
                  </div>
                  <Badge tone="amber">+{r.suggestedUpliftPct}%</Badge>
                </div>
                <p className="mt-1 font-mono text-xs text-[var(--fl-subtext)]">
                  Satisfacción {r.npsScore} · Cartera {r.portfolioCompliancePct}% ·{" "}
                  {money(r.monthlyValue)}
                </p>
                {r.task && (
                  <p className="mt-1 text-xs text-[var(--fl-accent)]">{r.task}</p>
                )}
              </li>
            ))}
            {(dash?.renewals ?? []).length === 0 && (
              <li className="text-xs text-[var(--fl-subtext)]">
                Sin vencimientos en horizonte 90 días
              </li>
            )}
          </ul>
        </div>
      </section>
    </div>
  );
}
