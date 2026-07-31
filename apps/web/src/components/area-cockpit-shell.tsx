"use client";

import type { ModuleId } from "@fsg/shared";
import { MODULE_HELP, MODULE_LABELS } from "@fsg/shared";
import { Button, StatCard, Tooltip } from "@fsg/ui";
import { useShell } from "@/lib/shell-context";
import { PageIntro } from "@/components/page-intro";

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
 * Clean Cockpit Phase 1 — áreas institucionales sin flujo operativo aún.
 */
export function AreaCockpitShell({
  module,
  title,
  statusLine = "System Status: Nominal — cockpit en fase de instrumentación",
  kpis,
  protocol,
}: AreaCockpitShellProps) {
  const { toggleHelp } = useShell();

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
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

      <p className="font-data text-[11px] uppercase tracking-[0.14em] text-[var(--accent-primary)]">
        {statusLine}
      </p>

      <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <StatCard
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            hint={kpi.hint}
            accent={kpi.accent || "emerald"}
          />
        ))}
      </div>

      <div className="flt-panel space-y-3">
        <p className="font-data text-[10px] uppercase tracking-[0.14em] text-[var(--text-secondary)]">
          Clean Cockpit · Phase 1
        </p>
        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
          {MODULE_HELP[module]} Los flujos operativos de esta área se
          instrumentarán en la siguiente fase. Use{" "}
          <span className="font-data text-[var(--accent-primary)]">[ ? ]</span>{" "}
          para la guía contextual de tres pasos.
        </p>
        {protocol ? (
          <ol className="list-decimal space-y-1 pl-4 text-sm text-[var(--text-primary)]">
            {protocol.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        ) : null}
      </div>
    </div>
  );
}
