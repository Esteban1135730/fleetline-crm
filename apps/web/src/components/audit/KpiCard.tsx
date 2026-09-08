"use client";

import type { ReactNode } from "react";

type KpiCardProps = {
  label: string;
  value: string | number;
  delta?: string;
  tone?: "neutral" | "ok" | "warn" | "danger";
  spark?: number[];
  /** Ícono Lucide (u otro) semitransparente — esquina superior derecha. */
  icon?: ReactNode;
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
}: KpiCardProps) {
  const max = spark?.length ? Math.max(...spark, 1) : 1;
  return (
    <article className="nexa-panel frosted-glass nexa-panel-interactive frosted-glass-interactive bento-panel-accent relative overflow-hidden p-4">
      {icon ? (
        <div
          className="pointer-events-none absolute right-3 top-3 text-[var(--brand-text-secondary)]/30 [&_svg]:h-10 [&_svg]:w-10"
          aria-hidden
        >
          {icon}
        </div>
      ) : null}
      <p className="panel-header-mono relative text-brand-text-secondary">
        {label}
      </p>
      <p
        className={`relative mt-2 font-data text-4xl font-bold tracking-tight tabular-nums kpi-depth ${toneValue[tone]}`}
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
    </article>
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
