"use client";

import { FormEvent, Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@fsg/ui";
import { api } from "@/lib/api";

function OnboardingForm() {
  const params = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/auth/onboarding", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "El enlace no es válido");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="font-display text-2xl font-semibold text-[var(--brand-text-primary)]">
        Define tu clave
      </h1>
      <p className="mt-2 text-sm text-[var(--brand-text-secondary)]">
        El enlace es de un solo uso. Después entras con tu correo y esta clave.
      </p>
      {done ? (
        <a href="/login" className="mt-6 text-sm text-[var(--brand-primary)]">
          Ir al acceso
        </a>
      ) : (
        <form className="mt-6 space-y-3" onSubmit={onSubmit}>
          <input
            className="field w-full"
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Nueva clave"
            required
          />
          {error ? <p className="text-sm text-[var(--brand-danger)]">{error}</p> : null}
          <Button type="submit" variant="primary" className="w-auto px-4 py-2" disabled={busy || !token}>
            Guardar clave
          </Button>
        </form>
      )}
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingForm />
    </Suspense>
  );
}
