"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { Inbox, ShieldAlert, Star } from "lucide-react";
import { api } from "@/lib/api";
import { subscribeQhseReports } from "@/lib/qhse-reports-refresh";
import { statusEs } from "@fsg/shared";
import {
  EmptyState,
  KpiCard,
  SlideOverHelp,
  StatusPulseBadge,
} from "@/components/audit";
import { BentoPanel } from "@/components/nexa/bento-panel";
import { ComplianceBadge } from "@/components/rrhh/compliance-badge";

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

  useEffect(() => {
    return subscribeQhseReports(() => {
      void load();
    });
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
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-border pb-4">
        <div>
          <p className="font-data text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-primary">
            Calidad · Seguridad · Ambiente
          </p>
          <h1 className="font-sans text-2xl font-semibold tracking-tight text-brand-text-primary md:text-3xl">
            Radar de prevención (QHSE)
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-brand-text-secondary">
            Vista de riesgos PESV, satisfacción del servicio (escala 0–10) y
            huella ambiental.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SlideOverHelp
            title="Qué es QHSE"
            summary="Quality, Health, Safety & Environment — calidad, salud, seguridad y ambiente."
            steps={[
              "Este tablero resume preoperacionales incompletos, licencias/cursos y puntaje del conductor.",
              "La satisfacción NPS se mide de 0 a 10 (máximo 10).",
              "Use los reportes del módulo QHSE para registrar incidentes y encuestas.",
            ]}
          />
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
      </header>

      {error ? (
        <p className="rounded-lg border border-brand-danger/35 bg-brand-danger/10 px-4 py-3 text-sm text-brand-text-primary">
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

      <BentoPanel
        id="esg"
        title="Sostenibilidad · PESV"
        subtitle="Satisfacción 0–10 y huella CO₂"
        icon={<Star className="h-4 w-4" />}
        action={
          nps ? (
            <ComplianceBadge
              level={nps.riskTicketsOpen > 0 ? "AMBER" : "GREEN"}
              pulse={nps.riskTicketsOpen > 0}
            >
              {nps.riskTicketsOpen} tickets riesgo
            </ComplianceBadge>
          ) : null
        }
      >
        <p className="font-sans text-2xl text-brand-text-primary">
          Satisfacción{" "}
          <span className="font-data tabular-nums">{npsDisplay(nps?.nps)}</span>
          <span className="ml-3 font-data text-base text-brand-text-secondary">
            avg {nps?.average != null ? `${nps.average}/10` : "N/A"} · n=
            {nps?.sampleSize ?? 0} · máx. 10
          </span>
        </p>
        {carbon ? (
          <p className="mt-1 font-data text-sm text-brand-text-secondary">
            {carbon.footprint.kgCo2} kg CO₂ · {carbon.footprint.gallons} gal ·{" "}
            {carbon.footprint.distanceKm} km
            {carbon.footprint.gCo2PerKm != null
              ? ` · ${carbon.footprint.gCo2PerKm} g/km`
              : ""}
          </p>
        ) : null}
      </BentoPanel>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <BentoPanel
          id="novedades"
          title="Bandeja de novedades"
          subtitle="Feed en vivo · GPS / PQRS"
          icon={<Inbox className="h-4 w-4" />}
        >
          {(dash?.liveFeed ?? []).length === 0 ? (
            <EmptyState
              icon={<Inbox className="h-7 w-7" />}
              title="Sin novedades en la red"
              description="La cola de GPS y PQRS aparece aquí en tiempo real."
            />
          ) : (
            <ul className="max-h-[420px] divide-y divide-brand-border overflow-y-auto">
              {dash!.liveFeed.map((item) => (
                <li
                  key={`${item.source}-${item.id}`}
                  className="flex items-start justify-between gap-3 py-3"
                >
                  <div>
                    <p className="text-sm text-brand-text-primary">{item.title}</p>
                    <p className="mt-0.5 font-data text-xs text-brand-text-secondary">
                      {item.source} · {new Date(item.at).toLocaleString("es-CO")}
                    </p>
                  </div>
                  <Badge
                    tone={
                      item.source === "TELEMETRY"
                        ? "danger"
                        : item.source === "PQRS"
                          ? "warning"
                          : "success"
                    }
                  >
                    {statusEs(item.status)}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </BentoPanel>

        <div id="siniestros" className="space-y-3">
          <p className="px-1 font-data text-[10px] uppercase tracking-[0.14em] text-brand-text-secondary">
            Panel de investigaciones · Sala de crisis
          </p>
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
        </div>
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
    <BentoPanel title={props.title} subtitle={`${props.items.length} tarjetas`}>
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
              className="rounded-lg border border-brand-border bg-brand-canvas p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-data text-xs text-brand-primary">{card.code}</span>
                <StatusPulseBadge
                  tone={props.closed ? "active" : "fatiga"}
                  pulse={!props.closed}
                >
                  {card.severity}
                </StatusPulseBadge>
              </div>
              <p className="mt-1 text-sm text-brand-text-primary">{card.title}</p>
              <p className="mt-1 font-data text-xs text-brand-text-secondary">
                {card.vehicle?.plate ?? "N/A"} · {card.driver?.name ?? "N/A"}
              </p>
            </article>
          ))
        )}
      </div>
    </BentoPanel>
  );
}
