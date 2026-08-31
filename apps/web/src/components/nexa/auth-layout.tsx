"use client";

import type { ReactNode } from "react";
import { Shield, Lock, Radio } from "lucide-react";
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

/** Layout de acceso / onboarding — centro de mando seguro, sin distracciones. */
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
    <div className="login-canvas relative flex min-h-screen flex-col overflow-hidden bg-brand-canvas">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,color-mix(in_srgb,var(--brand-primary)_8%,transparent),transparent_60%)]" />

      <div className="absolute right-4 top-4 z-20 md:right-8 md:top-8">
        <ThemeToggle />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-4 py-12 sm:px-6">
        <div className="mb-8 text-center">
          <div className="mb-4 flex justify-center">
            <NexaLogoIcon className="brand-mark h-11 w-11 shadow-brand-glow" />
          </div>
          <p className="font-data text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-primary">
            {brand.tagline}
          </p>
          <h1 className="font-sans mt-2 text-3xl font-semibold tracking-tight text-brand-text-primary sm:text-4xl">
            {brand.name}
          </h1>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
          <div className="hidden lg:col-span-4 lg:flex lg:flex-col lg:gap-3">
            <article className="nexa-panel frosted-glass nexa-panel-interactive p-4">
              <div className="flex items-center gap-2 text-brand-primary">
                <Radio className="h-4 w-4" aria-hidden />
                <span className="font-data text-[10px] uppercase tracking-[0.14em]">
                  Uplink
                </span>
              </div>
              <p className="mt-2 font-sans text-sm text-brand-text-primary">
                Terminal segura
              </p>
              <p className="mt-1 font-data text-[11px] text-brand-text-secondary">
                TLS 1.3 · JWT · MFA ready
              </p>
            </article>
            <article className="nexa-panel frosted-glass nexa-panel-interactive p-4">
              <div className="flex items-center gap-2 text-brand-success">
                <Shield className="h-4 w-4" aria-hidden />
                <span className="font-data text-[10px] uppercase tracking-[0.14em]">
                  Compliance
                </span>
              </div>
              <p className="mt-2 font-sans text-sm text-brand-text-primary">
                Acceso auditado
              </p>
              <p className="mt-1 font-data text-[11px] text-brand-text-secondary">
                RBAC · trazabilidad de sesión
              </p>
            </article>
            <article className="nexa-panel frosted-glass nexa-panel-interactive p-4">
              <div className="flex items-center gap-2 text-brand-warning">
                <Lock className="h-4 w-4" aria-hidden />
                <span className="font-data text-[10px] uppercase tracking-[0.14em]">
                  Credenciales
                </span>
              </div>
              <p className="mt-2 font-sans text-sm text-brand-text-primary">
                Rotación obligatoria
              </p>
              <p className="mt-1 font-data text-[11px] text-brand-text-secondary">
                Clave genérica bloqueada tras primer acceso
              </p>
            </article>
          </div>

          <div className="lg:col-span-8">
            <div className="nexa-panel frosted-glass fade-in p-6 sm:p-8">
              <header className="panel-divider mb-6 border-b border-brand-border/50 pb-4">
                <h2 className="font-sans text-xl font-semibold tracking-tight text-brand-text-primary sm:text-2xl">
                  {title}
                </h2>
                {subtitle ? (
                  <p className="mt-1.5 font-sans text-sm leading-relaxed text-brand-text-secondary">
                    {subtitle}
                  </p>
                ) : null}
              </header>
              {children}
            </div>
          </div>
        </div>
      </div>

      <footer className="relative z-10 flex flex-col gap-2 border-t border-brand-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <StatusPulseBadge tone={statusTone}>{statusLine}</StatusPulseBadge>
        <div className="flex flex-wrap items-center gap-3 font-data text-[10px] tabular-nums text-brand-text-secondary">
          {clock ? <span>{clock}</span> : null}
          {footerExtra ? <span>{footerExtra}</span> : null}
        </div>
      </footer>
    </div>
  );
}
