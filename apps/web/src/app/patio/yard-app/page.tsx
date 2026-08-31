"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { api } from "@/lib/api";
import { statusEs } from "@fsg/shared";
import { BentoPanel } from "@/components/nexa/bento-panel";

type YardApp = {
  washQueue: Array<{
    id: string;
    plate: string;
    priority: number;
    status: string;
    bayCode?: string | null;
  }>;
  yardMoves: Array<{
    id: string;
    laneCode: string;
    bayCode: string;
    plate: string | null;
    scheduledDepartAt?: string | null;
  }>;
};

export default function AuxiliarYardAppPage() {
  const [data, setData] = useState<YardApp | null>(null);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api.get<YardApp>("/api/v1/patio/auxiliar/yard-app");
      setData(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ConexiÃ³n fallida");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const card = data?.washQueue[index];

  async function completeWash() {
    if (!card) return;
    setBusy(true);
    try {
      await api.post("/api/v1/patio/lavado/completar", {
        washJobId: card.id,
        notes: "Lavado correcto â€” huella hÃºmeda",
      });
      setMsg(`Lavado ${card.plate} completado`);
      setIndex(0);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fallo lavado");
    } finally {
      setBusy(false);
    }
  }

  async function yardMove(slot: YardApp["yardMoves"][0]) {
    if (!slot.plate) return;
    setBusy(true);
    try {
      const res = await api.post<{ message: string }>("/api/v1/patio/yard-move", {
        plate: slot.plate,
        fromLane: slot.laneCode,
        toLane: "LIFO-A",
        toBay: "A01",
        scheduledDepartAt: slot.scheduledDepartAt,
      });
      setMsg(res.message);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Movimiento de patio fallido");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 p-4 pb-24">
      <header className="border-b border-brand-border pb-4">
        <p className="font-data text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-primary">
          Patio
        </p>
        <h1 className="font-sans text-2xl font-semibold text-brand-text-primary">
          App de patio
        </h1>
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

      {card ? (
        <div className="rounded-2xl border-2 border-[var(--brand-border)] bg-[var(--brand-surface)] p-6 shadow-brand-panel">
          <div className="mb-2 flex justify-between">
            <Badge tone="warning">P{card.priority}</Badge>
            <Badge tone="neutral">{statusEs(card.status)}</Badge>
          </div>
          <p className="font-mono text-4xl tracking-tight text-[var(--brand-text-primary)]">
            {card.plate}
          </p>
          <p className="mt-2 text-sm text-[var(--brand-text-secondary)]">
            BahÃ­a {card.bayCode || "â€”"}
          </p>
          <div className="mt-8 grid grid-cols-2 gap-4">
            <Button
              className="!h-16 !text-lg"
              disabled={busy}
              onClick={() => setIndex((i) => i + 1)}
            >
              Skip
            </Button>
            <Button
              className="!h-16 !text-lg"
              disabled={busy}
              onClick={() => void completeWash()}
            >
              Lavado correcto
            </Button>
          </div>
        </div>
      ) : (
        <p className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-8 text-center text-[var(--brand-text-secondary)]">
          Cola de lavado vacÃ­a â€” nominal
        </p>
      )}

      <section>
        <h2 className="mb-3 font-display text-lg">Movimientos de patio</h2>
        <ul className="space-y-3">
          {(data?.yardMoves || []).map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4"
            >
              <div>
                <p className="font-mono text-xl">{m.plate}</p>
                <p className="text-xs text-[var(--brand-text-secondary)]">
                  {m.laneCode}/{m.bayCode}
                </p>
              </div>
              <Button
                className="!h-14 !min-w-[7rem]"
                disabled={busy || !m.plate}
                onClick={() => void yardMove(m)}
              >
                Mover
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
