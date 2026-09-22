"use client";

import { StatusPulseBadge } from "@/components/audit";

type Props = {
  blocked?: boolean | null;
  riskScore?: number | null;
  /** compact = solo chip; full = chip + score */
  variant?: "compact" | "full";
};

/**
 * Aviso visual de bloqueo SARLAFT — Comercial, Compras, Oficial de Cumplimiento.
 */
export function SarlaftBlockBadge({
  blocked,
  riskScore,
  variant = "compact",
}: Props) {
  if (!blocked) {
    if (variant === "full" && riskScore != null && riskScore > 0) {
      return (
        <StatusPulseBadge tone="active" pulse={false}>
          SARLAFT OK · {riskScore}
        </StatusPulseBadge>
      );
    }
    return null;
  }

  return (
    <StatusPulseBadge tone="danger" pulse>
      {variant === "full" && riskScore != null
        ? `SARLAFT bloqueado · ${riskScore}`
        : "SARLAFT bloqueado"}
    </StatusPulseBadge>
  );
}
