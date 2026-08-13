"use client";

import type { ModuleId } from "@fsg/shared";
import { MODULE_LABELS } from "@fsg/shared";
import { WorkbenchHeader } from "@fsg/ui";

export function PageIntro({
  module,
  title,
  subtitle,
  children,
  action,
}: {
  module: ModuleId;
  title?: string;
  subtitle?: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <>
      <WorkbenchHeader
        eyebrow={MODULE_LABELS[module]}
        title={title || MODULE_LABELS[module]}
        /** Protocolos van en HelpSheet [?]; no saturar el top 30%. */
        subtitle={subtitle}
        action={action}
      />
      {children}
    </>
  );
}

export function HowToBox({ steps }: { steps: string[] }) {
  /**
   * @deprecated Auditoría UI/UX — los protocolos NO van en el top 30%.
   * Usar `<SlideOverHelp />` desde `@/components/audit`.
   * Este stub no renderiza bloque estático para no violar `.cursorrules`.
   */
  void steps;
  return null;
}
