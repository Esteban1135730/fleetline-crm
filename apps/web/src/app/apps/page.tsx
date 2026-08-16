"use client";

import { useEffect, useState } from "react";
import { Badge } from "@fsg/ui";
import { api } from "@/lib/api";
import { HowToBox, PageIntro } from "@/components/page-intro";

type Overview = {
  channels: { id: string; name: string; status: string; metric: string }[];
  openTickets: number;
  visitorsOnSite: number;
  note?: string;
};

const KPI_TONE = [
  "kpi-card--teal",
  "kpi-card--indigo",
  "kpi-card--amber",
  "kpi-card--rose",
] as const;

export default function AppsPage() {
  const [data, setData] = useState<Overview | null>(null);

  useEffect(() => {
    api<Overview>("/apps/overview").then(setData).catch(console.error);
  }, []);

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-7">
      <PageIntro module="apps" title="Canales operativos" />
      <HowToBox
        steps={[
          "Estas cifras salen de la base de datos del CRM (conductores, clientes, viajes).",
          "Las apps móviles aún no están integradas: no hay sync inventado.",
          "Tickets y visitantes reflejan el centro de llamadas y Recepción en tiempo real.",
        ]}
      />

      {data?.note ? (
        <p className="rounded-lg border border-[var(--brand-line)] bg-[var(--brand-surface)] px-4 py-3 text-sm text-[var(--brand-muted)]">
          {data.note}
        </p>
      ) : null}

      <div className="stagger grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {(data?.channels || []).map((ch, i) => (
          <div
            key={ch.id}
            className={`fsg-panel kpi-card p-5 ${KPI_TONE[i % KPI_TONE.length]}`}
          >
            <div className="flex items-start justify-between gap-3 pl-2">
              <h3 className="font-display text-base font-bold tracking-tight text-[var(--brand-ink)]">
                {ch.name}
              </h3>
              <Badge tone="cyan">CRM</Badge>
            </div>
            <p className="mt-4 pl-2 font-data text-lg font-extrabold tracking-tight text-[var(--brand-primary)]">
              {ch.metric}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="fsg-panel kpi-card kpi-card--rose p-6">
          <p className="pl-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--brand-muted)]">
            Tickets abiertos
          </p>
          <p className="font-data mt-2 pl-2 text-4xl font-extrabold text-[var(--brand-signal)]">
            {data?.openTickets ?? "—"}
          </p>
        </div>
        <div className="fsg-panel kpi-card kpi-card--indigo p-6">
          <p className="pl-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--brand-muted)]">
            Visitantes en sede
          </p>
          <p className="font-data mt-2 pl-2 text-4xl font-extrabold text-[var(--brand-info)]">
            {data?.visitorsOnSite ?? "—"}
          </p>
        </div>
      </div>
    </div>
  );
}
