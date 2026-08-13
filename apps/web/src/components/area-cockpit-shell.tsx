"use client";

import type { ModuleId } from "@fsg/shared";
import { MODULE_LABELS } from "@fsg/shared";
import { Button, Tooltip } from "@fsg/ui";
import { useShell } from "@/lib/shell-context";
import { PageIntro } from "@/components/page-intro";
import { EmptyState, KpiCard } from "@/components/audit";
import { LayoutDashboard } from "lucide-react";

export type CockpitKpi = {
  label: string;
  value: string;
  hint?: string;
  accent?: "emerald" | "amber" | "rose" | "primary";
};

type AreaCockpitShellProps = {
  module: ModuleId;
  title?: string;
  statusLine?: string;
  kpis: CockpitKpi[];
  protocol?: [string, string, string];
};

/**
 * Clean Cockpit — KPIs + ayuda [?]. Sin muro de protocolo estático.
 */
export function AreaCockpitShell({
  module,
  title,
  statusLine = "System Status: Nominal — cockpit en fase de instrumentación",
  kpis,
}: AreaCockpitShellProps) {
  const { toggleHelp } = useShell();

  const toneMap = {
    emerald: "ok" as const,
    amber: "warn" as const,
    rose: "danger" as const,
    primary: "neutral" as const,
  };

  return (
    <div
      className="fade-in mx-auto max-w-[1600px] space-y-6"
      data-testid="presidencia-cockpit"
    >
      <PageIntro
        module={module}
        title={title || MODULE_LABELS[module]}
        action={
          <Tooltip content="Abrir guía de 3 pasos de esta área">
            <Button
              variant="ghost"
              className="!h-9 !w-9 !rounded-full !p-0 font-data text-base"
              onClick={toggleHelp}
              aria-label="Centro de ayuda"
              title="Ayuda contextual [ ? ]"
            >
              ?
            </Button>
          </Tooltip>
        }
      />

      <p
        className="font-data text-[11px] uppercase tracking-[0.14em] text-[var(--accent-primary)]"
        data-testid="cockpit-status"
      >
        {statusLine}
      </p>

      <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <KpiCard
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            delta={kpi.hint}
            tone={toneMap[kpi.accent || "emerald"]}
            icon={<LayoutDashboard />}
          />
        ))}
      </div>

      <EmptyState
        icon={<LayoutDashboard className="h-7 w-7" />}
        title="Instrumentación operativa pendiente"
        description="Use [ ? ] para el protocolo del área. Los flujos se activarán en la siguiente fase."
        actionLabel="Abrir ayuda"
        onAction={toggleHelp}
      />
    </div>
  );
}
