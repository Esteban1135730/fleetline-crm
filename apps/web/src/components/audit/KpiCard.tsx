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
  neutral: "text-[var(--text-primary)]",
  ok: "text-[var(--accent-primary)]",
  warn: "text-[var(--accent-metric)]",
  danger: "text-[var(--accent-alert)]",
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
    <article className="fsg-panel relative overflow-hidden p-4">
      {icon ? (
        <div
          className="pointer-events-none absolute right-3 top-3 text-[var(--text-secondary)]/30 [&_svg]:h-10 [&_svg]:w-10"
          aria-hidden
        >
          {icon}
        </div>
      ) : null}
      <p className="relative text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
        {label}
      </p>
      <p
        className={`relative mt-2 font-mono text-4xl font-bold tracking-tight tabular-nums ${toneValue[tone]}`}
      >
        {value}
      </p>
      <div className="relative mt-3 flex items-end justify-between gap-3">
        {delta ? (
          <span className="text-xs font-medium text-[var(--text-secondary)]">
            {delta}
          </span>
        ) : (
          <span />
        )}
        {spark && spark.length > 1 ? (
          <svg
            viewBox="0 0 64 20"
            className="h-5 w-16 text-[var(--accent-primary)]"
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
    "border-[color-mix(in_srgb,var(--accent-primary)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent-primary)_14%,transparent)] text-[var(--accent-primary)]",
  fatiga:
    "border-[color-mix(in_srgb,var(--accent-metric)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent-metric)_14%,transparent)] text-[var(--accent-metric)]",
  danger:
    "border-[color-mix(in_srgb,var(--accent-alert)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent-alert)_14%,transparent)] text-[var(--accent-alert)]",
  neutral:
    "border-[var(--border-subtle)] bg-[var(--bg-surface-2)] text-[var(--text-secondary)]",
};

export function StatusPulseBadge({
  children,
  tone = "neutral",
  pulse,
}: PulseBadgeProps) {
  const shouldPulse = pulse ?? (tone === "danger" || tone === "fatiga");
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${badgeTone[tone]} ${shouldPulse ? "animate-pulse" : ""}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {children}
    </span>
  );
}
