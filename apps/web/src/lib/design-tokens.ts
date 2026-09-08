/**
 * NEXA CRM — Design Token SSOT (JS consumers: charts, maps, theme injection)
 * CSS canonical definitions live in `apps/web/src/app/globals.css` (:root / .dark).
 * Keep both in sync when adjusting palette values.
 */

export type ThemeMode = "light" | "dark";

export type DesignTokens = {
  canvas: string;
  surface: string;
  surfaceHover: string;
  surfaceElevated: string;
  surfaceGlass: string;
  border: string;
  borderActive: string;
  primary: string;
  primaryFg: string;
  primaryGlow: string;
  secondary: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  textPrimary: string;
  textSecondary: string;
  field: string;
  chartGrid: string;
  glowActive: string;
  glowText: string;
  onWarning: string;
  onPrimary: string;
  contrastFg: string;
  scrim: string;
  chartMuted: string;
  chartNeutral: string;
  mapRoute: string;
  mapTileUrl: string;
  crisisBg: string;
  liveGradientFrom: string;
  liveGradientTo: string;
  shadowPanel: string;
  shadowInset: string;
  glowSuccess: string;
  glowWarning: string;
  glowDanger: string;
  glowDangerStrong: string;
  mapPinShadow: string;
};

export const lightTokens: DesignTokens = {
  canvas: "#E8F0F7",
  surface: "#F7FBFE",
  surfaceHover: "#EEF5FB",
  surfaceElevated: "#DCE8F2",
  surfaceGlass: "rgba(247, 251, 254, 0.72)",
  border: "#B8CDDE",
  borderActive: "rgba(0, 180, 216, 0.45)",
  primary: "#0891B2",
  primaryFg: "#FFFFFF",
  primaryGlow: "rgba(8, 145, 178, 0.28)",
  secondary: "#00B4D8",
  success: "#059669",
  warning: "#D97706",
  danger: "#DC2626",
  info: "#5B6B7C",
  textPrimary: "#0B1A2A",
  textSecondary: "#4A6278",
  field: "#FFFFFF",
  chartGrid: "#94A3B8",
  glowActive: "0 0 15px rgba(8, 145, 178, 0.22)",
  glowText: "none",
  onWarning: "#1A1200",
  onPrimary: "#FFFFFF",
  contrastFg: "#FFFFFF",
  scrim: "rgba(11, 26, 42, 0.28)",
  chartMuted: "#64748B",
  chartNeutral: "#94A3B8",
  mapRoute: "#059669",
  mapTileUrl:
    "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
  crisisBg: "rgba(220, 38, 38, 0.10)",
  liveGradientFrom: "#0891B2",
  liveGradientTo: "#059669",
  shadowPanel: "0 12px 36px rgba(11, 26, 42, 0.08)",
  shadowInset: "0 0 0 1px rgba(255, 255, 255, 0.65)",
  glowSuccess: "0 0 8px color-mix(in srgb, #059669 40%, transparent)",
  glowWarning: "0 0 8px color-mix(in srgb, #D97706 35%, transparent)",
  glowDanger: "0 0 8px color-mix(in srgb, #DC2626 40%, transparent)",
  glowDangerStrong: "0 0 16px color-mix(in srgb, #DC2626 50%, transparent)",
  mapPinShadow: "0 2px 8px rgba(11, 26, 42, 0.25)",
};

