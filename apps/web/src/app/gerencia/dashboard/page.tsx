"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { GERENTE_DEMO_EXECUTIVE_PIN } from "@fsg/shared";
import { api } from "@/lib/api";
import { HowToBox, PageIntro } from "@/components/page-intro";

type Approval = {
  id: string;
  code: string;
  kind: string;
  title: string;
  amountCop: number;
  cashflowImpactCop: number;
};

type Override = {
  id: string;
  code: string;
  title: string;
  penaltyCostCop: number;
  vipNetGainCop: number;
};

type Scorecard = {
  crossKpis: {
    salesVsFleetMaintenance: Array<{ label: string; value: number }>;
  };
  bottlenecks: Array<{
    area: string;
    severity: string;
    message: string;
    warRoomHint: string;
  }>;
  riskRadar: {
    vipNps: number;
    vipLight: string;
    ministryAuditLight: string;
    message: string;
  };
  perspectives: {
    financial: { pendingApprovals: number };
    customer: { wonDeals: number; openDeals: number; vipNps: number };
    internalProcess: { tripsInFlight: number; openWorkOrders: number };
  };
};

type Dash = {
  scorecard: Scorecard;
  approvalsInbox: Approval[];
  pendingOverrides: Override[];
  commandDirectory: Array<{
    role: string;
    name: string;
    channel: string;
    video: string;
  }>;
  riskRadar: Scorecard["riskRadar"];
};

