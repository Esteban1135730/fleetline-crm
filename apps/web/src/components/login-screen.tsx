"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { homePathForRole, useAuth } from "@/lib/auth-context";
import { authenticateNode } from "@/lib/auth-mock";
import { AUTH_COPY, AuthNodeError } from "@/lib/auth-types";
import { brand } from "@/lib/brand";
import { ThemeToggle } from "@/lib/theme";

type AuthMode = "login" | "register";
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
  const { login, register, user, homePath, loading } = useAuth();
  const router = useRouter();

  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [nit, setNit] = useState("");
  const [adminName, setAdminName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [phase, setPhase] = useState<FormPhase>("idle");
  const [clock, setClock] = useState(() =>
    new Date().toISOString().replace("T", " ").slice(0, 19),
  );

  useEffect(() => {
    if (!loading && user) router.replace(homePath);
  }, [loading, user, homePath, router]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setClock(new Date().toISOString().replace("T", " ").slice(0, 19));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage("");
    setPhase("loading");

    try {
      if (mode === "login") {
        const session = await authenticateNode(email, password, login);
        setPhase("success");
        router.replace(homePathForRole(session.user.role));
        return;
      }

      const logged = await register({
        organizationName: orgName,
        nit,
        adminName,
        adminEmail: email,
        adminPassword: password,
      });
      setPhase("success");
      router.replace(homePathForRole(logged.role));
    } catch (err) {
      setPhase("error");
      if (err instanceof AuthNodeError) {
        setErrorMessage(err.message);
      } else if (err instanceof Error && /fetch|network|ECONNREFUSED/i.test(err.message)) {
        setErrorMessage(AUTH_COPY.errors.NETWORK_SYNC_FAILURE);
      } else if (err instanceof Error && err.message) {
        const mapped =
          /credential|unauthorized|401|invalid|incorrect|wrong/i.test(err.message)
            ? AUTH_COPY.errors.NODE_CREDENTIALS_NOT_FOUND
            : err.message;
        setErrorMessage(mapped);
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
        ? "SYSTEM STATUS: NOMINAL // UPLINK IN PROGRESS"
        : AUTH_COPY.systemNominal;

  return (
    <div className="login-canvas relative flex min-h-screen flex-col">
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
              {mode === "login" ? AUTH_COPY.accessTitle : AUTH_COPY.registerTitle}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-secondary)]">
              {mode === "login"
                ? AUTH_COPY.accessSubtitle
                : AUTH_COPY.registerSubtitle}
            </p>
          </div>

          {mode === "register" ? (
            <div className="space-y-3">
              <div>
                <label className="field-label" htmlFor="orgName">
                  {AUTH_COPY.orgNameLabel}
                </label>
                <input
                  id="orgName"
                  className="login-field"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  required
                  disabled={isLoading}
                  autoComplete="organization"
                />
              </div>
              <div>
                <label className="field-label" htmlFor="nit">
                  {AUTH_COPY.nitLabel}
                </label>
                <input
                  id="nit"
                  className="login-field font-data"
                  value={nit}
                  onChange={(e) => setNit(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>
              <div>
                <label className="field-label" htmlFor="adminName">
                  {AUTH_COPY.adminNameLabel}
                </label>
                <input
                  id="adminName"
                  className="login-field"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  required
                  disabled={isLoading}
                  autoComplete="name"
                />
              </div>
            </div>
          ) : null}

          <div>
            <label className="field-label" htmlFor="nodeEmail">
              {AUTH_COPY.nodeEmailLabel}
            </label>
            <input
              id="nodeEmail"
              className="login-field"
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
            <input
              id="nodePassword"
              className="login-field font-data"
              type="password"
              placeholder={AUTH_COPY.passwordPlaceholder}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errorMessage) setErrorMessage("");
                if (phase === "error") setPhase("idle");
              }}
              required
              disabled={isLoading}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              minLength={6}
            />
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
                <span className="uplink-spinner" aria-hidden />
                <span>{AUTH_COPY.submitLoading}</span>
              </>
            ) : phase === "success" ? (
              AUTH_COPY.submitSuccess
            ) : mode === "login" ? (
              AUTH_COPY.submitIdle
            ) : (
              AUTH_COPY.registerSubmit
            )}
          </button>

          <div className="pt-1 text-center">
            {mode === "login" ? (
              <p className="text-xs text-[var(--text-secondary)]">
                {AUTH_COPY.registerHint}{" "}
                <button
                  type="button"
                  className="font-semibold text-[var(--accent-primary)] transition-colors duration-150 hover:underline"
                  onClick={() => {
                    setMode("register");
                    setErrorMessage("");
                    setPhase("idle");
                  }}
                  disabled={isLoading}
                >
                  {AUTH_COPY.registerCta}
                </button>
              </p>
            ) : (
              <button
                type="button"
                className="text-xs font-semibold text-[var(--accent-primary)] transition-colors duration-150 hover:underline"
                onClick={() => {
                  setMode("login");
                  setErrorMessage("");
                  setPhase("idle");
                }}
                disabled={isLoading}
              >
                {AUTH_COPY.backToLogin}
              </button>
            )}
          </div>
        </form>
      </div>

      <footer className="relative z-10 flex flex-col gap-1 px-4 pb-4 pt-2 sm:flex-row sm:items-end sm:justify-between sm:px-6">
        <p className="font-data text-[10px] uppercase tracking-[0.12em] text-[var(--text-secondary)]">
          {statusLine}
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 font-data text-[10px] tracking-wide text-[var(--text-secondary)]">
          <span className="gps-coord">{AUTH_COPY.coords}</span>
          <span className="timestamp-data">{clock}Z</span>
          <span className="hidden sm:inline">{AUTH_COPY.engineVersion}</span>
        </div>
      </footer>
    </div>
  );
}
