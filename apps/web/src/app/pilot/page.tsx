"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { api } from "@/lib/api";

type Dash = {
  speedLockKph: number;
  trips: Array<{
    id: string;
    code: string;
    status: string;
    plate?: string;
    preopDone: boolean;
    origin: string;
    destination: string;
  }>;
  scoreCard: {
    safety: number;
    punctuality: number;
    fuelEfficiency: number;
  };
  fuelWallet: Array<{ tokenQr: string; amountCop: string | number }>;
};

export default function PilotAppPage() {
  const [dash, setDash] = useState<Dash | null>(null);
  const [speed, setSpeed] = useState(0);
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api.get<Dash>("/api/v1/pilot/dashboard");
      setDash(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ConexiÃƒÂ³n fallida");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function checkSpeed(kph: number) {
    setSpeed(kph);
    try {
      const res = await api.post<{ touchLocked: boolean; message: string }>(
        "/api/v1/pilot/speed-lock",
        { speedKph: kph },
      );
      setLocked(res.touchLocked);
      if (res.touchLocked) setMsg(res.message);
    } catch {
      setLocked(kph > 15);
    }
  }

  async function preop(tripId: string) {
    setBusy(true);
    try {
      const res = await api.post<{ message: string }>(
        "/api/v1/pilot/preoperacional",
        {
          tripId,
          brakesOk: true,
          lightsOk: true,
          tiresOk: true,
          kitOk: true,
          oilOk: true,
          photoRefs: [`uploads/pilot/preop-${Date.now()}.jpg`],
        },
      );
      setMsg(res.message);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preoperacional bloqueado");
    } finally {
      setBusy(false);
    }
  }

  async function sos(category: "CHOQUE" | "FALLA_MECANICA" | "ORDEN_PUBLICO") {
    setBusy(true);
    try {
      const res = await api.post<{ message: string; voipChannel: string }>(
        "/api/v1/pilot/sos",
        { category, plate: dash?.trips[0]?.plate, speedKph: speed },
      );
      setMsg(`${res.message} Ã‚Â· ${res.voipChannel}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "SOS fallido");
    } finally {
      setBusy(false);
    }
  }

  async function fuelToken() {
    setBusy(true);
    try {
      const res = await api.post<{ message: string; tokenQr: string }>(
        "/api/v1/pilot/viatico/token",
        { amountCop: 150000, plate: dash?.trips[0]?.plate },
      );
      setMsg(`${res.message} Ã‚Â· ${res.tokenQr}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Token fallido");
    } finally {
      setBusy(false);
    }
  }

  if (locked) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center bg-[var(--brand-canvas)] p-6 text-center text-[var(--brand-text-primary)]">
        <p className="font-mono text-5xl text-brand-warning">{speed} km/h</p>
        <p className="mt-4 text-lg text-[var(--brand-text-secondary)]">
          Modo conductor Ã‚Â· pantalla bloqueada
        </p>
        <p className="mt-2 text-sm text-[var(--brand-text-secondary)]">
          Umbral {dash?.speedLockKph ?? 15} km/h
        </p>
        <Button
          className="mt-10 !h-16 !min-w-[12rem] !bg-brand-danger"
          disabled={busy}
          onClick={() => void sos("CHOQUE")}
        >
          SOS
        </Button>
        <button
          type="button"
          className="mt-6 text-xs text-[var(--brand-text-secondary)] underline"
          onClick={() => void checkSpeed(0)}
        >
          Simular detenciÃƒÂ³n
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 p-4 pb-24">
      <header>
        <h1 className="font-sans text-lg font-semibold tracking-tight text-brand-text-primary">
          NEXA Pilot
        </h1>
        <p className="mt-1 font-data text-[10px] uppercase tracking-[0.14em] text-brand-text-secondary">
          App del conductor
        </p>
      </header>

      {error && (
        <p className="rounded-xl border border-[var(--brand-danger)]/40 bg-[var(--brand-danger)]/10 p-4 font-mono text-sm text-[var(--brand-danger)]">
          {error}
        </p>
      )}
      {msg && (
        <p className="rounded-xl border border-[var(--brand-primary)]/30 bg-[var(--brand-primary)]/10 p-4 text-sm">
          {msg}
        </p>
      )}

      <div className="grid grid-cols-3 gap-2">
        {[0, 12, 42].map((k) => (
          <Button
            key={k}
            className="!h-12"
            onClick={() => void checkSpeed(k)}
          >
            {k} km/h
          </Button>
        ))}
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-lg">Viajes asignados</h2>
        {(dash?.trips || []).map((t) => (
          <div
            key={t.id}
            className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4"
          >
            <div className="flex justify-between">
              <span className="font-mono">{t.code}</span>
              <Badge tone={t.preopDone ? "success" : "warning"}>
                {t.preopDone ? "Preoperacional listo" : "Preoperacional pendiente"}
              </Badge>
            </div>
            <p className="mt-1 font-mono text-sm text-[var(--brand-text-secondary)]">
              {t.plate || "Ã¢â‚¬â€"} Ã‚Â· {t.origin} Ã¢â€ â€™ {t.destination}
            </p>
            {!t.preopDone && (
              <Button
                className="mt-3 !h-14 w-full"
                disabled={busy}
                onClick={() => void preop(t.id)}
              >
                Enviar preoperacional
              </Button>
            )}
          </div>
        ))}
        {!dash?.trips?.length && (
          <p className="text-sm text-[var(--brand-text-secondary)]">
            Sin viajes activos Ã¢â‚¬â€ score card disponible
          </p>
        )}
      </section>

      <section className="grid grid-cols-3 gap-3">
        <Button
          className="!h-16 !bg-[var(--brand-danger)]"
          disabled={busy}
          onClick={() => void sos("CHOQUE")}
        >
          Choque
        </Button>
        <Button
          className="!h-16"
          disabled={busy}
          onClick={() => void sos("FALLA_MECANICA")}
        >
          Falla
        </Button>
        <Button
          className="!h-16"
          disabled={busy}
          onClick={() => void sos("ORDEN_PUBLICO")}
        >
          Orden P.
        </Button>
      </section>

      <Button className="!h-14 w-full" disabled={busy} onClick={() => void fuelToken()}>
        Emitir token QR tanqueo
      </Button>

      {dash?.scoreCard && (
        <section className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-5">
          <h2 className="mb-3 font-display text-lg">Tarjeta de puntaje del dÃƒÂ­a</h2>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="font-mono text-2xl text-[var(--brand-primary)]">
                {dash.scoreCard.safety}
              </p>
              <p className="text-xs text-[var(--brand-text-secondary)]">Seguridad</p>
            </div>
            <div>
              <p className="font-mono text-2xl text-[var(--brand-warning)]">
                {dash.scoreCard.punctuality}
              </p>
              <p className="text-xs text-[var(--brand-text-secondary)]">Puntualidad</p>
            </div>
            <div>
              <p className="font-mono text-2xl text-[var(--brand-text-primary)]">
                {dash.scoreCard.fuelEfficiency}
              </p>
              <p className="text-xs text-[var(--brand-text-secondary)]">Combustible</p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
