"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { Camera, Timer } from "lucide-react";
import { api } from "@/lib/api";
import { statusEs } from "@fsg/shared";
import { EmptyState } from "@/components/audit";
import { BentoPanel } from "@/components/nexa/bento-panel";

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
      setError(e instanceof Error ? e.message : "Conexión fallida");
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
      setError(e instanceof Error ? e.message : "Cronómetro fallido");
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
    <div className="fade-in mx-auto max-w-lg space-y-5 px-3 py-4">
      <header className="border-b border-brand-border pb-4">
        <p className="font-data text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-primary">
          Taller · Técnico
        </p>
        <h1 className="font-sans text-2xl font-semibold tracking-tight text-brand-text-primary">
          App del mecánico
        </h1>
        <p className="mt-1 font-sans text-sm text-brand-text-secondary">
          Grease-proof · botones grandes · alto contraste
        </p>
      </header>

      {error ? (
        <p className="rounded-xl border border-brand-danger/40 bg-brand-danger/15 p-4 font-data text-base text-brand-danger">
          {error}
        </p>
      ) : null}
      {msg ? (
        <p className="rounded-xl border border-brand-primary/40 bg-brand-primary/15 p-4 font-data text-base text-brand-primary">
          {msg}
        </p>
      ) : null}

      {!orders.length ? (
        <EmptyState
          icon={<Timer className="h-7 w-7" />}
          title="Sin OT asignadas"
          description="El coordinador asignará órdenes a su bahía."
        />
      ) : (
        <ul className="space-y-4">
          {orders.map((o) => {
            const running =
              (o.timeEntries?.length ?? 0) > 0 || activeId === o.id;
            return (
              <li key={o.id}>
                <BentoPanel
                  title={o.vehicle.plate}
                  subtitle={`${o.code} · ${o.bayCode ?? "—"}`}
                  action={
                    <Badge tone={running ? "warning" : "info"}>
                      {statusEs(o.status)}
                    </Badge>
                  }
                >
                  <p className="font-sans text-base text-brand-text-primary">
                    {o.description}
                  </p>
                  <div className="mt-5 grid grid-cols-1 gap-3">
                    <Button
                      className="!min-h-[64px] w-full !text-lg"
                      disabled={busy}
                      onClick={() => void toggleTimer(o.id, running)}
                    >
                      <Timer className="mr-2 inline h-5 w-5" aria-hidden />
                      {running ? "DETENER TIMER" : "INICIAR TIMER"}
                    </Button>
                    <Button
                      variant="secondary"
                      className="!min-h-[64px] w-full !text-lg"
                      disabled={busy}
                      onClick={() => void hallazgo(o.id)}
                    >
                      <Camera className="mr-2 inline h-5 w-5" aria-hidden />
                      FOTO + VOZ
                    </Button>
                  </div>
                </BentoPanel>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