export const darkTokens: DesignTokens = {
  canvas: "#050B14",
  surface: "#0B1325",
  surfaceHover: "#101C32",
  surfaceElevated: "#0F1A2E",
  surfaceGlass: "rgba(11, 19, 37, 0.85)",
  border: "#1C3A5E",
  borderActive: "rgba(0, 229, 255, 0.30)",
  primary: "#00E5FF",
  primaryFg: "#050B14",
  primaryGlow: "rgba(0, 229, 255, 0.30)",
  secondary: "#00B4D8",
  success: "#10B981",
  warning: "#F59E0B",
  danger: "#FF2A55",
  info: "#8B9BB4",
  textPrimary: "#FFFFFF",
  textSecondary: "#8B9BB4",
  field: "#0F1A2E",
  chartGrid: "rgba(139, 155, 180, 0.28)",
  glowActive: "0 0 15px rgba(0, 229, 255, 0.30)",
  glowText: "0 0 10px rgba(0, 229, 255, 0.5)",
  onWarning: "#1A1200",
  onPrimary: "#050B14",
  contrastFg: "#FFFFFF",
  scrim: "rgba(5, 11, 20, 0.45)",
  chartMuted: "#64748B",
  chartNeutral: "#8B9BB4",
  mapRoute: "#10B981",
  mapTileUrl:
    "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  crisisBg: "rgba(255, 42, 85, 0.10)",
  liveGradientFrom: "#00B4D8",
  liveGradientTo: "#10B981",
  shadowPanel: "0 10px 30px rgba(0, 0, 0, 0.28)",
  shadowInset: "0 0 0 1px rgba(255, 255, 255, 0.04)",
  glowSuccess: "0 0 8px color-mix(in srgb, #10B981 45%, transparent)",
  glowWarning: "0 0 8px color-mix(in srgb, #F59E0B 40%, transparent)",
  glowDanger: "0 0 8px color-mix(in srgb, #FF2A55 45%, transparent)",
  glowDangerStrong: "0 0 16px color-mix(in srgb, #FF2A55 55%, transparent)",
  mapPinShadow: "0 2px 8px rgba(0, 0, 0, 0.45)",
};

export function tokensForMode(mode: ThemeMode): DesignTokens {
  return mode === "dark" ? darkTokens : lightTokens;
}

/** Maps semantic tokens → CSS custom properties on :root / html */
export function tokensToCssVars(t: DesignTokens): Record<string, string> {
  return {
    "--brand-canvas": t.canvas,
    "--brand-surface": t.surface,
    "--brand-surface-hover": t.surfaceHover,
    "--brand-surface-elevated": t.surfaceElevated,
    "--brand-surface-glass": t.surfaceGlass,
    "--brand-border": t.border,
    "--brand-border-active": t.borderActive,
    "--brand-primary": t.primary,
    "--brand-primary-fg": t.primaryFg,
    "--brand-primary-glow": t.primaryGlow,
    "--brand-secondary": t.secondary,
    "--brand-success": t.success,
    "--brand-warning": t.warning,
    "--brand-danger": t.danger,
    "--brand-info": t.info,
    "--brand-text-primary": t.textPrimary,
    "--brand-text-secondary": t.textSecondary,
    "--brand-field": t.field,
    "--brand-chart-grid": t.chartGrid,
    "--brand-glow-active": t.glowActive,
    "--brand-glow-text": t.glowText,
    "--brand-on-warning": t.onWarning,
    "--brand-on-primary": t.onPrimary,
    "--brand-contrast-fg": t.contrastFg,
    "--brand-scrim": t.scrim,
    "--brand-chart-muted": t.chartMuted,
    "--brand-chart-neutral": t.chartNeutral,
    "--brand-map-route": t.mapRoute,
    "--brand-map-tile-url": t.mapTileUrl,
    "--brand-crisis-bg": t.crisisBg,
    "--brand-live-gradient-from": t.liveGradientFrom,
    "--brand-live-gradient-to": t.liveGradientTo,
    "--brand-shadow-panel": t.shadowPanel,
    "--brand-shadow-inset": t.shadowInset,
    "--brand-glow-success": t.glowSuccess,
    "--brand-glow-warning": t.glowWarning,
    "--brand-glow-danger": t.glowDanger,
    "--brand-glow-danger-strong": t.glowDangerStrong,
    "--brand-map-pin-shadow": t.mapPinShadow,
    "--panel-radius": "12px",
    "--ease-ui": "cubic-bezier(0.22, 1, 0.36, 1)",
  };
}

/** Read a token from the DOM (client maps / dynamic SVG). */
export function readCssVar(name: string, fallback = ""): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v || fallback;
}
