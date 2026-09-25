"use client";

import type { MouseEventHandler, ReactNode } from "react";
import { Tooltip } from "@fsg/ui";

type KpiCardProps = {
  label: string;
  value: string | number;
  delta?: string;
  tone?: "neutral" | "ok" | "warn" | "danger";
  spark?: number[];
  /** Ícono Lucide (u otro) semitransparente — esquina superior derecha. */
  icon?: ReactNode;
  /** Explicación corta al pasar el mouse (qué mide / de dónde sale). */
  tip?: string;
  /** Hace el KPI clicable (p. ej. abrir detalle). */
  onClick?: MouseEventHandler<HTMLButtonElement>;
};

const toneValue: Record<NonNullable<KpiCardProps["tone"]>, string> = {
  neutral: "text-[var(--brand-text-primary)]",
  ok: "text-[var(--brand-primary)]",
  warn: "text-[var(--brand-warning)]",
  danger: "text-[var(--brand-danger)]",
};

/** KPI ejecutivo — tipografía grande + micro-tendencia. */
export function KpiCard({
  label,
  value,
  delta,
  tone = "neutral",
  spark,
  icon,
  tip,
  onClick,
}: KpiCardProps) {
  const max = spark?.length ? Math.max(...spark, 1) : 1;
  const body = (
    <>
      {icon ? (
        <div
          className="pointer-events-none absolute right-3 top-3 text-[var(--brand-text-secondary)]/30 [&_svg]:h-7 [&_svg]:w-7 sm:[&_svg]:h-10 sm:[&_svg]:w-10"
          aria-hidden
        >
          {icon}
        </div>
      ) : null}
      <p className="panel-header-mono relative pr-10 text-brand-text-secondary">
        {label}
      </p>
      <p
        className={`relative mt-2 break-all font-data text-2xl font-bold tracking-tight tabular-nums kpi-depth sm:text-3xl lg:text-4xl ${toneValue[tone]}`}
      >
        {value}
      </p>
      <div className="panel-divider relative mt-3 flex items-end justify-between gap-3 border-t pt-3">
        {delta ? (
          <span className="text-xs font-medium text-[var(--brand-text-secondary)]">
            {delta}
          </span>
        ) : (
          <span />
        )}
        {spark && spark.length > 1 ? (
          <svg
            viewBox="0 0 64 20"
            className="h-5 w-16 text-[var(--brand-primary)]"
            aria-hidden
          >
            <polyline
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              points={spark
                .map((v, i) => {
                  const x = (i / (spark.length - 1)) * 64;
                  const y = 18 - (v / max) * 16;
                  return `${x},${y}`;
                })
                .join(" ")}
            />
          </svg>
        ) : null}
      </div>
    </>
  );

  const shellClass =
    "nexa-panel frosted-glass nexa-panel-interactive frosted-glass-interactive bento-panel-accent relative w-full min-w-0 overflow-hidden p-4 text-left";

  const card = onClick ? (
    <button
      type="button"
      onClick={onClick}
      className={`${shellClass} cursor-pointer`}
      aria-label={`Ver detalle de ${label}`}
    >
      {body}
    </button>
  ) : (
    <article className={shellClass}>{body}</article>
  );

  if (!tip) return card;
  return (
    <div className="min-w-0 w-full" title={tip}>
      <Tooltip content={tip} side="bottom" className="!block w-full max-w-none">
        {card}
      </Tooltip>
    </div>
  );
}

type PulseBadgeProps = {
  children: ReactNode;
  tone?: "active" | "fatiga" | "danger" | "neutral";
  pulse?: boolean;
};

const badgeTone: Record<NonNullable<PulseBadgeProps["tone"]>, string> = {
  active:
    "border-[color-mix(in_srgb,var(--brand-primary)_40%,transparent)] bg-[color-mix(in_srgb,var(--brand-primary)_14%,transparent)] text-[var(--brand-primary)]",
  fatiga:
    "border-[color-mix(in_srgb,var(--brand-warning)_40%,transparent)] bg-[color-mix(in_srgb,var(--brand-warning)_14%,transparent)] text-[var(--brand-warning)]",
  danger:
    "border-[color-mix(in_srgb,var(--brand-danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--brand-danger)_14%,transparent)] text-[var(--brand-danger)]",
  neutral:
    "border-[var(--brand-border)] bg-[var(--brand-surface-elevated)] text-[var(--brand-text-secondary)]",
};

const dotGlow: Record<NonNullable<PulseBadgeProps["tone"]>, string> = {
  active: "glow-led-primary",
  fatiga: "glow-led-warning",
  danger: "glow-led-danger",
  neutral: "",
};

export function StatusPulseBadge({
  children,
  tone = "neutral",
  pulse,
}: PulseBadgeProps) {
  const shouldPulse = pulse ?? (tone === "danger" || tone === "fatiga");
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-data text-[10px] font-bold uppercase tracking-wide ${badgeTone[tone]} ${shouldPulse ? "animate-pulse" : ""}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full bg-current ${dotGlow[tone]}`}
        aria-hidden
      />
      {children}
    </span>
  );
}
