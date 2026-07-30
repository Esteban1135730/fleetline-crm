"use client";

import type { ModuleId } from "@fsg/shared";
import { MODULE_HELP, MODULE_LABELS } from "@fsg/shared";
import { WorkbenchHeader } from "@fsg/ui";

export function PageIntro({
  module,
  title,
  children,
  action,
}: {
  module: ModuleId;
  title?: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <>
      <WorkbenchHeader
        eyebrow={MODULE_LABELS[module]}
        title={title || MODULE_LABELS[module]}
        subtitle={MODULE_HELP[module]}
        action={action}
      />
      {children}
    </>
  );
}

export function HowToBox({ steps }: { steps: string[] }) {
  return (
    <div className="flt-panel mb-6 !border-l-[3px] !border-l-[var(--accent-primary)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
        Protocolo operativo
      </p>
      <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm text-[var(--text-primary)]">
        {steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
    </div>
  );
}
