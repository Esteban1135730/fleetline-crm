"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { api } from "@/lib/api";
import { HowToBox, PageIntro } from "@/components/page-intro";

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

function signalTone(s: Signal): "emerald" | "amber" | "rose" {
  if (s === "NOMINAL") return "emerald";
  if (s === "WATCH") return "amber";
  return "rose";
}

function signalLabel(s: Signal) {
  if (s === "NOMINAL") return "Nominal";
  if (s === "WATCH") return "Vigilancia";
  return "Alerta";
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
      setError((e as Error).message || "Señal perdida — reintentando uplink");
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
        const blob = new Blob(
          [atob(res.export.contentBase64)],
          { type: "application/pdf" },
        );
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = res.export.filename || "esg-huella.pdf";
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      setError((e as Error).message || "Exportación ESG fallida");
    } finally {
      setBusy(false);
    }
  }

  const rm = dash?.riskMatrix;

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-8">
      <PageIntro module="qhse" title="Radar de Prevención" />
      <HowToBox
        steps={[
          "Semáforos: preoperacionales, licencias/cursos y Driver Score global.",
          "Bandeja en vivo: excesos GPS, frenadas y PQRS.",
          "Kanban: En Investigación → Cerrado con Plan de Acción.",
        ]}
      />

      {error ? (
        <p className="rounded-lg border border-[rgba(255,42,95,0.35)] bg-[rgba(255,42,95,0.08)] px-4 py-3 text-sm text-[var(--text-primary)]">
          {error}
        </p>
      ) : null}

      {/* Matriz de Riesgo Superior */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <RiskCard
          label="Preoperacionales incompletos"
          value={rm ? String(rm.preopsIncomplete.count) : "—"}
          signal={rm?.preopsIncomplete.signal ?? "WATCH"}
        />
        <RiskCard
          label="Licencias / cursos vencidos"
          value={rm ? String(rm.licensesCoursesExpiring.count) : "—"}
          detail={
            rm
              ? `${rm.licensesCoursesExpiring.licenses} lic. · ${rm.licensesCoursesExpiring.courses} cursos`
              : undefined
          }
          signal={rm?.licensesCoursesExpiring.signal ?? "WATCH"}
        />
        <RiskCard
          label="Driver Score global"
          value={rm ? String(rm.globalDriverScore.value) : "—"}
          detail="Promedio flota activa"
          signal={rm?.globalDriverScore.signal ?? "WATCH"}
          mono
        />
      </section>

      {/* ESG strip */}
      <section
        id="esg"
        className="fsg-panel flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between"
      >
        <div>
          <p className="text-xs uppercase tracking-wider text-[var(--text-secondary)]">
            ESG · NPS & Huella CO₂
          </p>
          <p className="mt-1 font-display text-2xl text-[var(--text-primary)]">
            NPS {nps?.nps != null ? nps.nps : "—"}
            <span className="ml-3 font-mono text-base text-[var(--text-secondary)]">
              avg {nps?.average ?? "—"} · n={nps?.sampleSize ?? 0}
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
        <div className="flex items-center gap-3">
          {nps ? (
            <Badge tone={nps.riskTicketsOpen > 0 ? "amber" : "emerald"}>
              {nps.riskTicketsOpen} tickets riesgo abiertos
            </Badge>
          ) : null}
          <Button
            type="button"
            variant="primary"
            disabled={busy}
            onClick={() => void exportCarbon()}
          >
            {busy ? "Calculando…" : "Exportar huella PDF"}
          </Button>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Bandeja de Novedades */}
        <section id="novedades" className="fsg-panel overflow-hidden">
          <header className="border-b border-[var(--border-subtle)] px-5 py-4">
            <h3 className="font-display text-lg text-[var(--text-primary)]">
              Bandeja de novedades
            </h3>
            <p className="text-sm text-[var(--text-secondary)]">
              Feed en vivo · GPS / PQRS
            </p>
          </header>
          <ul className="max-h-[420px] divide-y divide-[var(--border-subtle)] overflow-y-auto">
            {(dash?.liveFeed ?? []).length === 0 ? (
              <li className="px-5 py-8 text-sm text-[var(--text-secondary)]">
                Sin novedades en uplink
              </li>
            ) : (
              dash!.liveFeed.map((item) => (
                <li
                  key={`${item.source}-${item.id}`}
                  className="flex items-start justify-between gap-3 px-5 py-3"
                >
                  <div>
                    <p className="text-sm text-[var(--text-primary)]">
                      {item.title}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-[var(--text-secondary)]">
                      {item.source} · {new Date(item.at).toLocaleString("es-CO")}
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
                    {item.status}
                  </Badge>
                </li>
              ))
            )}
          </ul>
        </section>

        {/* Kanban */}
        <section id="siniestros" className="space-y-3">
          <header className="px-1">
            <h3 className="font-display text-lg text-[var(--text-primary)]">
              Panel de investigaciones
            </h3>
            <p className="text-sm text-[var(--text-secondary)]">
              War Room · Kanban siniestros
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

function RiskCard(props: {
  label: string;
  value: string;
  detail?: string;
  signal: Signal;
  mono?: boolean;
}) {
  return (
    <div className="fsg-panel p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wider text-[var(--text-secondary)]">
          {props.label}
        </p>
        <Badge tone={signalTone(props.signal)}>
          {signalLabel(props.signal)}
        </Badge>
      </div>
      <p
        className={`mt-3 text-3xl text-[var(--text-primary)] ${
          props.mono ? "font-mono" : "font-display"
        }`}
      >
        {props.value}
      </p>
      {props.detail ? (
        <p className="mt-1 text-sm text-[var(--text-secondary)]">{props.detail}</p>
      ) : null}
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
          <p className="px-2 py-6 text-center text-sm text-[var(--text-secondary)]">
            Columna vacía
          </p>
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
                <Badge tone={props.closed ? "emerald" : "amber"}>
                  {card.severity}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-[var(--text-primary)]">
                {card.title}
              </p>
              <p className="mt-1 font-mono text-xs text-[var(--text-secondary)]">
                {card.vehicle?.plate ?? "—"} · {card.driver?.name ?? "—"}
              </p>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
