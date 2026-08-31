"use client";

import type { ReactNode } from "react";

export type ComplianceLevel = "GREEN" | "AMBER" | "RED" | "N_A";

const toneClass: Record<ComplianceLevel, string> = {
  GREEN:
    "border-brand-success/40 bg-brand-success/15 text-brand-success",
  AMBER:
    "border-brand-warning/40 bg-brand-warning/15 text-brand-warning",
  RED: "border-brand-danger/40 bg-brand-danger/15 text-brand-danger",
  N_A:
    "border-brand-border bg-brand-surface-elevated text-brand-text-secondary",
};

const dotGlow: Record<ComplianceLevel, string> = {
  GREEN: "glow-led-success",
  AMBER: "glow-led-warning",
  RED: "glow-led-danger",
  N_A: "",
};

/** Semáforo normativo — success / warning / danger vía tokens NEXA. */
export function ComplianceBadge({
  level,
  children,
  pulse,
}: {
  level: ComplianceLevel;
  children: ReactNode;
  pulse?: boolean;
}) {
  const shouldPulse = pulse ?? level === "RED";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-data text-[10px] font-bold uppercase tracking-wide tabular-nums ${toneClass[level]} ${shouldPulse ? "animate-pulse" : ""}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full bg-current ${dotGlow[level]}`}
        aria-hidden
      />
      {children}
    </span>
  );
}

export function affiliateLevel(emp: {
  eps?: string | null;
  arl?: string | null;
  pensionFund?: string | null;
}): ComplianceLevel {
  const fields = [emp.eps, emp.arl, emp.pensionFund];
  if (fields.every((f) => f?.trim())) return "GREEN";
  if (fields.some((f) => f?.trim())) return "AMBER";
  return "RED";
}

export function affiliateLabel(level: ComplianceLevel) {
  if (level === "GREEN") return "AFILIADO";
  if (level === "AMBER") return "INCOMPLETO";
  if (level === "RED") return "SIN EPS/ARL";
  return "N/A";
}
