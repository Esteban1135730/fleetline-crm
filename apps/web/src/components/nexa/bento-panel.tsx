import type { ReactNode } from "react";

type BentoPanelProps = {
  title?: string;
  subtitle?: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
  accent?: boolean;
  interactive?: boolean;
  /** Ancla para recorrido guiado: kpi | filters | table | panel | primary | secondary */
  tour?:
    | "kpi"
    | "filters"
    | "table"
    | "panel"
    | "primary"
    | "secondary"
    | "toolbar"
    | "list";
};

/** Panel NEXA — cristal esmerilado traslúcido + elevación táctil. */
export function BentoPanel({
  title,
  subtitle,
  icon,
  action,
  children,
  className = "",
  id,
  accent = true,
  interactive = true,
  tour,
}: BentoPanelProps) {
  return (
    <section
      id={id}
      data-tour={tour || undefined}
      className={`nexa-panel frosted-glass relative flex flex-col p-4 md:p-5 ${interactive ? "nexa-panel-interactive frosted-glass-interactive" : ""} ${accent ? "bento-panel-accent" : ""} ${className}`}
    >
      {title || icon || action ? (
        <header className="panel-divider mb-3 flex items-start justify-between gap-2 pb-3">
          <div className="flex min-w-0 items-center gap-2">
            {icon ? (
              <span className="shrink-0 text-brand-primary [&_svg]:h-4 [&_svg]:w-4">
                {icon}
              </span>
            ) : null}
            <div className="min-w-0">
              {title ? (
                <h3 className="panel-header-mono text-brand-text-primary">
                  {title}
                </h3>
              ) : null}
              {subtitle ? (
                <p className="mt-0.5 font-data text-[10px] uppercase tracking-[0.12em] text-brand-text-secondary">
                  {subtitle}
                </p>
              ) : null}
            </div>
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </header>
      ) : null}
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}
