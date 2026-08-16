"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { Inbox, ShieldAlert, Star } from "lucide-react";
import { api } from "@/lib/api";
import { statusEs } from "@fsg/shared";
import { PageIntro } from "@/components/page-intro";
import {
  EmptyState,
  KpiCard,
  StatusPulseBadge,
} from "@/components/audit";

type Signal = "NOMINAL" | "WATCH" | "ALERT";

type Dash = {
  riskMatrix: {
    preopsIncomplete: { count: number; signal: Signal };
    licensesCoursesExpiring: {
      count: number;
      licenses: number;
      courses: number;
      signal: Signal;
    };
    globalDriverScore: { value: number; signal: Signal };
  };
  liveFeed: Array<{
    id: string;
    source: string;
    title: string;
    status: string;
    at: string;
  }>;
  kanban: {
    enInvestigacion: Array<{
      id: string;
      code: string;
      title: string;
      severity: string;
      status: string;
      vehicle?: { plate: string } | null;
      driver?: { name: string; safetyScore: number } | null;
    }>;
    cerradoConPlan: Array<{
      id: string;
      code: string;
      title: string;
      severity: string;
      status: string;
      vehicle?: { plate: string } | null;
      driver?: { name: string } | null;
    }>;
  };
};

type NpsSummary = {
  nps: number | null;
  average: number | null;
  sampleSize: number;
  riskTicketsOpen: number;
};

type CarbonResult = {
  footprint: {
    kgCo2: number;
    gallons: number;
    distanceKm: number;
    gCo2PerKm: number | null;
  };
  export: { contentBase64: string; filename: string } | null;
};

function signalTone(s: Signal): "ok" | "warn" | "danger" {
  if (s === "NOMINAL") return "ok";
  if (s === "WATCH") return "warn";
  return "danger";
}

function signalLabel(s: Signal) {
  if (s === "NOMINAL") return "Nominal";
  if (s === "WATCH") return "Vigilancia";
  return "Alerta";
}

function npsDisplay(nps: number | null | undefined) {
  if (nps == null) return "N/A";
  return String(nps);
}

