"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { api } from "@/lib/api";
import { HowToBox, PageIntro } from "@/components/page-intro";

type Order = {
  id: string;
  code: string;
  description: string;
  status: string;
  bayCode?: string | null;
  vehicle: { plate: string };
  timeEntries: Array<{ id: string; startedAt: string }>;
};

export default function MecanicoTechAppPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await api.get<Order[]>("/api/v1/taller/mecanico/mis-ordenes");
      setOrders(rows);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Uplink fallido");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleTimer(workOrderId: string, running: boolean) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.post<{ message: string; durationSec?: number }>(
        "/api/v1/taller/mecanico/time-tracking",
        {
          workOrderId,
          action: running ? "STOP" : "START",
          taskLabel: "EJECUCION",
        },
      );
      setMsg(res.message);
      setActiveId(running ? null : workOrderId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Timer fallido");
    } finally {
      setBusy(false);
    }
  }

  async function hallazgo(workOrderId: string) {
    setBusy(true);
    try {
      const res = await api.post<{ message: string; transcript: string | null }>(
        "/api/v1/taller/mecanico/hallazgo",
        {
          workOrderId,
          photoRef: `uploads/taller/hallazgo-${Date.now()}.jpg`,
          voiceRef: `uploads/taller/voz-${Date.now()}.webm`,
          notes: "Ruido en freno delantero derecho",
        },
      );
      setMsg(`${res.message}${res.transcript ? ` · ${res.transcript}` : ""}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hallazgo fallido");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 px-2 py-4">
      <PageIntro module="taller" title="FSG Tech App" />
      <HowToBox
        steps={[
          "Modo Grease-Proof: botones grandes, alto contraste.",
          "Inicie/detenga el cronómetro por tarea.",
          "Capture hallazgo con foto + voz (IA a texto) para el Coordinador.",
        ]}
      />

      {error && (
        <p className="rounded-xl bg-[var(--fl-critical)]/15 p-4 font-mono text-base text-[var(--fl-critical)]">
          {error}
        </p>
      )}
      {msg && (
        <p className="rounded-xl bg-[var(--fl-accent)]/15 p-4 font-mono text-base text-[var(--fl-accent)]">
          {msg}
        </p>
      )}

      <ul className="space-y-4">
        {orders.map((o) => {
          const running =
            (o.timeEntries?.length ?? 0) > 0 || activeId === o.id;
          return (
            <li
              key={o.id}
              className="rounded-2xl border-2 border-[var(--fl-border)] bg-[var(--fl-surface)] p-5"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-xl font-bold text-[var(--fl-text)]">
                    {o.vehicle.plate}
                  </p>
                  <p className="font-mono text-sm text-[var(--fl-subtext)]">
                    {o.code} · {o.bayCode ?? "—"}
                  </p>
                </div>
                <Badge tone={running ? "amber" : "slate"}>{o.status}</Badge>
              </div>
              <p className="mt-3 text-base text-[var(--fl-text)]">
                {o.description}
              </p>
              <div className="mt-5 grid grid-cols-1 gap-3">
                <Button
                  className="!min-h-[64px] !text-lg"
                  disabled={busy}
                  onClick={() => void toggleTimer(o.id, running)}
                >
                  {running ? "DETENER TIMER" : "INICIAR TIMER"}
                </Button>
                <Button
                  className="!min-h-[64px] !text-lg"
                  disabled={busy}
                  onClick={() => void hallazgo(o.id)}
                >
                  FOTO + VOZ
                </Button>
              </div>
            </li>
          );
        })}
        {!orders.length && (
          <li className="rounded-2xl border border-[var(--fl-border)] p-6 text-center text-[var(--fl-subtext)]">
            Sin OT asignadas
          </li>
        )}
      </ul>
    </div>
  );
}
