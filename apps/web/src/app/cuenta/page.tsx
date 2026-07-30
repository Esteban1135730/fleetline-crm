"use client";

import { FormEvent, useState } from "react";
import { Button } from "@fsg/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { HowToBox, PageIntro } from "@/components/page-intro";

export default function CuentaPage() {
  const { user } = useAuth();
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMsg("");
    setError("");
    try {
      await api("/auth/password", {
        method: "PATCH",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrent("");
      setNew("");
      setMsg("Contraseña actualizada");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  return (
    <div className="fade-in mx-auto max-w-xl space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--brand-primary)]">
          Cuenta
        </p>
        <h2 className="page-title mt-1 text-3xl">Mi cuenta</h2>
        <p className="page-sub">
          {user?.name} · {user?.email}
        </p>
      </div>
      <HowToBox
        steps={[
          "Cambia tu contraseña con la clave actual.",
          "Mínimo 6 caracteres en la nueva clave.",
        ]}
      />
      <form onSubmit={onSubmit} className="fsg-panel space-y-3 p-4">
        <input
          className="field"
          type="password"
          placeholder="Contraseña actual"
          value={currentPassword}
          onChange={(e) => setCurrent(e.target.value)}
          required
        />
        <input
          className="field"
          type="password"
          placeholder="Nueva contraseña"
          value={newPassword}
          onChange={(e) => setNew(e.target.value)}
          required
          minLength={6}
        />
        <Button type="submit" variant="primary">
          Guardar contraseña
        </Button>
        {msg ? <p className="text-sm text-emerald-600">{msg}</p> : null}
        {error ? (
          <p className="text-sm text-[var(--brand-signal)]">{error}</p>
        ) : null}
      </form>
    </div>
  );
}
