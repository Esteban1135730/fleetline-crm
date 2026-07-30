/**
 * Aero-Tech Minimalist Design System
 * Obsidian Telemetry (dark) · Aluminium & Quartz (light)
 */
export const brand = {
  name: "Fleetline",
  shortName: "FLT",
  tagline: "FLEETLINE OS",
  product: "CRM & Telemetry",
  engine: "TELEMETRY ENGINE V2.4",
} as const;

/** Aluminium & Quartz — Light Mode */
export const lightTheme = {
  primary: "#0D9488",
  primaryFg: "#FFFFFF",
  primaryGlow: "rgba(13, 148, 136, 0.22)",
  signal: "#DC2626",
  amber: "#D97706",
  emerald: "#0D9488",
  lime: "#0F766E",
  info: "#64748B",
  canvas: "#F4F6F9",
  surface: "#FFFFFF",
  surface2: "#E2E8F0",
  ink: "#0F172A",
  muted: "#64748B",
  line: "#E2E8F0",
  rail: "#0F172A",
  railMuted: "#64748B",
  railActive: "#0D9488",
  fieldBg: "#FFFFFF",
  success: "#0D9488",
} as const;

/** Obsidian Telemetry — Dark Mode */
export const darkTheme = {
  primary: "#10B981",
  primaryFg: "#0A0D14",
  primaryGlow: "rgba(16, 185, 129, 0.18)",
  signal: "#FF2A5F",
  amber: "#FFB800",
  emerald: "#10B981",
  lime: "#34D399",
  info: "#94A3B8",
  canvas: "#0A0D14",
  surface: "#121722",
  surface2: "#1A2230",
  ink: "#F8FAFC",
  muted: "#94A3B8",
  line: "rgba(255, 255, 255, 0.07)",
  rail: "#0A0D14",
  railMuted: "#94A3B8",
  railActive: "#10B981",
  fieldBg: "#1A2230",
  success: "#10B981",
} as const;

export type ThemeMode = "light" | "dark";

export type ThemeTokens = {
  primary: string;
  primaryFg: string;
  primaryGlow: string;
  signal: string;
  amber: string;
  emerald: string;
  lime: string;
  info: string;
  canvas: string;
  surface: string;
  surface2: string;
  ink: string;
  muted: string;
  line: string;
  rail: string;
  railMuted: string;
  railActive: string;
  fieldBg: string;
  success: string;
};

export function themeToCssVars(tokens: ThemeTokens): Record<string, string> {
  const isDark = tokens.canvas === darkTheme.canvas;
  return {
    "--brand-primary": tokens.primary,
    "--brand-primary-fg": tokens.primaryFg,
    "--brand-primary-glow": tokens.primaryGlow,
    "--brand-signal": tokens.signal,
    "--brand-amber": tokens.amber,
    "--brand-emerald": tokens.emerald,
    "--brand-lime": tokens.lime,
    "--brand-info": tokens.info,
    "--brand-canvas": tokens.canvas,
    "--brand-surface": tokens.surface,
    "--brand-surface-2": tokens.surface2,
    "--brand-ink": tokens.ink,
    "--brand-muted": tokens.muted,
    "--brand-line": tokens.line,
    "--brand-rail": tokens.rail,
    "--brand-rail-muted": tokens.railMuted,
    "--brand-rail-active": tokens.railActive,
    "--brand-field": tokens.fieldBg,
    "--brand-success": tokens.success,
    "--bg-canvas": tokens.canvas,
    "--bg-surface-1": tokens.surface,
    "--bg-surface-2": tokens.surface2,
    "--accent-primary": tokens.primary,
    "--accent-metric": tokens.amber,
    "--accent-alert": tokens.signal,
    "--text-primary": tokens.ink,
    "--text-secondary": tokens.muted,
    "--border-subtle": tokens.line,
    "--glow-active": isDark
      ? "0 0 15px rgba(16, 185, 129, 0.18)"
      : "0 0 15px rgba(13, 148, 136, 0.18)",
    "--panel-radius": "12px",
  };
}

export function brandCssVars() {
  return themeToCssVars(darkTheme);
}
