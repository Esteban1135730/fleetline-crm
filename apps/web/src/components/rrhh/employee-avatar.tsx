"use client";

import type { ComplianceLevel } from "@/components/rrhh/compliance-badge";

export type EmployeeHealth = {
  state: "INCAPACIDAD" | "SIN_NOVEDAD" | "INACTIVO";
  level: ComplianceLevel;
  source: "NOVEDAD" | "ESTADO_EXPEDIENTE" | null;
  until: string | null;
};

const ledClass: Record<ComplianceLevel, string> = {
  GREEN: "bg-brand-success glow-led-success",
  AMBER: "bg-brand-warning glow-led-warning",
  RED: "bg-brand-danger glow-led-danger animate-pulse",
  N_A: "bg-brand-text-secondary/50",
};

function initials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((p) => /^[\p{L}\p{N}]/u.test(p));
  const letters = parts.length > 1 ? [parts[0], parts[1]] : parts;
  return letters.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function fmtShort(value: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
}

export function healthLabel(health: EmployeeHealth | null | undefined) {
  if (!health) return "Salud: sin dato";
  if (health.state === "INCAPACIDAD") {
    const until = fmtShort(health.until);
    if (health.source === "NOVEDAD") {
      return until ? `Incapacidad hasta ${until}` : "Incapacidad vigente";
    }
    return "Incapacidad médica (estado del expediente)";
  }
  if (health.state === "INACTIVO") return "Expediente inactivo";
  return "Sin incapacidad registrada";
}

/**
 * Avatar del colaborador con LED de salud. El expediente aún no almacena
 * fotografía, por eso se muestran iniciales.
 */
export function EmployeeAvatar({
  name,
  health,
}: {
  name: string;
  health: EmployeeHealth | null | undefined;
}) {
  const level = health?.level ?? "N_A";
  const label = healthLabel(health);
  return (
    <span
      className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-brand-border bg-brand-surface-elevated font-data text-xs font-bold text-brand-text-primary"
      title={`${name} · Sin fotografía en el expediente`}
      data-testid="rrhh-employee-avatar"
    >
      {initials(name)}
      <span
        role="img"
        aria-label={label}
        title={label}
        data-testid="rrhh-health-led"
        data-level={level}
        className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-brand-surface ${ledClass[level]}`}
      />
    </span>
  );
}
