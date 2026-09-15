"use client";

import { Eye, EyeOff } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { homePathForRole, useAuth } from "@/lib/auth-context";
import { authenticateNode } from "@/lib/auth-mock";
import { AUTH_COPY, AuthNodeError } from "@/lib/auth-types";
import { AuthLayout } from "@/components/nexa/auth-layout";

type FormPhase = "idle" | "loading" | "success" | "error";

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

  const statusTone =
    phase === "error" ? "danger" : phase === "loading" ? "fatiga" : "active";

  const statusLine =
    phase === "error"
      ? AUTH_COPY.systemAlert
      : phase === "loading"
        ? AUTH_COPY.systemOffline
        : AUTH_COPY.systemNominal;

  return (
    <AuthLayout
      title={AUTH_COPY.accessTitle}
      subtitle={AUTH_COPY.accessSubtitle}
      statusLine={statusLine}
      statusTone={statusTone}
      clock={clock}
      footerExtra={AUTH_COPY.coords}
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <div>
          <label className="field-label" htmlFor="nodeEmail">
            {AUTH_COPY.nodeEmailLabel}
          </label>
          <input
            id="nodeEmail"
            className="login-field font-sans"
            type="email"
            data-field="email"
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
              className="login-field w-full pr-11 font-data"
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
              minLength={8}
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-text-secondary transition-colors hover:text-brand-primary"
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
            <p className="max-w-[16rem] text-right font-sans text-xs text-brand-text-secondary">
              ¿Olvidaste tu clave? Contacta a tu administrador o RRHH para un
              reset temporal.
            </p>
          </div>
        </div>

        {errorMessage ? (
          <div
            role="alert"
            className="rounded-lg border border-brand-danger/40 bg-brand-danger/10 px-3 py-2.5"
          >
            <p className="font-data text-[11px] font-medium tracking-wide text-brand-danger">
              {errorMessage}
            </p>
          </div>
        ) : null}

        {phase === "success" ? (
          <div className="rounded-lg border border-brand-primary/40 bg-brand-primary/10 px-3 py-2.5">
            <p className="font-data text-[11px] font-medium tracking-wide text-brand-primary">
              {AUTH_COPY.submitSuccess}
            </p>
          </div>
        ) : null}

        <div className="flex justify-end pt-1">
          <button
            type="submit"
            disabled={isLoading || phase === "success"}
            className="login-submit flex w-auto items-center justify-center gap-2 px-8 py-2.5 text-sm"
          >
            {isLoading ? (
              <>
                <span className="uplink-spinner" aria-hidden />
                <span>{AUTH_COPY.submitLoading}</span>
              </>
            ) : phase === "success" ? (
              AUTH_COPY.submitSuccess
            ) : (
              AUTH_COPY.submitIdle
            )}
          </button>
        </div>
      </form>
    </AuthLayout>
  );
}
