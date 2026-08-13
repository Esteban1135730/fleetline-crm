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
  neutral: "text-slate-100",
  ok: "text-emerald-400",
  warn: "text-amber-400",
  danger: "text-[var(--fl-critical,#FF2A5F)]",
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
    <article className="relative overflow-hidden rounded-xl border border-slate-800 bg-zinc-900/80 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
      {icon ? (
        <div
          className="pointer-events-none absolute right-3 top-3 text-slate-500/25 [&_svg]:h-10 [&_svg]:w-10"
          aria-hidden
        >
          {icon}
        </div>
      ) : null}
      <p className="relative text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </p>
      <p
        className={`relative mt-2 font-mono text-4xl font-bold tracking-tight tabular-nums ${toneValue[tone]}`}
      >
        {value}
      </p>
      <div className="relative mt-3 flex items-end justify-between gap-3">
        {delta ? (
          <span className="text-xs font-medium text-slate-400">{delta}</span>
        ) : (
          <span />
        )}
        {spark && spark.length > 1 ? (
          <svg viewBox="0 0 64 20" className="h-5 w-16 text-emerald-500" aria-hidden>
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
  active: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
  fatiga: "border-amber-500/40 bg-amber-500/15 text-amber-300",
  danger: "border-rose-500/40 bg-rose-500/15 text-rose-300",
  neutral: "border-slate-600 bg-slate-800/80 text-slate-300",
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