function money(n: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

function lightTone(light: string): "emerald" | "amber" | "rose" | "slate" {
  if (light === "GREEN") return "emerald";
  if (light === "AMBER") return "amber";
  if (light === "RED") return "rose";
  return "slate";
}

export default function GerenciaDashboardPage() {
  const [dash, setDash] = useState<Dash | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [selectedApproval, setSelectedApproval] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await api.get<Dash>("/api/v1/gerencia/dashboard");
      setDash(data);
      if (data.approvalsInbox[0]) {
        setSelectedApproval(data.approvalsInbox[0].id);
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Uplink fallido");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function firmar() {
    if (!selectedApproval) {
      setError("Selecciona una aprobación");
      return;
    }
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const res = await api.post<{ status: string; message: string }>(
        "/api/v1/gerencia/aprobaciones/firmar-pin",
        {
          approvalId: selectedApproval,
          pin: pin || undefined,
          approve: true,
        },
      );
      setMsg(`${res.status}: ${res.message}`);
      setPin("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Firma fallida — verifique PIN");
    } finally {
      setBusy(false);
    }
  }

  async function resolverOverride(overrideId: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.post<{ status: string; message: string }>(
        "/api/v1/gerencia/override-gerencial/resolver",
        {
          overrideId,
          autoPickOptimal: true,
          scenarios: [
            {
              id: "pay-penalty",
              label: "Pagar penalidad y cumplir VIP",
              penaltyCostCop: 2_000_000,
              vipNetGainCop: 8_500_000,
              itineraryPatch: { priority: "VIP", slot: "PM" },
            },
            {
              id: "cancel",
              label: "Cancelar servicio VIP",
              penaltyCostCop: 0,
              vipNetGainCop: 0,
            },
            {
              id: "reroute",
              label: "Reasignar itinerario",
              penaltyCostCop: 800_000,
              vipNetGainCop: 7_200_000,
              itineraryPatch: { reassign: true },
            },
          ],
        },
      );
      setMsg(`${res.status}: ${res.message}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Override fallido");
    } finally {
      setBusy(false);
    }
  }

  const salesBar =
    dash?.scorecard.crossKpis.salesVsFleetMaintenance[0]?.value ?? 0;
  const maintBar =
    dash?.scorecard.crossKpis.salesVsFleetMaintenance[1]?.value ?? 0;
  const maxBar = Math.max(salesBar, maintBar, 1);

  return (
    <div className="space-y-8">
      <PageIntro module="gerencia" title="Puente de Decisiones" />

      <HowToBox
        steps={[
          "Balance Scorecard cruza Ventas, Operaciones y Finanzas en tiempo real.",
          "Overrides: el árbitro elige el trade-off óptimo (penalidad vs ganancia VIP).",
          `Firma ejecutiva exige PIN de ${GERENTE_DEMO_EXECUTIVE_PIN.length} dígitos (demo: ${GERENTE_DEMO_EXECUTIVE_PIN}).`,
        ]}
      />

      {error && (
        <p className="font-mono text-sm text-[var(--fl-critical)]">{error}</p>
      )}
      {msg && (
        <p className="font-mono text-sm text-[var(--fl-accent)]">{msg}</p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Top Left — Aprobaciones */}
        <section
          id="aprobaciones"
          className="space-y-3 rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-5 lg:col-span-1"
        >
          <h2 className="text-sm font-semibold text-[var(--fl-text)]">
            Bandeja de aprobaciones
          </h2>
          <ul className="space-y-2">
            {(dash?.approvalsInbox ?? []).map((a) => (
              <li
                key={a.id}
                onClick={() => setSelectedApproval(a.id)}
                className={`cursor-pointer rounded-lg border px-3 py-2 text-sm ${
                  selectedApproval === a.id
                    ? "border-[var(--fl-accent)] bg-[var(--fl-canvas)]"
                    : "border-[var(--fl-border)] bg-[var(--fl-canvas)]"
                }`}
              >
                <p className="text-[var(--fl-text)]">{a.title}</p>
                <p className="font-mono text-[10px] text-[var(--fl-subtext)]">
                  {a.code} · {a.kind}
                </p>
                <p className="mt-1 font-mono text-xs text-[var(--fl-amber)]">
                  {money(a.amountCop)} · CF {money(a.cashflowImpactCop)}
                </p>
              </li>
            ))}
            {(dash?.approvalsInbox ?? []).length === 0 && (
              <li className="text-xs text-[var(--fl-subtext)]">
                Inbox vacío
              </li>
            )}
          </ul>
          <label className="block text-xs text-[var(--fl-subtext)]">
            PIN de seguridad
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              className="mt-1 w-full rounded-lg border border-[var(--fl-border)] bg-[var(--fl-canvas)] px-3 py-2 font-mono text-sm tracking-widest"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••••"
            />
          </label>
          <Button disabled={busy} onClick={() => void firmar()}>
            Firmar con PIN
          </Button>
        </section>

        {/* Centro — KPIs cruzados */}
        <section
          id="scorecard"
          className="space-y-3 rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-5 lg:col-span-1"
        >
          <h2 className="text-sm font-semibold text-[var(--fl-text)]">
            KPIs cruzados
          </h2>
          <p className="text-xs text-[var(--fl-subtext)]">
            Crecimiento de Ventas vs. Mantenimiento de Flota
          </p>
          <div className="space-y-3">
            {(dash?.scorecard.crossKpis.salesVsFleetMaintenance ?? []).map(
              (k) => (
                <div key={k.label}>
                  <div className="mb-1 flex justify-between text-xs text-[var(--fl-subtext)]">
                    <span>{k.label}</span>
                    <span className="font-mono">{k.value}</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded bg-[var(--fl-canvas)]">
                    <div
                      className="h-full bg-[var(--fl-accent)]"
                      style={{ width: `${(k.value / maxBar) * 100}%` }}
                    />
                  </div>
                </div>
              ),
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 pt-2 text-xs">
            <div className="rounded-lg border border-[var(--fl-border)] p-2">
              <p className="text-[var(--fl-subtext)]">Viajes</p>
              <p className="font-mono text-lg text-[var(--fl-text)]">
                {dash?.scorecard.perspectives.internalProcess.tripsInFlight ?? 0}
              </p>
            </div>
            <div className="rounded-lg border border-[var(--fl-border)] p-2">
              <p className="text-[var(--fl-subtext)]">OT Taller</p>
              <p className="font-mono text-lg text-[var(--fl-amber)]">
                {dash?.scorecard.perspectives.internalProcess.openWorkOrders ?? 0}
              </p>
            </div>
            <div className="rounded-lg border border-[var(--fl-border)] p-2">
              <p className="text-[var(--fl-subtext)]">Deals abiertos</p>
              <p className="font-mono text-lg text-[var(--fl-text)]">
                {dash?.scorecard.perspectives.customer.openDeals ?? 0}
              </p>
            </div>
            <div className="rounded-lg border border-[var(--fl-border)] p-2">
              <p className="text-[var(--fl-subtext)]">Ganados</p>
              <p className="font-mono text-lg text-[var(--fl-accent)]">
                {dash?.scorecard.perspectives.customer.wonDeals ?? 0}
              </p>
            </div>
          </div>
          {(dash?.scorecard.bottlenecks ?? []).length > 0 && (
            <ul className="space-y-1 pt-2">
              {dash!.scorecard.bottlenecks.map((b) => (
                <li
                  key={b.area + b.message}
                  className="rounded border border-[var(--fl-border)] px-2 py-1 text-xs"
                >
                  <Badge tone={b.severity === "RED" ? "rose" : "amber"}>
                    {b.area}
                  </Badge>{" "}
                  {b.message}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Radar */}
        <section className="space-y-3 rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-5 lg:col-span-1">
          <h2 className="text-sm font-semibold text-[var(--fl-text)]">
            Radar satisfacción y riesgo
          </h2>
          <div className="flex flex-wrap gap-3">
            <div className="rounded-lg border border-[var(--fl-border)] p-3">
              <p className="text-xs text-[var(--fl-subtext)]">NPS VIP</p>
              <p className="font-mono text-2xl text-[var(--fl-text)]">
                {dash?.riskRadar.vipNps ?? "—"}
              </p>
              <Badge tone={lightTone(dash?.riskRadar.vipLight ?? "")}>
                {dash?.riskRadar.vipLight ?? "—"}
              </Badge>
            </div>
            <div className="rounded-lg border border-[var(--fl-border)] p-3">
              <p className="text-xs text-[var(--fl-subtext)]">Min. Transporte</p>
              <Badge
                tone={lightTone(dash?.riskRadar.ministryAuditLight ?? "")}
              >
                {dash?.riskRadar.ministryAuditLight ?? "—"}
              </Badge>
              <p className="mt-2 text-xs text-[var(--fl-subtext)]">
                {dash?.riskRadar.message}
              </p>
            </div>
          </div>

          <h3 className="pt-2 text-xs font-semibold uppercase tracking-wider text-[var(--fl-subtext)]">
            Overrides pendientes
          </h3>
          <ul className="space-y-2">
            {(dash?.pendingOverrides ?? []).map((o) => (
              <li
                key={o.id}
                className="rounded-lg border border-[var(--fl-border)] bg-[var(--fl-canvas)] p-2 text-sm"
              >
                <p className="text-[var(--fl-text)]">{o.title}</p>
                <p className="font-mono text-[10px] text-[var(--fl-subtext)]">
                  {o.code}
                </p>
                <Button
                  disabled={busy}
                  onClick={() => void resolverOverride(o.id)}
                >
                  Resolver óptimo
                </Button>
              </li>
            ))}
            {(dash?.pendingOverrides ?? []).length === 0 && (
              <li className="text-xs text-[var(--fl-subtext)]">
                Sin conflictos en cola
              </li>
            )}
          </ul>
        </section>
      </div>

      <section
        id="comando"
        className="rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-5"
      >
        <h2 className="text-sm font-semibold text-[var(--fl-text)]">
          Directorio de Comando · War Room
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(dash?.commandDirectory ?? []).map((d) => (
            <div
              key={d.role}
              className="rounded-lg border border-[var(--fl-border)] bg-[var(--fl-canvas)] p-3"
            >
              <p className="text-sm text-[var(--fl-text)]">{d.name}</p>
              <p className="font-mono text-[10px] text-[var(--fl-subtext)]">
                {d.role}
              </p>
              <p className="mt-2 text-xs text-[var(--fl-accent)]">{d.channel}</p>
              <p className="text-xs text-[var(--fl-subtext)]">{d.video}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
