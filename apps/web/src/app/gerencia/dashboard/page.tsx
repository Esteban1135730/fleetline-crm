"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { GERENTE_DEMO_EXECUTIVE_PIN } from "@fsg/shared";
import Link from "next/link";
import { Map, Wrench, Wallet, ShieldAlert, Clock } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { api } from "@/lib/api";
import { KpiCard } from "@/components/audit";
import { PageIntro } from "@/components/page-intro";

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

type TacticalPanel = {
  kpis: {
    tripsInFlight: number;
    openWorkOrders: number;
    delayedWorkOrders: number;
    cxcOpenMillions: number;
    cxpOpenMillions: number;
    dispatchBlocks: number;
  };
  hourlyActivity: Array<{ hora: string; viajes: number }>;
  fleetByType: Array<{
    tipo: string;
    operativo: number;
    taller: number;
    bloqueado: number;
  }>;
  cashAging: Array<{ rango: string; cxc: number; cxp: number }>;
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
  tacticalPanel?: TacticalPanel;
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
      setError(e instanceof Error ? e.message : "Conexión fallida");
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
      setError(e instanceof Error ? e.message : "Excepción fallida");
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
      <PageIntro module="gerencia" title="Tablero de Gerencia General" />

      {error && (
        <p className="font-mono text-sm text-[var(--fl-critical)]">{error}</p>
      )}
      {msg && (
        <p className="font-mono text-sm text-[var(--fl-accent)]">{msg}</p>
      )}

      {dash?.tacticalPanel ? (
        <>
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Viajes en curso"
              value={dash.tacticalPanel.kpis.tripsInFlight}
              delta="Telemetría en vivo"
              tone="ok"
              icon={<Map />}
            />
            <KpiCard
              label="OT abiertas (Taller)"
              value={dash.tacticalPanel.kpis.openWorkOrders}
              delta={
                dash.tacticalPanel.kpis.delayedWorkOrders > 0
                  ? `${dash.tacticalPanel.kpis.delayedWorkOrders} con retraso de entrega`
                  : "Sin retrasos críticos"
              }
              tone={
                dash.tacticalPanel.kpis.delayedWorkOrders > 0 ? "warn" : "neutral"
              }
              icon={<Wrench />}
            />
            <KpiCard
              label="CxC / CxP"
              value={`$${dash.tacticalPanel.kpis.cxcOpenMillions}M / $${dash.tacticalPanel.kpis.cxpOpenMillions}M`}
              delta="Liquidez inmediata abierta"
              tone="neutral"
              icon={<Wallet />}
            />
            <KpiCard
              label="Bloqueos despacho"
              value={dash.tacticalPanel.kpis.dispatchBlocks}
              delta="Trámites · SARLAFT · FUEC"
              tone={dash.tacticalPanel.kpis.dispatchBlocks > 0 ? "danger" : "ok"}
              icon={<ShieldAlert />}
            />
          </section>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-4">
              <h3 className="mb-3 text-sm font-semibold">Picos de operación</h3>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dash.tacticalPanel.hourlyActivity}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="hora" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={32} />
                    <Tooltip />
                    <Bar dataKey="viajes" name="Viajes activos" fill="#0D9488" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-4">
              <h3 className="mb-3 text-sm font-semibold">Disponibilidad de flota</h3>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dash.tacticalPanel.fleetByType}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="tipo" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={32} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="operativo" stackId="a" name="Operativo" fill="#10B981" />
                    <Bar dataKey="taller" stackId="a" name="Taller" fill="#D97706" />
                    <Bar dataKey="bloqueado" stackId="a" name="Bloqueado" fill="#DC2626" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-4">
              <h3 className="mb-3 text-sm font-semibold">Flujo de caja a corto plazo</h3>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dash.tacticalPanel.cashAging}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="rango" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} width={32} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="cxc" name="Por cobrar (M)" fill="#10B981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="cxp" name="Por pagar (M)" fill="#64748B" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Cuellos de botella</h3>
                <Link href="/logistica/servicios">
                  <Button variant="primary" className="w-auto px-3 py-1.5 text-xs">
                    Resolver bloqueos
                  </Button>
                </Link>
              </div>
              {(dash.scorecard.bottlenecks ?? []).length > 0 ? (
                <ul className="space-y-2">
                  {dash.scorecard.bottlenecks.map((b) => (
                    <li
                      key={b.area + b.message}
                      className="rounded-lg border border-[var(--fl-border)] px-3 py-2 text-sm"
                    >
                      <Badge tone={b.severity === "RED" ? "rose" : "amber"}>
                        {b.area}
                      </Badge>
                      <p className="mt-1 text-[var(--fl-text)]">{b.message}</p>
                      <p className="mt-1 text-xs text-[var(--fl-subtext)]">
                        {b.warRoomHint}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[var(--fl-subtext)]">
                  Sin cuellos de botella detectados — operación fluida.
                </p>
              )}
            </section>
          </div>
        </>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" className="w-auto px-4 py-2">
          <Clock className="mr-1.5 inline h-4 w-4" aria-hidden />
          Reporte de turno
        </Button>
      </div>

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
              <p className="text-[var(--fl-subtext)]">Oportunidades abiertas</p>
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
              <p className="text-xs text-[var(--fl-subtext)]">Satisfacción VIP</p>
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
          Directorio de comando · Sala de crisis
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
