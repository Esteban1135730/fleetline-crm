"use client";

import { FormEvent, useMemo, useState } from "react";
import { Button } from "@fsg/ui";
import { User, Shield } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

function initials(name?: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export default function CuentaPage() {
  const { user } = useAuth();
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirmPassword, setConfirm] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const passwordsMatch = useMemo(
    () => newPassword.length > 0 && newPassword === confirmPassword,
    [newPassword, confirmPassword],
  );

  const canSave =
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    passwordsMatch;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setMsg("");
    setError("");
    try {
      await api("/auth/password", {
        method: "PATCH",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrent("");
      setNew("");
      setConfirm("");
      setMsg("Contraseña actualizada");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  return (
    <div className="fade-in mx-auto max-w-4xl space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--brand-primary)]">
          Cuenta
        </p>
        <h2 className="page-title mt-1 text-3xl">Mi cuenta</h2>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <article className="fsg-panel flex flex-col items-start gap-4 p-5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            <User className="h-3.5 w-3.5" aria-hidden />
            Perfil
          </div>
          <div
            className="flex h-16 w-16 items-center justify-center rounded-full border border-slate-700 bg-slate-800 font-mono text-lg font-semibold text-slate-100"
            aria-hidden
          >
            {initials(user?.name)}
          </div>
          <div>
            <p className="text-lg font-semibold text-slate-100">
              {user?.name || "—"}
            </p>
            <p className="mt-1 font-mono text-xs uppercase tracking-wide text-amber-400/90">
              {user?.role || "—"}
            </p>
            <p className="mt-2 text-sm text-slate-400">{user?.email || "—"}</p>
          </div>
        </article>

        <article className="fsg-panel p-5">
          <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            <Shield className="h-3.5 w-3.5" aria-hidden />
            Seguridad
          </div>
          <form onSubmit={onSubmit} className="space-y-3">
            <input
              className="field h-11 min-h-[44px]"
              type="password"
              placeholder="Contraseña actual"
              value={currentPassword}
              onChange={(e) => setCurrent(e.target.value)}
              required
              autoComplete="current-password"
            />
            <div>
              <input
                className="field h-11 min-h-[44px]"
                type="password"
                placeholder="Nueva contraseña"
                data-field="password"
                value={newPassword}
                onChange={(e) => setNew(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
              <p className="mt-1.5 text-xs text-gray-400">
                Mínimo 8 caracteres. Usa una clave distinta a la actual.
              </p>
            </div>
            <div>
              <input
                className="field h-11 min-h-[44px]"
                type="password"
                placeholder="Confirmar nueva contraseña"
                data-field="password"
                value={confirmPassword}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
              {confirmPassword.length > 0 && !passwordsMatch ? (
                <p className="mt-1.5 text-xs text-rose-400">
                  Las contraseñas no coinciden
                </p>
              ) : null}
            </div>
            <div className="flex justify-end pt-1">
              <Button
                type="submit"
                variant="primary"
                className="w-auto px-4 py-2"
                disabled={!canSave}
              >
                Guardar contraseña
              </Button>
            </div>
            {msg ? <p className="text-sm text-emerald-600">{msg}</p> : null}
            {error ? (
              <p className="text-sm text-[var(--brand-signal)]">{error}</p>
            ) : null}
          </form>
        </article>
      </div>
    </div>
  );
}
