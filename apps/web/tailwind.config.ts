import type { Config } from "tailwindcss";

/**
 * NEXA CRM — Tailwind v4 bridge config.
 * Runtime theme colors are defined as CSS variables in `src/app/globals.css`
 * and exposed via `@theme inline` for utilities like `bg-brand-canvas`.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx,jsx,js}"],
  theme: {
    extend: {
      colors: {
        brand: {
          canvas: "var(--brand-canvas)",
          surface: "var(--brand-surface)",
          "surface-hover": "var(--brand-surface-hover)",
          "surface-elevated": "var(--brand-surface-elevated)",
          "surface-glass": "var(--brand-surface-glass)",
          border: "var(--brand-border)",
          "border-active": "var(--brand-border-active)",
          primary: "var(--brand-primary)",
          "primary-fg": "var(--brand-primary-fg)",
          secondary: "var(--brand-secondary)",
          success: "var(--brand-success)",
          warning: "var(--brand-warning)",
          danger: "var(--brand-danger)",
          info: "var(--brand-info)",
          "text-primary": "var(--brand-text-primary)",
          "text-secondary": "var(--brand-text-secondary)",
          field: "var(--brand-field)",
        },
      },
      fontFamily: {
        sans: ["var(--font-body)", "Inter", "SF Pro Display", "Roboto", "sans-serif"],
        display: ["var(--font-display)", "Inter", "SF Pro Display", "Roboto", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "Space Grotesk", "monospace"],
        data: ["var(--font-mono)", "JetBrains Mono", "Space Grotesk", "monospace"],
      },
      borderRadius: {
        panel: "var(--panel-radius, 12px)",
      },
  boxShadow: {
    "brand-glow": "var(--brand-glow-active)",
    "3d-panel": "var(--shadow-3d-panel)",
    "3d-button": "var(--shadow-3d-button)",
  },
    },
  },
};

export default config;
