import type { ButtonHTMLAttributes, ReactNode } from "react";

export function UplinkSpinner({
  className = "",
  tone = "inherit",
}: {
  className?: string;
  tone?: "inherit" | "primary" | "muted";
}) {
  const toneClass =
    tone === "primary"
      ? "border-[color-mix(in_srgb,var(--accent-primary)_35%,transparent)] border-t-[var(--accent-primary)]"
      : tone === "muted"
        ? "border-[color-mix(in_srgb,var(--text-secondary)_35%,transparent)] border-t-[var(--text-secondary)]"
        : "border-[color-mix(in_srgb,currentColor_35%,transparent)] border-t-current";

  return (
    <span
      className={`flt-spinner inline-block h-3.5 w-3.5 shrink-0 rounded-full border-2 ${toneClass} ${className}`.trim()}
      aria-hidden
    />
  );
}

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

export function Button({
  children,
  variant = "secondary",
  loading = false,
  className = "",
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant | "default";
  loading?: boolean;
}) {
  const resolved: ButtonVariant =
    variant === "default" ? "secondary" : variant;
  const variants: Record<ButtonVariant, string> = {
    primary: "flt-btn flt-btn-primary",
    secondary: "flt-btn flt-btn-secondary",
    danger: "flt-btn flt-btn-danger",
    ghost: "flt-btn flt-btn-ghost",
  };

  return (
    <button
      className={`${variants[resolved]} ${className}`.trim()}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          <UplinkSpinner />
          <span>{children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}

export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`flt-panel ${className}`.trim()}>{children}</div>;
}

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

/** @deprecated Use StatusTone — kept for module pages already using cyan/emerald/etc. */
export type LegacyBadgeTone =
  | "cyan"
  | "emerald"
  | "amber"
  | "rose"
  | "slate"
  | "info"
  | "signal";

function resolveTone(
  tone?: StatusTone | LegacyBadgeTone,
): StatusTone {
  switch (tone) {
    case "success":
    case "cyan":
    case "emerald":
      return "success";
    case "warning":
    case "amber":
      return "warning";
    case "danger":
    case "rose":
    case "signal":
      return "danger";
    case "info":
    case "slate":
      return "info";
    case "neutral":
      return "neutral";
    default:
      return "success";
  }
}

export function Badge({
  children,
  tone = "success",
  dot = true,
  title,
}: {
  children: ReactNode;
  tone?: StatusTone | LegacyBadgeTone;
  dot?: boolean;
  /** Explicación contextual (semáforo, estado) */
  title?: string;
}) {
  const resolved = resolveTone(tone);
  return (
    <span className={`flt-badge flt-badge-${resolved}`} title={title}>
      {dot ? <span className="flt-badge-dot" aria-hidden /> : null}
      {children}
    </span>
  );
}

/** Tooltip flotante minimalista — usabilidad Hyper-Explained */
export function Tooltip({
  content,
  children,
  side = "top",
  className = "",
}: {
  content: string;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}) {
  return (
    <span
      className={`flt-tip ${className}`.trim()}
      data-side={side}
      data-tip={content}
    >
      {children}
    </span>
  );
}

export function StatusBadge(props: {
  children: ReactNode;
  tone?: StatusTone;
  dot?: boolean;
}) {
  return <Badge {...props} />;
}

export function Field({
  className = "",
  mono = false,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }) {
  return (
    <input
      className={`flt-field ${mono ? "font-data" : ""} ${className}`.trim()}
      {...props}
    />
  );
}

export function FieldLabel({
  children,
  htmlFor,
  className = "",
}: {
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <label htmlFor={htmlFor} className={`flt-field-label ${className}`.trim()}>
      {children}
    </label>
  );
}

export type KpiAccent = "primary" | "amber" | "rose" | "cyan" | "emerald";

export function StatCard({
  label,
  value,
  hint,
  trend,
  accent = "primary",
}: {
  label: string;
  value: string;
  hint?: string;
  /** e.g. "+12.4%" or "-3.1%" */
  trend?: string;
  accent?: KpiAccent;
}) {
  const tone =
    accent === "amber"
      ? "amber"
      : accent === "rose"
        ? "rose"
        : "primary";

  const trendPositive = trend?.trim().startsWith("+");
  const trendNegative = trend?.trim().startsWith("-");

  return (
    <div className={`flt-kpi flt-kpi-${tone}`}>
      <p className="flt-kpi-label">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <h3 className="flt-kpi-value font-data">{value}</h3>
        {trend ? (
          <span
            className={`font-data text-xs font-semibold tabular-nums ${
              trendPositive
                ? "text-[var(--accent-primary)]"
                : trendNegative
                  ? "text-[var(--accent-alert)]"
                  : "text-[var(--text-secondary)]"
            }`}
          >
            {trend}
          </span>
        ) : null}
      </div>
      {hint ? <p className="flt-kpi-hint">{hint}</p> : null}
    </div>
  );
}

export function KpiCard(props: {
  label: string;
  value: string;
  hint?: string;
  trend?: string;
  accent?: KpiAccent;
}) {
  return <StatCard {...props} />;
}

export function WorkbenchHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flt-workbench-header mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 max-w-3xl">
        {eyebrow ? (
          <p className="font-data text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--accent-primary)]">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="page-title mt-1 text-2xl md:text-3xl">{title}</h1>
        {subtitle ? (
          <p className="page-sub max-w-2xl leading-relaxed">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function KpiRow({ children }: { children: ReactNode }) {
  return (
    <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {children}
    </div>
  );
}

export function DataShell({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flt-panel data-shell overflow-hidden ${className}`.trim()}>
      {children}
    </div>
  );
}

export function ColorLegend({
  items,
}: {
  items: {
    color: "verde" | "amarillo" | "rojo" | "naranja" | "azul";
    label: string;
  }[];
}) {
  return (
    <div className="color-legend">
      {items.map((item) => (
        <span key={item.label} className="color-legend-item">
          <span className={`color-legend-swatch swatch-${item.color}`} />
          {item.label}
        </span>
      ))}
    </div>
  );
}
