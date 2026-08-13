/** Aero-Tech — Obsidian Telemetry (dark) + Aluminium & Quartz (light) */
export const colors = {
  dark: {
    canvas: "#0A0D14",
    surface: "#121722",
    border: "rgba(255,255,255,0.07)",
    brand: "#10B981",
    amber: "#FFB800",
    critical: "#FF2A5F",
    text: "#F8FAFC",
    subtext: "#94A3B8",
  },
  light: {
    canvas: "#F4F6F9",
    surface: "#FFFFFF",
    border: "#E2E8F0",
    brand: "#0D9488",
    amber: "#D97706",
    critical: "#DC2626",
    text: "#0F172A",
    subtext: "#64748B",
  },
} as const;

export type ThemeMode = "dark" | "light";

export function palette(mode: ThemeMode = "dark") {
  return colors[mode];
}
