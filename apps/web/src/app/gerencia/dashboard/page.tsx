"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button } from "@fsg/ui";
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
import { BentoPanel } from "@/components/nexa/bento-panel";
import { NexaTable, NexaRow, NexaCell } from "@/components/nexa/nexa-table";
import { StatusPulseBadge } from "@/components/audit/KpiCard";
import { useThemeColors } from "@/lib/use-theme-colors";

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
  cashAgingSource?: "invoices" | "trip_fares";
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

function lightTone(light: string): "success" | "warning" | "danger" | "info" {
  if (light === "GREEN") return "success";
  if (light === "AMBER") return "warning";
  if (light === "RED") return "danger";
  return "info";
}

export default function GerenciaDashboardPage() {
  const colors = useThemeColors();
  const [dash, setDash] = useState<Dash | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [selectedApproval, setSelectedApproval] = useState("");

  const chartTipStyle = useMemo(
    () => ({
      borderRadius: 12,
      border: `1px solid ${colors.border}`,
      background: colors.surface,
      color: colors.textPrimary,
      fontSize: 12,
    }),
    [colors],
  );

  const [period, setPeriod] = useState<"day" | "week" | "month" | "year">(
    "week",
  );

  const load = useCallback(async () => {
    try {
      const data = await api.get<Dash>(
        `/api/v1/gerencia/dashboard?period=${period}`,
      );
      setDash(data);
      if (data.approvalsInbox[0]) {
        setSelectedApproval(data.approvalsInbox[0].id);
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Conexión fallida");
    }
  }, [period]);

  useEffect(() => {
    void load();
  }, [load]);

  async function firmar(approve = true) {
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
          approve,
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
    <div className="fade-in space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-border pb-4">
        <div>
          <p className="font-data text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-primary">
            Gerencia General
          </p>
          <h1 className="font-sans text-2xl font-semibold tracking-tight text-brand-text-primary md:text-3xl">
            Tablero táctico
          </h1>
          <p className="mt-1 font-sans text-sm text-brand-text-secondary">
            Centro de mando operativo · KPIs cruzados y bandeja de firmas
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ["day", "Día"],
              ["week", "Semana"],
              ["month", "Mes"],
              ["year", "Año"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`flt-nav-item !inline-flex !w-auto px-3 py-1.5 text-xs ${period === id ? "is-active" : ""}`}
              onClick={() => setPeriod(id)}
            >
              {label}
            </button>
          ))}
          <Button variant="ghost" className="w-auto px-4 py-2">
            <Clock className="mr-1.5 inline h-4 w-4" aria-hidden />
            Reporte de turno
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
                  ? `${dash.tacticalPanel.kpis.delayedWorkOrders} con retraso`
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

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 lg:gap-4">
            <BentoPanel
              title="Picos de operación"
              subtitle="Viajes activos por franja"
              className="lg:col-span-6"
            >
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dash.tacticalPanel.hourlyActivity}>
                    <CartesianGrid strokeDasharray="3 3" stroke={colors.chartGrid} />
                    <XAxis
                      dataKey="hora"
                      tick={{ fill: colors.textSecondary, fontSize: 11 }}
                    />
                    <YAxis tick={{ fill: colors.textSecondary, fontSize: 11 }} width={32} />
                    <Tooltip contentStyle={chartTipStyle} />
                    <Bar
                      dataKey="viajes"
                      name="Viajes activos"
                      fill={colors.secondary}
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </BentoPanel>

            <BentoPanel
              title="Disponibilidad de flota"
              subtitle="Operativo · taller · bloqueado"
              className="lg:col-span-6"
            >
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dash.tacticalPanel.fleetByType}>
                    <CartesianGrid strokeDasharray="3 3" stroke={colors.chartGrid} />
                    <XAxis
                      dataKey="tipo"
                      tick={{ fill: colors.textSecondary, fontSize: 11 }}
                    />
                    <YAxis tick={{ fill: colors.textSecondary, fontSize: 11 }} width={32} />
                    <Tooltip contentStyle={chartTipStyle} />
                    <Legend />
                    <Bar dataKey="operativo" stackId="a" name="Operativo" fill={colors.success} />
                    <Bar dataKey="taller" stackId="a" name="Taller" fill={colors.warning} />
                    <Bar dataKey="bloqueado" stackId="a" name="Bloqueado" fill={colors.danger} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </BentoPanel>

            <BentoPanel
              title="Flujo de caja a corto plazo"
              subtitle={
                dash.tacticalPanel.cashAgingSource === "trip_fares"
                  ? "Estimación por tarifas de viaje"
                  : "Aging por facturas abiertas"
              }
              className="lg:col-span-6"
            >
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dash.tacticalPanel.cashAging}>
                    <CartesianGrid strokeDasharray="3 3" stroke={colors.chartGrid} />
                    <XAxis
                      dataKey="rango"
                      tick={{ fill: colors.textSecondary, fontSize: 10 }}
                    />
                    <YAxis tick={{ fill: colors.textSecondary, fontSize: 11 }} width={32} />
                    <Tooltip contentStyle={chartTipStyle} />
                    <Legend />
                    <Bar dataKey="cxc" name="Por cobrar (M)" fill={colors.success} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="cxp" name="Por pagar (M)" fill={colors.chartMuted} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </BentoPanel>

            <BentoPanel
              title="Cuellos de botella"
              action={
                <Link href="/logistica/servicios">
                  <Button variant="primary" className="w-auto px-3 py-1.5 text-xs">
                    Resolver
                  </Button>
                </Link>
              }
              className="lg:col-span-6"
            >
              {(dash.scorecard.bottlenecks ?? []).length > 0 ? (
                <ul className="space-y-2">
                  {dash.scorecard.bottlenecks.map((b) => (
                    <li
                      key={b.area + b.message}
                      className="rounded-lg border border-brand-border px-3 py-2 transition-colors hover:border-brand-border-active hover:bg-brand-surface-hover"
                    >
                      <StatusPulseBadge
                        tone={b.severity === "RED" ? "danger" : "fatiga"}
                      >
                        {b.area}
                      </StatusPulseBadge>
                      <p className="mt-1 font-sans text-sm text-brand-text-primary">
                        {b.message}
                      </p>
                      <p className="mt-1 font-data text-[11px] text-brand-text-secondary">
                        {b.warRoomHint}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="font-sans text-sm text-brand-text-secondary">
                  Sin cuellos de botella — operación fluida.
                </p>
              )}
            </BentoPanel>
          </div>
        </>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-12">
        <BentoPanel
          id="aprobaciones"
          title="Bandeja de aprobaciones"
          subtitle="Firma ejecutiva con PIN"
          className="lg:col-span-5"
        >
          <NexaTable columns={["Concepto", "Código", "Monto", "Impacto CF"]}>
            {(dash?.approvalsInbox ?? []).map((a) => (
              <NexaRow
                key={a.id}
                active={selectedApproval === a.id}
                onClick={() => setSelectedApproval(a.id)}
              >
                <NexaCell>{a.title}</NexaCell>
                <NexaCell mono className="text-brand-text-secondary">
                  {a.code} · {a.kind}
                </NexaCell>
                <NexaCell mono className="text-brand-warning">
                  {money(a.amountCop)}
                </NexaCell>
                <NexaCell mono>{money(a.cashflowImpactCop)}</NexaCell>
              </NexaRow>
            ))}
          </NexaTable>
          {(dash?.approvalsInbox ?? []).length === 0 ? (
            <p className="mt-3 font-data text-xs text-brand-text-secondary">
              Inbox vacío
            </p>
          ) : null}
          <label className="mt-4 block font-data text-[10px] uppercase tracking-[0.12em] text-brand-text-secondary">
            PIN de seguridad (6 dígitos)
            <span className="mt-1 block font-sans text-[11px] normal-case tracking-normal text-brand-text-secondary">
              Autoriza o rechaza la solicitud seleccionada. El PIN es personal
              del gerente (mismo de firma ejecutiva).
            </span>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              className="login-field mt-1 font-data tracking-widest"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••••"
            />
          </label>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Button
              disabled={busy}
              variant="ghost"
              onClick={() => void firmar(false)}
              className="w-auto px-4 py-2"
            >
              Rechazar
            </Button>
            <Button
              disabled={busy}
              onClick={() => void firmar(true)}
              className="w-auto px-4 py-2"
            >
              Firmar con PIN
            </Button>
          </div>
        </BentoPanel>

        <BentoPanel
          id="scorecard"
          title="KPIs cruzados"
          subtitle="Ventas vs mantenimiento de flota"
          className="lg:col-span-4"
        >
          <div className="space-y-3">
            {(dash?.scorecard.crossKpis.salesVsFleetMaintenance ?? []).map(
              (k) => (
                <div key={k.label}>
                  <div className="mb-1 flex justify-between font-data text-xs text-brand-text-secondary">
                    <span>{k.label}</span>
                    <span className="tabular-nums">{k.value}</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded bg-brand-canvas">
                    <div
                      className="h-full bg-brand-primary"
                      style={{ width: `${(k.value / maxBar) * 100}%` }}
                    />
                  </div>
                </div>
              ),
            )}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {[
              {
                label: "Viajes",
                value: dash?.scorecard.perspectives.internalProcess.tripsInFlight ?? 0,
                tone: "text-brand-text-primary",
              },
              {
                label: "OT Taller",
                value: dash?.scorecard.perspectives.internalProcess.openWorkOrders ?? 0,
                tone: "text-brand-warning",
              },
              {
                label: "Oport. abiertas",
                value: dash?.scorecard.perspectives.customer.openDeals ?? 0,
                tone: "text-brand-text-primary",
              },
              {
                label: "Ganados",
                value: dash?.scorecard.perspectives.customer.wonDeals ?? 0,
                tone: "text-brand-primary",
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-lg border border-brand-border bg-brand-canvas p-2 transition-colors hover:border-brand-border-active"
              >
                <p className="font-data text-[10px] uppercase tracking-wider text-brand-text-secondary">
                  {item.label}
                </p>
                <p className={`font-data text-lg tabular-nums ${item.tone}`}>
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        </BentoPanel>

        <BentoPanel
          title="Radar satisfacción y riesgo"
          className="lg:col-span-3"
        >
          <div className="space-y-3">
            <div className="rounded-lg border border-brand-border p-3">
              <p className="font-data text-[10px] uppercase tracking-wider text-brand-text-secondary">
                Satisfacción VIP
              </p>
              <p className="font-data text-2xl tabular-nums text-brand-text-primary">
                {dash?.riskRadar.vipNps ?? "—"}
              </p>
              <Badge tone={lightTone(dash?.riskRadar.vipLight ?? "")}>
                {dash?.riskRadar.vipLight ?? "—"}
              </Badge>
            </div>
            <div className="rounded-lg border border-brand-border p-3">
              <p className="font-data text-[10px] uppercase tracking-wider text-brand-text-secondary">
                Min. Transporte
              </p>
              <Badge tone={lightTone(dash?.riskRadar.ministryAuditLight ?? "")}>
                {dash?.riskRadar.ministryAuditLight ?? "—"}
              </Badge>
              <p className="mt-2 font-sans text-xs text-brand-text-secondary">
                {dash?.riskRadar.message}
              </p>
            </div>
          </div>
          <h3 className="mb-2 mt-4 font-data text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-text-secondary">
            Overrides pendientes
          </h3>
          <ul className="space-y-2">
            {(dash?.pendingOverrides ?? []).map((o) => (
              <li
                key={o.id}
                className="rounded-lg border border-brand-border bg-brand-canvas p-2 text-sm transition-colors hover:border-brand-border-active"
              >
                <p className="font-sans text-brand-text-primary">{o.title}</p>
                <p className="font-data text-[10px] text-brand-text-secondary">
                  {o.code}
                </p>
                <Button
                  disabled={busy}
                  className="mt-2 w-auto px-3 py-1.5 text-xs"
                  onClick={() => void resolverOverride(o.id)}
                >
                  Resolver óptimo
                </Button>
              </li>
            ))}
            {(dash?.pendingOverrides ?? []).length === 0 ? (
              <li className="font-data text-xs text-brand-text-secondary">
                Sin conflictos en cola
              </li>
            ) : null}
          </ul>
        </BentoPanel>
      </div>

      <BentoPanel
        id="comando"
        title="Directorio de comando"
        subtitle="Sala de crisis · canales ejecutivos"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(dash?.commandDirectory ?? []).map((d) => (
            <div
              key={d.role}
              className="rounded-lg border border-brand-border bg-brand-canvas p-3 transition-colors hover:border-brand-border-active hover:bg-brand-surface-hover"
            >
              <p className="font-sans text-sm text-brand-text-primary">{d.name}</p>
              <p className="font-data text-[10px] text-brand-text-secondary">
                {d.role}
              </p>
              <p className="mt-2 font-sans text-xs text-brand-primary">{d.channel}</p>
              <p className="font-data text-[11px] text-brand-text-secondary">
                {d.video}
              </p>
            </div>
          ))}
        </div>
      </BentoPanel>
    </div>
  );
}
