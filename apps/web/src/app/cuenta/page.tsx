"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@fsg/ui";
import { ShieldAlert, User, Shield } from "lucide-react";
import { api, setSession, getTokenPublic, type AuthUser } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { AuthLayout } from "@/components/nexa/auth-layout";
import { BentoPanel } from "@/components/nexa/bento-panel";
import { StatusPulseBadge } from "@/components/audit/KpiCard";

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

  const canSave =
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
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
          force ? "Contraseña actual (genérica de flota)" : "Contraseña actual"
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
          minLength={8}
          autoComplete="new-password"
        />
        <p className="mt-1.5 font-data text-[11px] text-brand-text-secondary">
          Mínimo 8 caracteres · distinta a la genérica
        </p>
      </div>
      <div>
        <input
          className="login-field font-sans"
          type="password"
          placeholder="Confirmar nueva contraseña"
          value={confirmPassword}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={8}
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
  const { user, logout } = useAuth();
  const router = useRouter();
  const [force, setForce] = useState(Boolean(user?.mustChangePassword));

  useEffect(() => {
    const q =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("force") === "1";
    setForce(q || Boolean(user?.mustChangePassword));
  }, [user?.mustChangePassword]);

  if (force) {
    return (
      <AuthLayout
        title="Activación de credenciales"
        subtitle="Debes definir una contraseña personal antes de acceder al centro de mando."
        statusLine="Cambio obligatorio · clave genérica detectada"
        statusTone="fatiga"
      >
        <div
          role="alert"
          className="mb-5 flex items-start gap-3 rounded-lg border border-brand-warning/40 bg-brand-warning/10 px-4 py-3"
        >
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-brand-warning" />
          <p className="font-sans text-sm text-brand-text-primary">
            Entraste con la clave genérica de flota. Define una contraseña
            personal para continuar.
          </p>
        </div>
        <PasswordForm
          force
          onDone={() => {
            window.location.href = "/";
          }}
        />
      </AuthLayout>
    );
  }

  return (
    <div className="fade-in mx-auto max-w-4xl space-y-6">
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

        <BentoPanel title="Seguridad" icon={<Shield className="h-4 w-4" />}>
          <PasswordForm force={false} onDone={() => {}} />
        </BentoPanel>
      </div>
    </div>
  );
}
