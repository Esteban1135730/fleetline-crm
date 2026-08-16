"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { api } from "@/lib/api";
import { statusEs } from "@fsg/shared";
import { HowToBox, PageIntro } from "@/components/page-intro";

type Dash = {
  inventory: { count: number; inYard: Array<{ plate: string; checkedInAt: string }> };
  yardMap: Array<{
    id: string;
    laneCode: string;
    bayCode: string;
    plate: string | null;
    status: string;
    scheduledDepartAt?: string | null;
  }>;
  washQueue: Array<{ id: string; plate: string; priority: number; status: string }>;
  talanquera: Array<{
    id: string;
    plate: string;
    gateOpened: boolean;
    denied: boolean;
    denyReason: string | null;
  }>;
};

export default function CoordinadorPatioDashboard() {
  const [dash, setDash] = useState<Dash | null>(null);
  const [plate, setPlate] = useState("BOG-892");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api.get<Dash>("/api/v1/patio/coordinador/dashboard");
      setDash(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Conexión fallida");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function lprCheck() {
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const res = await api.post<{
        gateOpened: boolean;
        message: string;
        trip?: { code: string } | null;
      }>("/api/v1/patio/talanquera/lpr-check", { plate });
      setMsg(
        `${res.message}${res.trip ? ` · Viaje ${res.trip.code}` : ""}`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bloqueo de talanquera");
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <PageIntro module="parqueadero" title="Patio inteligente" />
      <HowToBox
        steps={[
          "Yard Map muestra bahías LIFO por hora de salida.",
          "LPR valida viaje activo + docs jurídicos + alcoholimetría.",
          "El bloqueo operativo dispara alarma si falla cualquier control.",
        ]}
      />

      {error && (
        <p className="rounded-lg border border-[var(--fl-critical)]/40 bg-[var(--fl-critical)]/10 px-4 py-3 font-mono text-sm text-[var(--fl-critical)]">
          {error}
        </p>
      )}
      {msg && (
        <p className="rounded-lg border border-[var(--fl-accent)]/30 bg-[var(--fl-accent)]/10 px-4 py-3 text-sm text-[var(--fl-text)]">
          {msg}
        </p>
      )}

      <section
        id="talanquera"
        className="rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-5"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-display text-lg text-[var(--fl-text)]">
            Consola Talanquera
          </h2>
          <Badge tone="neutral">LPR / QR</Badge>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-[var(--fl-subtext)]">
            Placa
            <input
              className="rounded-md border border-[var(--fl-border)] bg-[var(--fl-canvas)] px-3 py-2 font-mono text-sm text-[var(--fl-text)]"
              value={plate}
              onChange={(e) => setPlate(e.target.value.toUpperCase())}
            />
          </label>
          <Button disabled={busy} onClick={() => void lprCheck()}>
            Validar salida por placa
          </Button>
        </div>
        <ul className="mt-4 space-y-2">
          {(dash?.talanquera || []).map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between rounded-lg border border-[var(--fl-border)] px-3 py-2 text-sm"
            >
              <span className="font-mono">{t.plate}</span>
              <Badge tone={t.gateOpened ? "success" : "danger"}>
                {t.gateOpened ? "ABIERTA" : t.denyReason || "BLOQUEO OPERATIVO"}
              </Badge>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-5">
        <h2 className="mb-4 font-display text-lg text-[var(--fl-text)]">
          Yard Map · LIFO
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(dash?.yardMap || []).map((s) => (
            <div
              key={s.id}
              className="rounded-lg border border-[var(--fl-border)] bg-[var(--fl-canvas)] p-3"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm text-[var(--fl-accent)]">
                  {s.laneCode}/{s.bayCode}
                </span>
                <Badge tone={s.status === "OCCUPIED" ? "warning" : "neutral"}>
                  {statusEs(s.status)}
                </Badge>
              </div>
              <p className="mt-2 font-mono text-lg text-[var(--fl-text)]">
                {s.plate || "—"}
              </p>
              {s.scheduledDepartAt && (
                <p className="mt-1 font-mono text-xs text-[var(--fl-subtext)]">
                  Salida {new Date(s.scheduledDepartAt).toLocaleString()}
                </p>
              )}
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm text-[var(--fl-subtext)]">
          En patio: {dash?.inventory.count ?? 0} unidades
        </p>
      </section>

      <section className="rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-5">
        <h2 className="mb-3 font-display text-lg">Cola de lavado</h2>
        <ul className="space-y-2">
          {(dash?.washQueue || []).map((w) => (
            <li
              key={w.id}
              className="flex justify-between rounded-lg border border-[var(--fl-border)] px-3 py-2 font-mono text-sm"
            >
              <span>{w.plate}</span>
              <span className="text-[var(--fl-subtext)]">
                P{w.priority} · {statusEs(w.status)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
