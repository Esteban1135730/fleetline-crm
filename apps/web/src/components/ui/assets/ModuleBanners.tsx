import type { ReactNode } from "react";
import {
  FleetUnitIcon,
  HeatmapIcon,
  KpiGaugeIcon,
  StatusLedIcon,
  TelemetryRadarIcon,
} from "./NexaIcons";

type ModuleBannerProps = {
  className?: string;
  label?: string;
  children?: ReactNode;
};

function BannerShell({
  className = "",
  label,
  children,
}: ModuleBannerProps) {
  return (
    <div
      className={`frosted-glass relative overflow-hidden rounded-panel p-3 ${className}`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_100%_0%,color-mix(in_srgb,var(--brand-primary)_10%,transparent),transparent_55%)]" />
      {label ? (
        <p className="panel-header-mono relative mb-2">{label}</p>
      ) : null}
      <div className="relative flex items-center justify-center text-brand-primary">
        {children}
      </div>
    </div>
  );
}

export function TelemetryBanner(props: ModuleBannerProps) {
  return (
    <BannerShell label={props.label ?? "Telemetría en vivo"} {...props}>
      <TelemetryRadarIcon className="h-14 w-14 opacity-90" />
    </BannerShell>
  );
}

export function KpiGaugeBanner(props: ModuleBannerProps) {
  return (
    <BannerShell label={props.label ?? "Indicadores operativos"} {...props}>
      <KpiGaugeIcon className="h-14 w-14 opacity-90" />
    </BannerShell>
  );
}

export function HeatmapBanner(props: ModuleBannerProps) {
  return (
    <BannerShell label={props.label ?? "Mapa de calor"} {...props}>
      <HeatmapIcon className="h-14 w-14 opacity-90" />
    </BannerShell>
  );
}

export function ComplianceBanner(
  props: ModuleBannerProps & {
    tone?: "success" | "warning" | "danger" | "primary";
  },
) {
  const { tone = "success", ...rest } = props;
  return (
    <BannerShell label={rest.label ?? "Compliance SARLAFT · PESV"} {...rest}>
      <StatusLedIcon tone={tone} className="h-14 w-14 opacity-90" />
    </BannerShell>
  );
}

export function FleetBanner(props: ModuleBannerProps) {
  return (
    <BannerShell label={props.label ?? "Flota activa"} {...props}>
      <FleetUnitIcon className="h-10 w-20 opacity-90" />
    </BannerShell>
  );
}
