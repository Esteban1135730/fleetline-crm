"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@fsg/ui";
import {
  AlertTriangle,
  FileSearch,
  Shield,
  Terminal,
  Zap,
} from "lucide-react";
import { api } from "@/lib/api";
import { EmptyState, StatusPulseBadge } from "@/components/audit";
import { BentoPanel } from "@/components/nexa/bento-panel";
import { NexaTable, NexaRow, NexaCell } from "@/components/nexa/nexa-table";
import { ComplianceBadge } from "@/components/rrhh/compliance-badge";

type TrailItem = {
  id: string;
  at: string;
  action: string;
  entity: string;
  entityId?: string | null;
  user?: { name?: string; email?: string } | null;
  ipAddress?: string | null;
  immutable?: boolean;
};

type Finding = {
  id: string;
  code: string;
  title: string;
  status: string;
  category: string;
  severity: string;
  createdAt: string;
};

type AiFlag = {
  kind: string;
  id: string;
  label: string;
  detail: string;
  severity: "CRITICAL" | "WARN";
  at: string;
};

type HeatRow = {
  plate: string;
  gallonsPaid: number;
  kmGps: number;
  deviationPct: number;
  heatLevel: string;
  anomalyScore: number;
};

type Dash = {
  auditTrail: { trail: TrailItem[]; immutable: boolean };
  findings: Finding[];
  aiFlags: AiFlag[];
  findingStats: { open: number; inDischarge: number; closed: number };
  overridesToday: number;
  fuelHeat: Array<{
    plate: string;
    heatLevel: string;
    deviationPct: number;
    anomalyScore: number;
  }>;
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Abierta",
  IN_DISCHARGE: "En Descargos",
  CLOSED_IMPROVEMENT_PLAN: "Cerrada con Plan de Mejora",
};

