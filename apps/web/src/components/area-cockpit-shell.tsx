"use client";

import type { ModuleId } from "@fsg/shared";
import { MODULE_LABELS } from "@fsg/shared";
import { Button, Tooltip } from "@fsg/ui";
import { useShell } from "@/lib/shell-context";
import { EmptyState, KpiCard } from "@/components/audit";
import { LayoutDashboard } from "lucide-react";

export type CockpitKpi = {
  label: string;
  value: string;
  hint?: string;
  accent?: "success" | "warning" | "danger" | "primary";
};

type AreaCockpitShellProps = {
  module: ModuleId;
  title?: string;
  statusLine?: string;
  kpis: CockpitKpi[];
  protocol?: [string, string, string];
};

/** Clean Cockpit — KPIs + ayuda [?]. Sin muro de protocolo estático. */
export function AreaCockpitShell({
  module,
  title,
  statusLine = "Estado del sistema: nominal — tablero en instrumentación",
  kpis,
}: AreaCockpitShellProps) {
  const { toggleHelp } = useShell();

  const toneMap = {
    success: "ok" as const,
    warning: "warn" as const,
    danger: "danger" as const,
    primary: "neutral" as const,
  };

  return (
    <div
      className="fade-in mx-auto max-w-[1600px] space-y-6"
      data-testid="presidencia-cockpit"
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-sans text-xl font-semibold tracking-tight text-brand-text-primary">
            {title || MODULE_LABELS[module]}
          </h1>
          <p
            className="mt-1 font-data text-[10px] uppercase tracking-[0.14em] text-brand-text-secondary"
            data-testid="cockpit-status"
          >
            {statusLine}
          </p>
        </div>
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
      </header>

      <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <KpiCard
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            delta={kpi.hint}
            tone={toneMap[kpi.accent || "success"]}
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
