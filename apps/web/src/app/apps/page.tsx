"use client";

import { useEffect, useState } from "react";
import { Badge } from "@fsg/ui";
import { api } from "@/lib/api";

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
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-sans text-xl font-semibold tracking-tight text-brand-text-primary">
          Canales operativos
        </h1>
      </header>

      {data?.note ? (
        <p className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-3 text-sm text-[var(--brand-text-secondary)]">
          {data.note}
        </p>
      ) : null}

      <div className="stagger grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {(data?.channels || []).map((ch, i) => (
          <div
            key={ch.id}
            className={`nexa-panel kpi-card p-5 ${KPI_TONE[i % KPI_TONE.length]}`}
          >
            <div className="flex items-start justify-between gap-3 pl-2">
              <h3 className="font-display text-base font-bold tracking-tight text-[var(--brand-text-primary)]">
                {ch.name}
              </h3>
              <Badge tone="info">CRM</Badge>
            </div>
            <p className="mt-4 pl-2 font-data text-lg font-extrabold tracking-tight text-[var(--brand-primary)]">
              {ch.metric}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="nexa-panel kpi-card kpi-card--rose p-6">
          <p className="pl-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--brand-text-secondary)]">
            Tickets abiertos
          </p>
          <p className="font-data mt-2 pl-2 text-4xl font-extrabold text-[var(--brand-danger)]">
            {data?.openTickets ?? "â€”"}
          </p>
        </div>
        <div className="nexa-panel kpi-card kpi-card--indigo p-6">
          <p className="pl-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--brand-text-secondary)]">
            Visitantes en sede
          </p>
          <p className="font-data mt-2 pl-2 text-4xl font-extrabold text-[var(--brand-info)]">
            {data?.visitorsOnSite ?? "â€”"}
          </p>
        </div>
      </div>
    </div>
  );
}
