"use client";

import { Eye, EyeOff } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { homePathForRole, useAuth } from "@/lib/auth-context";
import { authenticateNode } from "@/lib/auth-mock";
import { AUTH_COPY, AuthNodeError } from "@/lib/auth-types";
import { brand } from "@/lib/brand";
import { ThemeToggle } from "@/lib/theme";

type FormPhase = "idle" | "loading" | "success" | "error";

function FleetMark({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={`brand-mark ${className}`} aria-hidden>
      <rect width="32" height="32" rx="2" fill="var(--accent-primary)" />
      <path
        d="M8 22 L8 10 L16 18 L24 10 L24 22"
        fill="none"
        stroke="var(--brand-primary-fg)"
        strokeWidth="2.2"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </svg>
  );
}

export function LoginScreen() {
  const { login, user, homePath, loading } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [phase, setPhase] = useState<FormPhase>("idle");
  const [clock, setClock] = useState("");

  useEffect(() => {
    if (!loading && user) router.replace(homePath);
  }, [loading, user, homePath, router]);

  useEffect(() => {
    const tick = () =>
      setClock(new Date().toISOString().replace("T", " ").slice(0, 19));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage("");
    setPhase("loading");

    try {
      const session = await authenticateNode(email, password, login);
      setPhase("success");
      router.replace(homePathForRole(session.user.role));
    } catch (err) {
      setPhase("error");
      if (err instanceof AuthNodeError) {
        setErrorMessage(err.message);
      } else if (
        err instanceof Error &&
        /fetch|network|ECONNREFUSED/i.test(err.message)
      ) {
        setErrorMessage(AUTH_COPY.errors.NETWORK_SYNC_FAILURE);
      } else if (err instanceof Error && err.message) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage(AUTH_COPY.errors.NETWORK_SYNC_FAILURE);
      }
    } finally {
      setIsLoading(false);
    }
  }

  const statusLine =
    phase === "error"
      ? AUTH_COPY.systemAlert
      : phase === "loading"
        ? AUTH_COPY.systemOffline
        : AUTH_COPY.systemNominal;

  return (
    <div className="login-canvas relative flex min-h-screen flex-col overflow-hidden">
      <div className="absolute right-4 top-4 z-20 md:right-8 md:top-8">
        <ThemeToggle />
      </div>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-16 sm:px-6">
        <div className="mb-8 text-center">
          <div className="mb-5 flex justify-center">
            <FleetMark className="h-11 w-11 shadow-[0_0_24px_var(--brand-primary-glow)]" />
          </div>
          <p className="font-data text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--accent-primary)]">
            {AUTH_COPY.brandOs}
          </p>
          <h1 className="font-display mt-2 text-4xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-5xl">
            {brand.name}
          </h1>
          <p className="mt-2 font-data text-[10px] uppercase tracking-[0.18em] text-[var(--text-secondary)]">
            {AUTH_COPY.engineVersion}
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="login-card fade-in w-full max-w-[420px] space-y-5 p-6 sm:p-8"
          noValidate
        >
          <div>
            <h2 className="font-display text-xl font-bold tracking-tight text-[var(--text-primary)] sm:text-2xl">
              {AUTH_COPY.accessTitle}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-secondary)]">
              {AUTH_COPY.accessSubtitle}
            </p>
          </div>

          <div>
            <label className="field-label" htmlFor="nodeEmail">
              {AUTH_COPY.nodeEmailLabel}
            </label>
            <input
              id="nodeEmail"
              className="login-field border border-gray-700 bg-[color-mix(in_srgb,var(--surface)_105%,white)]"
              type="email"
              placeholder={AUTH_COPY.nodeEmailPlaceholder}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errorMessage) setErrorMessage("");
                if (phase === "error") setPhase("idle");
              }}
              required
              disabled={isLoading}
              autoComplete="username"
            />
          </div>

          <div>
            <label className="field-label" htmlFor="nodePassword">
              {AUTH_COPY.passwordLabel}
            </label>
            <div className="relative">
              <input
                id="nodePassword"
                className="login-field w-full border border-gray-700 bg-[color-mix(in_srgb,var(--surface)_105%,white)] pr-11 font-data"
                type={showPassword ? "text" : "password"}
                placeholder={AUTH_COPY.passwordPlaceholder}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errorMessage) setErrorMessage("");
                  if (phase === "error") setPhase("idle");
                }}
                required
                disabled={isLoading}
                autoComplete="current-password"
                minLength={6}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-emerald-400"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Ocultar clave" : "Ver clave"}
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            <div className="mt-2 flex justify-end">
              <a
                href="mailto:ti@inretrans.com?subject=Recuperaci%C3%B3n%20de%20clave%20Fleetline"
                className="text-xs text-slate-400 transition hover:text-emerald-400 hover:underline"
              >
                ¿Olvidaste tu clave de acceso?
              </a>
            </div>
          </div>

          {errorMessage ? (
            <div
              role="alert"
              className="rounded-lg border border-[var(--accent-alert)]/40 bg-[color-mix(in_srgb,var(--accent-alert)_10%,transparent)] px-3 py-2.5"
            >
              <p className="font-data text-[11px] font-medium tracking-wide text-[var(--accent-alert)]">
                {errorMessage}
              </p>
            </div>
          ) : null}

          {phase === "success" ? (
            <div className="rounded-lg border border-[var(--accent-primary)]/40 bg-[color-mix(in_srgb,var(--accent-primary)_10%,transparent)] px-3 py-2.5">
              <p className="font-data text-[11px] font-medium tracking-wide text-[var(--accent-primary)]">
                {AUTH_COPY.submitSuccess}
              </p>
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isLoading || phase === "success"}
            className="login-submit flex w-full items-center justify-center gap-2 py-3 text-sm"
          >
            {isLoading ? (
              <>
                <span
                  className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
                  aria-hidden
                />
                <span>{AUTH_COPY.submitLoading}</span>
              </>
            ) : phase === "success" ? (
              AUTH_COPY.submitSuccess
            ) : (
              AUTH_COPY.submitIdle
            )}
          </button>
        </form>
      </div>

      <footer className="relative z-10 flex flex-col gap-1 px-4 pb-4 pt-2 sm:flex-row sm:items-end sm:justify-between sm:px-6">
        <p className="font-data text-[10px] uppercase tracking-[0.12em] text-[var(--text-secondary)]">
          {statusLine}
        </p>
        <p className="font-data text-[10px] text-[var(--text-secondary)]">
          {clock} · {AUTH_COPY.coords}
        </p>
      </footer>
    </div>
  );
}