export default function QhsePreventionDashboardPage() {
  const [dash, setDash] = useState<Dash | null>(null);
  const [nps, setNps] = useState<NpsSummary | null>(null);
  const [carbon, setCarbon] = useState<CarbonResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [d, n] = await Promise.all([
        api<Dash>("/api/v1/qhse/dashboard"),
        api<NpsSummary>("/api/v1/qhse/calidad/nps-summary"),
      ]);
      setDash(d);
      setNps(n);
    } catch (e) {
      setError((e as Error).message || "Señal perdida — reintentando conexión");
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 20_000);
    return () => clearInterval(t);
  }, [load]);

  async function exportCarbon() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<CarbonResult>(
        "/api/v1/qhse/ambiental/huella-carbono",
        {
          method: "POST",
          body: JSON.stringify({ exportPdf: true }),
        },
      );
      setCarbon(res);
      if (res.export?.contentBase64) {
        const blob = new Blob([atob(res.export.contentBase64)], {
          type: "application/pdf",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = res.export.filename || "esg-huella.pdf";
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      setError((e as Error).message || "Exportación ambiental fallida");
    } finally {
      setBusy(false);
    }
  }

  const rm = dash?.riskMatrix;

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-8">
      <PageIntro module="qhse" title="Radar de Prevención" />

      {error ? (
        <p className="rounded-lg border border-[rgba(255,42,95,0.35)] bg-[rgba(255,42,95,0.08)] px-4 py-3 text-sm text-[var(--text-primary)]">
          {error}
        </p>
      ) : null}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <KpiCard
          label="Preoperacionales incompletos"
          value={rm ? rm.preopsIncomplete.count : 0}
          delta={
            rm ? signalLabel(rm.preopsIncomplete.signal) : "Sincronizando…"
          }
          tone={rm ? signalTone(rm.preopsIncomplete.signal) : "neutral"}
          icon={<ShieldAlert />}
        />
        <KpiCard
          label="Licencias / cursos vencidos"
          value={rm ? rm.licensesCoursesExpiring.count : 0}
          delta={
            rm
              ? `${rm.licensesCoursesExpiring.licenses} lic. · ${rm.licensesCoursesExpiring.courses} cursos`
              : undefined
          }
          tone={rm ? signalTone(rm.licensesCoursesExpiring.signal) : "neutral"}
        />
        <KpiCard
          label="Puntaje global del conductor"
          value={rm ? rm.globalDriverScore.value : 0}
          delta="Promedio flota activa"
          tone={rm ? signalTone(rm.globalDriverScore.signal) : "neutral"}
        />
      </section>

      <section
        id="esg"
        className="fsg-panel flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between"
      >
        <div className="relative min-w-0 flex-1">
          <Star
            className="pointer-events-none absolute -right-1 -top-1 h-12 w-12 text-slate-500/25"
            aria-hidden
          />
          <p className="text-xs uppercase tracking-wider text-[var(--text-secondary)]">
            Sostenibilidad · Satisfacción y huella de CO₂
          </p>
          <p className="mt-1 font-display text-2xl text-[var(--text-primary)]">
            Satisfacción{" "}
            <span className="font-mono tabular-nums">
              {npsDisplay(nps?.nps)}
            </span>
            <span className="ml-3 font-mono text-base text-[var(--text-secondary)]">
              avg {nps?.average != null ? nps.average : "N/A"} · n=
              {nps?.sampleSize ?? 0}
            </span>
          </p>
          {carbon ? (
            <p className="mt-1 font-mono text-sm text-[var(--text-secondary)]">
              {carbon.footprint.kgCo2} kg CO₂ · {carbon.footprint.gallons} gal ·{" "}
              {carbon.footprint.distanceKm} km
              {carbon.footprint.gCo2PerKm != null
                ? ` · ${carbon.footprint.gCo2PerKm} g/km`
                : ""}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {nps ? (
            <StatusPulseBadge
              tone={nps.riskTicketsOpen > 0 ? "fatiga" : "active"}
              pulse={nps.riskTicketsOpen > 0}
            >
              {nps.riskTicketsOpen} tickets riesgo
            </StatusPulseBadge>
          ) : null}
          <Button
            type="button"
            variant="primary"
            className="w-auto px-4 py-2"
            disabled={busy}
            onClick={() => void exportCarbon()}
          >
            {busy ? "Calculando…" : "Exportar huella PDF"}
          </Button>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section id="novedades" className="fsg-panel overflow-hidden">
          <header className="border-b border-[var(--border-subtle)] px-5 py-4">
            <h3 className="font-display text-lg text-[var(--text-primary)]">
              Bandeja de novedades
            </h3>
            <p className="text-sm text-[var(--text-secondary)]">
              Feed en vivo · GPS / PQRS
            </p>
          </header>
          {(dash?.liveFeed ?? []).length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<Inbox className="h-7 w-7" />}
                title="Sin novedades en la red"
                description="La cola de GPS y PQRS aparece aquí en tiempo real."
              />
            </div>
          ) : (
            <ul className="max-h-[420px] divide-y divide-[var(--border-subtle)] overflow-y-auto">
              {dash!.liveFeed.map((item) => (
                <li
                  key={`${item.source}-${item.id}`}
                  className="flex items-start justify-between gap-3 px-5 py-3"
                >
                  <div>
                    <p className="text-sm text-[var(--text-primary)]">
                      {item.title}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-[var(--text-secondary)]">
                      {item.source} ·{" "}
                      {new Date(item.at).toLocaleString("es-CO")}
                    </p>
                  </div>
                  <Badge
                    tone={
                      item.source === "TELEMETRY"
                        ? "rose"
                        : item.source === "PQRS"
                          ? "amber"
                          : "emerald"
                    }
                  >
                    {statusEs(item.status)}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section id="siniestros" className="space-y-3">
          <header className="px-1">
            <h3 className="font-display text-lg text-[var(--text-primary)]">
              Panel de investigaciones
            </h3>
            <p className="text-sm text-[var(--text-secondary)]">
              Sala de crisis · Tablero de siniestros
            </p>
          </header>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <KanbanColumn
              title="En Investigación"
              items={dash?.kanban.enInvestigacion ?? []}
            />
            <KanbanColumn
              title="Cerrado con Plan de Acción"
              items={dash?.kanban.cerradoConPlan ?? []}
              closed
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function KanbanColumn(props: {
  title: string;
  closed?: boolean;
  items: Array<{
    id: string;
    code: string;
    title: string;
    severity: string;
    vehicle?: { plate: string } | null;
    driver?: { name: string } | null;
  }>;
}) {
  return (
    <div className="fsg-panel min-h-[280px] p-3">
      <p className="mb-3 px-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
        {props.title} · {props.items.length}
      </p>
      <div className="space-y-2">
        {props.items.length === 0 ? (
          <EmptyState
            icon={<ShieldAlert className="h-7 w-7" />}
            title="Columna vacía"
            description="Sin tarjetas en este estado."
          />
        ) : (
          props.items.map((card) => (
            <article
              key={card.id}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-[var(--accent-primary)]">
                  {card.code}
                </span>
                <StatusPulseBadge
                  tone={props.closed ? "active" : "fatiga"}
                  pulse={!props.closed}
                >
                  {card.severity}
                </StatusPulseBadge>
              </div>
              <p className="mt-1 text-sm text-[var(--text-primary)]">
                {card.title}
              </p>
              <p className="mt-1 font-mono text-xs text-[var(--text-secondary)]">
                {card.vehicle?.plate ?? "N/A"} · {card.driver?.name ?? "N/A"}
              </p>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
