"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@fsg/ui";
import { Compass, ShieldAlert, User, Shield } from "lucide-react";
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_POLICY_MESSAGE,
  checkPasswordPolicy,
} from "@fsg/shared";
import { api, setSession, getTokenPublic, type AuthUser } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { AuthLayout } from "@/components/nexa/auth-layout";
import { BentoPanel } from "@/components/nexa/bento-panel";
import { StatusPulseBadge } from "@/components/audit/KpiCard";
import { useTourOptional } from "@/lib/tour-context";
import { resetTour } from "@/lib/tour-storage";
import { tourIdForPath } from "@/lib/tour-definitions";

function initials(name?: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function PasswordForm({
  force,
  onDone,
}: {
  force: boolean;
  onDone: () => void;
}) {
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirmPassword, setConfirm] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const passwordsMatch = useMemo(
    () => newPassword.length > 0 && newPassword === confirmPassword,
    [newPassword, confirmPassword],
  );

  const policy = useMemo(
    () => checkPasswordPolicy(newPassword),
    [newPassword],
  );

  const canSave =
    currentPassword.length > 0 &&
    policy.ok &&
    passwordsMatch &&
    newPassword !== currentPassword;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setMsg("");
    setError("");
    setBusy(true);
    try {
      await api("/auth/password", {
        method: "PATCH",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const me = await api<AuthUser>("/auth/me");
      const token = getTokenPublic();
      if (token) setSession(token, me);
      setCurrent("");
      setNew("");
      setConfirm("");
      setMsg("Contraseña actualizada — uplink nominal");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input
        className="login-field font-sans"
        type="password"
        placeholder={
          force
            ? "Contraseña temporal actual"
            : "Contraseña actual"
        }
        value={currentPassword}
        onChange={(e) => setCurrent(e.target.value)}
        required
        autoComplete="current-password"
        autoFocus={force}
      />
      <div>
        <input
          className="login-field font-sans"
          type="password"
          placeholder="Nueva contraseña"
          data-field="password"
          value={newPassword}
          onChange={(e) => setNew(e.target.value)}
          required
          minLength={PASSWORD_MIN_LENGTH}
          autoComplete="new-password"
        />
        <p className="mt-1.5 font-data text-[11px] text-brand-text-secondary">
          {PASSWORD_POLICY_MESSAGE}
        </p>
        {newPassword.length > 0 && !policy.ok ? (
          <p className="mt-1 font-data text-[11px] text-brand-danger">
            {policy.message}
          </p>
        ) : null}
      </div>
      <div>
        <input
          className="login-field font-sans"
          type="password"
          placeholder="Confirmar nueva contraseña"
          value={confirmPassword}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={PASSWORD_MIN_LENGTH}
          autoComplete="new-password"
        />
        {confirmPassword.length > 0 && !passwordsMatch ? (
          <p className="mt-1.5 font-data text-[11px] text-brand-danger">
            Las contraseñas no coinciden
          </p>
        ) : null}
      </div>
      <div className="flex justify-end pt-1">
        <button
          type="submit"
          disabled={!canSave || busy}
          className="login-submit w-auto px-8 py-2.5 text-sm disabled:opacity-60"
        >
          {busy ? "Guardando…" : force ? "Guardar y entrar" : "Guardar contraseña"}
        </button>
      </div>
      {msg ? (
        <p className="font-data text-sm text-brand-success">{msg}</p>
      ) : null}
      {error ? (
        <p className="font-data text-sm text-brand-danger">{error}</p>
      ) : null}
    </form>
  );
}

export default function CuentaPage() {
  const { user, logout, homePath } = useAuth();
  const router = useRouter();
  const tour = useTourOptional();
  const [force, setForce] = useState(Boolean(user?.mustChangePassword));

  useEffect(() => {
    const q =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("force") === "1";
    setForce(q || Boolean(user?.mustChangePassword));
  }, [user?.mustChangePassword]);

  function backToLogin() {
    void api("/auth/logout", { method: "POST" }).catch(() => undefined);
    logout();
    router.replace("/login");
  }

  if (force) {
    return (
      <AuthLayout
        title="Activación de credenciales"
        subtitle="Debes definir una contraseña personal segura antes de acceder al centro de mando."
        statusLine="Cambio obligatorio · clave temporal"
        statusTone="fatiga"
      >
        <div
          role="alert"
          className="mb-5 flex items-start gap-3 rounded-lg border border-brand-warning/40 bg-brand-warning/10 px-4 py-3"
        >
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-brand-warning" />
          <p className="font-sans text-sm text-brand-text-primary">
            Entraste con una clave temporal o genérica. Define una contraseña
            personal que cumpla la política de seguridad para continuar.
          </p>
        </div>
        <PasswordForm
          force
          onDone={() => {
            window.location.href = homePath || "/";
          }}
        />
        <div className="mt-6 flex flex-col items-center gap-2 border-t border-brand-border pt-4">
          <p className="text-center font-sans text-xs text-brand-text-secondary">
            Si no puedes cambiar la clave ahora, cierra sesión y vuelve al
            inicio.
          </p>
          <Button
            type="button"
            variant="ghost"
            className="w-auto px-4 py-2 text-sm"
            onClick={backToLogin}
          >
            Volver al inicio de sesión
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <div className="fade-in mx-auto max-w-4xl space-y-6" data-tour="panel">
      <header>
        <p className="font-data text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-primary">
          Cuenta
        </p>
        <h2 className="page-title mt-1 text-3xl">Mi cuenta</h2>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <BentoPanel
          title="Perfil operativo"
          icon={<User className="h-4 w-4" />}
          tour="primary"
        >
          <div className="flex flex-col items-start gap-4">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-full border border-brand-border bg-brand-surface-elevated font-data text-lg font-semibold text-brand-text-primary"
              aria-hidden
            >
              {initials(user?.name)}
            </div>
            <div>
              <p className="font-sans text-lg font-semibold text-brand-text-primary">
                {user?.name || "—"}
              </p>
              <StatusPulseBadge tone="active" pulse={false}>
                {user?.role || "—"}
              </StatusPulseBadge>
              <p className="mt-2 font-data text-sm text-brand-text-secondary">
                {user?.email || "—"}
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              className="mt-auto w-auto px-4 py-2"
              onClick={() => {
                logout();
                router.replace("/login");
              }}
            >
              Cerrar sesión
            </Button>
          </div>
        </BentoPanel>

        <BentoPanel title="Seguridad" icon={<Shield className="h-4 w-4" />} tour="secondary">
          <PasswordForm force={false} onDone={() => {}} />
        </BentoPanel>
      </div>

      {tour ? (
        <BentoPanel
          title="Recorrido guiado"
          icon={<Compass className="h-4 w-4" />}
          subtitle="Tutorial interactivo por pantalla"
          tour="panel"
        >
          <div className="space-y-4">
            <p className="font-sans text-sm text-brand-text-secondary">
              La primera vez que entra a NEXA OS y a cada área, un recorrido señala
              los controles clave. Puede repetirlo cuando quiera.
            </p>
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-brand-border/70 bg-brand-surface/40 px-3 py-2.5">
              <span className="font-sans text-sm text-brand-text-primary">
                Mostrar al entrar a un área nueva
              </span>
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--brand-primary)]"
                checked={tour.autoEnabled}
                onChange={(e) => tour.setAutoEnabled(e.target.checked)}
              />
            </label>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                className="w-auto px-4 py-2"
                onClick={() => {
                  resetTour(tourIdForPath("/cuenta"));
                  tour.startTourForCurrent();
                }}
              >
                Recorrido de esta pantalla
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="w-auto px-4 py-2"
                onClick={() => {
                  tour.replayAll();
                  router.push(homePath || "/dashboard");
                }}
              >
                Repetir recorrido completo
              </Button>
            </div>
          </div>
        </BentoPanel>
      ) : null}
    </div>
  );
}