function formatTrailTs(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-CO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function findingStatusTone(
  status: string,
): "active" | "fatiga" | "danger" | "neutral" {
  if (status === "OPEN") return "danger";
  if (status === "IN_DISCHARGE") return "fatiga";
  if (status === "CLOSED_IMPROVEMENT_PLAN") return "active";
  return "neutral";
}

function heatLevelBadge(level: string) {
  if (level === "RED") {
    return (
      <ComplianceBadge level="RED" pulse>
        CRITICAL
      </ComplianceBadge>
    );
  }
  if (level === "AMBER") {
    return <ComplianceBadge level="AMBER">WARN</ComplianceBadge>;
  }
  return <ComplianceBadge level="GREEN">NOMINAL</ComplianceBadge>;
}

export default function ControlInternoDashboardPage() {
  const [dash, setDash] = useState<Dash | null>(null);
  const [heat, setHeat] = useState<HeatRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const d = await api<Dash>("/api/v1/control-interno/dashboard");
      setDash(d);
    } catch (e) {
      setError(
        (e as Error).message || "Señal perdida — conexión forense",
      );
    }
  }, []);

  const loadFuel = useCallback(async () => {
    try {
      const r = await api<{ heatMap: HeatRow[]; message: string }>(
        "/api/v1/control-interno/combustible/smart-audit?persist=true",
      );
      setHeat(r.heatMap);
    } catch {
      /* soft */
    }
  }, []);

  useEffect(() => {
    void load();
    void loadFuel();
    const t = setInterval(() => void load(), 20_000);
    return () => clearInterval(t);
  }, [load, loadFuel]);

  const trail = dash?.auditTrail.trail ?? [];
  const heatRows = heat.length ? heat : dash?.fuelHeat ?? [];

  const securityBadges = useMemo(
    () => ({
      immutable: dash?.auditTrail.immutable ?? true,
      overrides: dash?.overridesToday ?? 0,
      openFindings: dash?.findingStats.open ?? 0,
      aiFlags: dash?.aiFlags.length ?? 0,
    }),
    [dash],
  );

  async function crearHallazgo() {
    if (!title.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await api<{ message: string }>(
        "/api/v1/control-interno/hallazgos/crear",
        {
          method: "POST",
          body: JSON.stringify({
            title: title.trim(),
            category: "OPERATIVA",
            severity: "MEDIUM",
            description: "Hallazgo registrado desde control interno",
          }),
        },
      );
      setMsg(res.message);
      setTitle("");
      await load();
    } catch (e) {
      setError((e as Error).message || "No se pudo crear hallazgo");
    } finally {
      setBusy(false);
    }
  }

  async function consolidarOverrides() {
    setBusy(true);
    try {
      const res = await api<{ message: string }>(
        "/api/v1/control-interno/overrides/consolidar-diario",
        { method: "POST", body: "{}" },
      );
      setMsg(res.message);
      await load();
    } catch (e) {
      setError((e as Error).message || "Consolidación fallida");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <header>
        <h1 className="font-sans text-lg font-semibold tracking-tight text-brand-text-primary">
          Centro de control interno
        </h1>
        <p className="mt-0.5 font-data text-[10px] uppercase tracking-[0.12em] text-brand-text-secondary">
          Caja negra · lectura forense · sin mutación operativa
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <ComplianceBadge level={securityBadges.immutable ? "GREEN" : "RED"}>
            {securityBadges.immutable ? "Bitácora append-only" : "Mutable"}
          </ComplianceBadge>
          <StatusPulseBadge
            tone={securityBadges.overrides > 0 ? "fatiga" : "neutral"}
          >
            Excepciones hoy {securityBadges.overrides}
          </StatusPulseBadge>
          <StatusPulseBadge
            tone={securityBadges.openFindings > 0 ? "danger" : "active"}
            pulse={securityBadges.openFindings > 0}
          >
            Abiertas {securityBadges.openFindings}
          </StatusPulseBadge>
          <StatusPulseBadge
            tone={securityBadges.aiFlags > 0 ? "danger" : "neutral"}
            pulse={securityBadges.aiFlags > 0}
          >
            Flags IA {securityBadges.aiFlags}
          </StatusPulseBadge>
        </div>
      </header>

      {error ? (
        <p className="rounded-xl border border-brand-danger/40 bg-brand-danger/10 px-4 py-3 text-sm text-brand-danger">
          {error}
        </p>
      ) : null}
      {msg ? (
        <p className="rounded-xl border border-brand-secondary/40 bg-brand-secondary/10 px-4 py-3 text-sm text-brand-text-primary">
          {msg}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <BentoPanel
          title="Eventos"
          subtitle="Caja negra"
          icon={<Terminal aria-hidden />}
        >
          <p className="font-data text-3xl font-bold tabular-nums text-brand-primary">
            {trail.length}
          </p>
        </BentoPanel>
        <BentoPanel
          title="Overrides"
          subtitle="Hoy"
          icon={<Zap aria-hidden />}
        >
          <p className="font-data text-3xl font-bold tabular-nums text-brand-warning">
            {dash?.overridesToday ?? 0}
          </p>
        </BentoPanel>
        <BentoPanel
          title="Hallazgos"
          subtitle="Abiertos"
          icon={<FileSearch aria-hidden />}
        >
          <p className="font-data text-3xl font-bold tabular-nums text-brand-danger">
            {dash?.findingStats.open ?? 0}
          </p>
        </BentoPanel>
        <BentoPanel
          title="Radar IA"
          subtitle="Flags activos"
          icon={<AlertTriangle aria-hidden />}
        >
          <p className="font-data text-3xl font-bold tabular-nums text-brand-warning">
            {dash?.aiFlags.length ?? 0}
          </p>
        </BentoPanel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BentoPanel
          id="audit-log"
          title="Caja negra · Rastro de auditoría"
          subtitle="Terminal forense · append-only"
          icon={<Terminal aria-hidden />}
          className="font-data"
        >
          {trail.length === 0 ? (
            <EmptyState
              icon={<Terminal className="h-8 w-8" />}
              title="Sin eventos en la caja negra"
              description="Los eventos de auditoría aparecerán aquí en tiempo real."
            />
          ) : (
            <div className="max-h-[420px] overflow-y-auto rounded-lg border border-brand-border bg-brand-canvas/60 p-2">
              <NexaTable
                columns={["Timestamp", "Acción", "Entidad", "Actor", "IP"]}
                className="text-xs"
              >
                {trail.map((row) => (
                  <NexaRow key={row.id}>
                    <NexaCell mono className="text-xs text-brand-primary">
                      <span className="tabular-nums">
                        {formatTrailTs(row.at)}
                      </span>
                    </NexaCell>
                    <NexaCell mono className="text-xs font-medium">
                      {row.action}
                    </NexaCell>
                    <NexaCell mono className="text-xs text-brand-text-secondary">
                      {row.entity}
                      {row.entityId ? (
                        <span className="ml-1 text-brand-text-secondary">
                          · {row.entityId.slice(0, 8)}
                        </span>
                      ) : null}
                    </NexaCell>
                    <NexaCell mono className="text-xs">
                      {row.user?.name || row.user?.email || "sistema"}
                    </NexaCell>
                    <NexaCell mono className="text-xs tabular-nums text-brand-text-secondary">
                      {row.ipAddress || "n/a"}
                    </NexaCell>
                  </NexaRow>
                ))}
              </NexaTable>
            </div>
          )}
        </BentoPanel>

        <BentoPanel
          id="anomalias"
          title="Radar de anomalías · Alertas de IA"
          subtitle="Combustible · pagos · desvíos"
          icon={<Shield aria-hidden />}
        >
          {(dash?.aiFlags ?? []).length === 0 ? (
            <EmptyState
              icon={<Shield className="h-8 w-8" />}
              title="Sin flags activos"
              description="El radar IA no reporta anomalías en este ciclo."
            />
          ) : (
            <NexaTable columns={["Severidad", "Tipo", "Detalle", "Hora"]}>
              {(dash?.aiFlags ?? []).map((f) => (
                <NexaRow key={`${f.kind}-${f.id}`}>
                  <NexaCell>
                    <StatusPulseBadge
                      tone={f.severity === "CRITICAL" ? "danger" : "fatiga"}
                      pulse={f.severity === "CRITICAL"}
                    >
                      {f.severity}
                    </StatusPulseBadge>
                  </NexaCell>
                  <NexaCell mono className="text-xs">
                    {f.kind}
                  </NexaCell>
                  <NexaCell className="text-xs">
                    <p className="font-medium">{f.label}</p>
                    <p className="text-brand-text-secondary">{f.detail}</p>
                  </NexaCell>
                  <NexaCell mono className="text-xs tabular-nums text-brand-text-secondary">
                    {formatTrailTs(f.at)}
                  </NexaCell>
                </NexaRow>
              ))}
            </NexaTable>
          )}

          <h4 className="mt-6 font-sans text-sm font-semibold text-brand-text-primary">
            Mapa de calor combustible
          </h4>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {heatRows.slice(0, 12).map((h) => (
              <div
                key={h.plate}
                className="rounded-lg border border-brand-border bg-brand-surface p-3"
              >
                <p className="font-data text-xs font-bold tabular-nums text-brand-text-primary">
                  {h.plate}
                </p>
                <p className="mt-1 font-data text-[10px] tabular-nums text-brand-text-secondary">
                  {h.deviationPct}% desvío
                </p>
                <div className="mt-2">{heatLevelBadge(h.heatLevel)}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-end">
            <Button
              type="button"
              variant="secondary"
              className="w-auto px-4 py-2"
              disabled={busy}
              onClick={() => void loadFuel()}
            >
              Recalcular auditoría
            </Button>
          </div>
        </BentoPanel>
      </div>

      <BentoPanel
        id="hallazgos"
        title="Gestor de Hallazgos"
        subtitle="Abierta → Descargos → Cerrada"
        icon={<FileSearch aria-hidden />}
        action={
          <div className="flex flex-wrap gap-2">
            <StatusPulseBadge tone="danger" pulse={(dash?.findingStats.open ?? 0) > 0}>
              Abierta {dash?.findingStats.open ?? 0}
            </StatusPulseBadge>
            <StatusPulseBadge tone="fatiga">
              Descargos {dash?.findingStats.inDischarge ?? 0}
            </StatusPulseBadge>
            <StatusPulseBadge tone="active">
              Cerrada {dash?.findingStats.closed ?? 0}
            </StatusPulseBadge>
          </div>
        }
      >
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            className="field min-h-[40px] flex-1"
            placeholder="Título del hallazgo"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="primary"
              className="w-auto px-4 py-2"
              disabled={busy}
              onClick={() => void crearHallazgo()}
            >
              Crear hallazgo
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="w-auto px-4 py-2"
              disabled={busy}
              onClick={() => void consolidarOverrides()}
            >
              Consolidar overrides
            </Button>
          </div>
        </div>

        {(dash?.findings ?? []).length === 0 ? (
          <EmptyState
            icon={<FileSearch className="h-8 w-8" />}
            title="Sin hallazgos registrados"
            description="Registre un hallazgo operativo para iniciar el flujo de descargos."
          />
        ) : (
          <NexaTable columns={["Código", "Título", "Categoría", "Estado"]}>
            {(dash?.findings ?? []).map((f) => (
              <NexaRow key={f.id}>
                <NexaCell mono className="text-xs text-brand-secondary">
                  {f.code}
                </NexaCell>
                <NexaCell>
                  <p className="text-sm font-medium">{f.title}</p>
                  <p className="font-data text-[10px] text-brand-text-secondary">
                    {f.severity}
                  </p>
                </NexaCell>
                <NexaCell className="text-xs text-brand-text-secondary">
                  {f.category}
                </NexaCell>
                <NexaCell>
                  <StatusPulseBadge tone={findingStatusTone(f.status)}>
                    {STATUS_LABEL[f.status] || f.status}
                  </StatusPulseBadge>
                </NexaCell>
              </NexaRow>
            ))}
          </NexaTable>
        )}
      </BentoPanel>
    </div>
  );
}
