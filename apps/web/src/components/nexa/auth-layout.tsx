"use client";

import type { ReactNode } from "react";
import { brand } from "@/lib/brand";
import { ThemeToggle } from "@/lib/theme";
import { StatusPulseBadge } from "@/components/audit/KpiCard";
import { NexaLogoIcon } from "@/components/ui/assets";

type AuthLayoutProps = {
  title: string;
  subtitle?: string;
  statusLine: string;
  statusTone?: "active" | "fatiga" | "danger" | "neutral";
  clock?: string;
  footerExtra?: string;
  children: ReactNode;
};

/** Layout de acceso — caja frosted centrada sobre marca NEXA animada. */
export function AuthLayout({
  title,
  subtitle,
  statusLine,
  statusTone = "active",
  clock,
  footerExtra,
  children,
}: AuthLayoutProps) {
  return (
    <div className="login-canvas relative flex min-h-screen flex-col overflow-x-clip bg-brand-canvas">
      {/* Marca gigante traslúcida — colorometría con rebote en bordes */}
      <div
        className="login-nexa-stage pointer-events-none absolute flex items-center justify-center"
        aria-hidden
      >
        <div className="login-nexa-glow absolute inset-0" />
        <div className="login-nexa-stack select-none">
          <span className="login-nexa-fog" aria-hidden>
            NEXA
          </span>
          <span className="login-nexa-depth" aria-hidden>
            NEXA
          </span>
          <span className="login-nexa-watermark">NEXA</span>
        </div>
      </div>

      <div className="absolute right-4 top-4 z-20 md:right-8 md:top-8">
        <ThemeToggle />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12 sm:px-6">
        <div className="login-card-shell fade-in rounded-2xl border border-brand-border/50 p-6 sm:rounded-3xl sm:p-8">
          <header className="mb-6 text-center">
            <div className="mb-3 flex justify-center">
              <NexaLogoIcon className="brand-mark h-10 w-10 shadow-brand-glow" />
            </div>
            <p className="font-data text-[10px] font-semibold uppercase tracking-[0.22em] text-brand-primary">
              {brand.tagline}
            </p>
            <h1 className="font-sans mt-1.5 text-xl font-semibold tracking-tight text-brand-text-primary sm:text-2xl">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-1.5 font-sans text-sm leading-relaxed text-brand-text-secondary">
                {subtitle}
              </p>
            ) : null}
          </header>

          {children}
        </div>
      </div>

      <footer className="relative z-10 flex flex-col gap-2 border-t border-brand-border/50 bg-[color-mix(in_srgb,var(--brand-surface)_35%,transparent)] px-4 py-4 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <StatusPulseBadge tone={statusTone}>{statusLine}</StatusPulseBadge>
        <div className="flex flex-wrap items-center gap-3 font-data text-[10px] tabular-nums text-brand-text-secondary">
          {clock ? <span>{clock}</span> : null}
          {footerExtra ? <span>{footerExtra}</span> : null}
        </div>
      </footer>
    </div>
  );
}
