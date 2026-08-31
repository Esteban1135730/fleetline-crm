import type { ReactNode } from "react";

type IconProps = {
  className?: string;
  title?: string;
};

function SvgShell({
  children,
  viewBox,
  className = "h-10 w-10",
  title,
}: {
  children: React.ReactNode;
  viewBox: string;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox={viewBox}
      className={className}
      role="img"
      aria-hidden={title ? undefined : true}
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

/** Radar de telemetría — anillos concéntricos + barrido. */
export function TelemetryRadarIcon({ className, title }: IconProps) {
  return (
    <SvgShell viewBox="0 0 48 48" className={className} title={title}>
      <defs>
        <radialGradient id="nexa-radar-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--brand-primary)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--brand-primary)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="24" cy="24" r="20" fill="url(#nexa-radar-glow)" />
      {[20, 14, 8].map((r) => (
        <circle
          key={r}
          cx="24"
          cy="24"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.15 + (20 - r) * 0.02}
          strokeWidth="0.75"
        />
      ))}
      <path
        d="M24 24 L24 6 A18 18 0 0 1 38 16 Z"
        fill="var(--brand-primary)"
        fillOpacity="0.2"
        stroke="var(--brand-primary)"
        strokeWidth="0.5"
        strokeOpacity="0.6"
      />
      <circle cx="24" cy="24" r="2" fill="var(--brand-primary)" />
      <circle
        cx="32"
        cy="16"
        r="2.5"
        fill="var(--brand-success)"
        className="glow-led-success"
      />
    </SvgShell>
  );
}

/** Gauge / velocímetro KPI. */
export function KpiGaugeIcon({ className, title }: IconProps) {
  return (
    <SvgShell viewBox="0 0 48 48" className={className} title={title}>
      <path
        d="M6 38 A18 18 0 0 1 42 38"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.2"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M10 38 A14 14 0 0 1 34 22"
        fill="none"
        stroke="var(--brand-primary)"
        strokeWidth="3"
        strokeLinecap="round"
        filter="drop-shadow(0 0 4px color-mix(in srgb, var(--brand-primary) 50%, transparent))"
      />
      <circle cx="24" cy="38" r="2.5" fill="var(--brand-primary)" />
      <line
        x1="24"
        y1="38"
        x2="30"
        y2="26"
        stroke="var(--brand-primary)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </SvgShell>
  );
}

/** Mapa de calor operativo. */
export function HeatmapIcon({ className, title }: IconProps) {
  const cells = [
    [0.2, 0.45, 0.7, 0.35],
    [0.55, 0.85, 0.6, 0.25],
    [0.3, 0.5, 0.95, 0.4],
  ];
  return (
    <SvgShell viewBox="0 0 48 48" className={className} title={title}>
      {cells.flatMap((row, ri) =>
        row.map((op, ci) => (
          <rect
            key={`${ri}-${ci}`}
            x={6 + ci * 10}
            y={8 + ri * 10}
            width="8"
            height="8"
            rx="1"
            fill="var(--brand-primary)"
            fillOpacity={op * 0.55}
            stroke="currentColor"
            strokeOpacity="0.08"
            strokeWidth="0.5"
          />
        )),
      )}
    </SvgShell>
  );
}

/** Diodo LED semafórico SARLAFT / PESV. */
export function StatusLedIcon({
  className,
  title,
  tone = "success",
}: IconProps & { tone?: "success" | "warning" | "danger" | "primary" }) {
  const color =
    tone === "success"
      ? "var(--brand-success)"
      : tone === "warning"
        ? "var(--brand-warning)"
        : tone === "danger"
          ? "var(--brand-danger)"
          : "var(--brand-primary)";
  return (
    <SvgShell viewBox="0 0 48 48" className={className} title={title}>
      <rect
        x="14"
        y="10"
        width="20"
        height="28"
        rx="4"
        fill="color-mix(in srgb, var(--brand-surface) 60%, transparent)"
        stroke="currentColor"
        strokeOpacity="0.15"
        strokeWidth="0.75"
      />
      {(["success", "warning", "danger"] as const).map((t, i) => {
        const c =
          t === "success"
            ? "var(--brand-success)"
            : t === "warning"
              ? "var(--brand-warning)"
              : "var(--brand-danger)";
        const active = t === tone || (tone === "primary" && t === "success");
        return (
          <circle
            key={t}
            cx="24"
            cy={16 + i * 8}
            r="3.5"
            fill={c}
            fillOpacity={active ? 1 : 0.18}
            stroke={c}
            strokeOpacity={active ? 0.8 : 0.2}
            strokeWidth="0.5"
            style={
              active
                ? { filter: `drop-shadow(0 0 6px ${c})` }
                : undefined
            }
          />
        );
      })}
      <rect x="20" y="36" width="8" height="2" rx="1" fill={color} fillOpacity="0.5" />
    </SvgShell>
  );
}

/** Silueta vectorial de unidad de flota. */
export function FleetUnitIcon({ className, title }: IconProps) {
  return (
    <SvgShell viewBox="0 0 64 32" className={className} title={title}>
      <path
        d="M4 22 H52 L58 16 L52 10 H12 L8 14 H4 Z"
        fill="color-mix(in srgb, var(--brand-primary) 15%, transparent)"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
        strokeOpacity="0.7"
      />
      <circle cx="16" cy="22" r="4" fill="var(--brand-surface-elevated)" stroke="currentColor" strokeOpacity="0.4" strokeWidth="0.75" />
      <circle cx="46" cy="22" r="4" fill="var(--brand-surface-elevated)" stroke="currentColor" strokeOpacity="0.4" strokeWidth="0.75" />
      <rect x="18" y="12" width="14" height="6" rx="1" fill="var(--brand-primary)" fillOpacity="0.25" stroke="var(--brand-primary)" strokeWidth="0.5" strokeOpacity="0.5" />
      <path
        d="M52 16 H58"
        stroke="var(--brand-primary)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeOpacity="0.6"
      />
    </SvgShell>
  );
}
