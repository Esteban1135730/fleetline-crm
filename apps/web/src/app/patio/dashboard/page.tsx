"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import {
  Ban,
  Droplets,
  LogIn,
  ParkingSquare,
  ShieldAlert,
} from "lucide-react";
import { api } from "@/lib/api";
import { statusEs } from "@fsg/shared";
import { PageIntro } from "@/components/page-intro";
import {
  EmptyState,
  KpiCard,
  SlideOver,
  StatusPulseBadge,
} from "@/components/audit";

type Dash = {
  inventory: {
    count: number;
    inYard: Array<{ plate: string; checkedInAt: string }>;
  };
  yardMap: Array<{
    id: string;
    laneCode: string;
    bayCode: string;
    plate: string | null;
    status: string;
    scheduledDepartAt?: string | null;
  }>;
  washQueue: Array<{
    id: string;
    plate: string;
    priority: number;
    status: string;
  }>;
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
  const [plate, setPlate] = useState("");
  const [lprOpen, setLprOpen] = useState(false);
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

  const blocked = useMemo(
    () => (dash?.talanquera || []).filter((t) => t.denied || !t.gateOpened).length,
    [dash],
  );
  const granted = useMemo(
    () => (dash?.talanquera || []).filter((t) => t.gateOpened).length,
    [dash],
  );

  async function lprCheck() {
    if (!plate.trim()) return;
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const res = await api.post<{
        gateOpened: boolean;
        message: string;
        trip?: { code: string } | null;
      }>("/api/v1/patio/talanquera/lpr-check", { plate: plate.trim() });
      setMsg(
        `${res.message}${res.trip ? ` · Viaje ${res.trip.code}` : ""}`,
      );
      setLprOpen(false);
      setPlate("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bloqueo de talanquera");
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <PageIntro module="parqueadero" title="Patio inteligente" />
        <Button
          type="button"
          variant="primary"
          className="w-auto px-4 py-2"
          onClick={() => setLprOpen(true)}
        >
          Validar salida LPR
        </Button>
      </header>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-[var(--accent-alert)]/40 bg-[color-mix(in_srgb,var(--accent-alert)_10%,transparent)] px-4 py-3 font-mono text-sm text-[var(--accent-alert)]"
        >
          {error}
        </p>
      ) : null}
      {msg ? (
        <p className="rounded-lg border border-[var(--accent-primary)]/30 bg-[color-mix(in_srgb,var(--accent-primary)_8%,transparent)] px-4 py-3 text-sm">
          {msg}
        </p>
      ) : null}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Unidades en patio"
          value={dash?.inventory.count ?? "—"}
          delta="Inventario LIFO"
          tone="ok"
          icon={<ParkingSquare />}
        />
        <KpiCard
          label="Salidas OK"
          value={granted}
          delta="Talanquera abierta"
          tone="ok"
          icon={<LogIn />}
        />
        <KpiCard
          label="Talanquera bloqueada"
          value={blocked}
          delta="Hard-stop documental / despacho"
          tone={blocked > 0 ? "danger" : "ok"}
          icon={<Ban />}
        />
        <KpiCard
          label="Cola lavado"
          value={dash?.washQueue.length ?? 0}
          delta="Prioridad operativa"
          tone={(dash?.washQueue.length ?? 0) > 3 ? "warn" : "neutral"}
          icon={<Droplets />}
        />
      </section>

      <section
        id="talanquera"
        className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-5"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-display text-lg text-[var(--text-primary)]">
            Ledger talanquera
          </h2>
          <StatusPulseBadge tone={blocked > 0 ? "danger" : "active"} pulse={blocked > 0}>
            {blocked > 0 ? "ALERTA" : "NOMINAL"}
          </StatusPulseBadge>
        </div>
        {(dash?.talanquera || []).length === 0 ? (
          <EmptyState
            icon={<ShieldAlert className="h-7 w-7" aria-hidden />}
            title="Sin eventos LPR"
            description="Valide una placa para registrar apertura o bloqueo."
            actionLabel="Validar salida LPR"
            onAction={() => setLprOpen(true)}
          />
        ) : (
          <ul className="space-y-2">
            {(dash?.talanquera || []).map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-sm"
              >
                <span className="font-mono tabular-nums">{t.plate}</span>
                <Badge tone={t.gateOpened ? "emerald" : "rose"}>
                  {t.gateOpened
                    ? "ABIERTA"
                    : t.denyReason || "BLOQUEO OPERATIVO"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-5">
        <h2 className="mb-4 font-display text-lg text-[var(--text-primary)]">
          Yard Map · LIFO
        </h2>
        {(dash?.yardMap || []).length === 0 ? (
          <EmptyState
            icon={<ParkingSquare className="h-7 w-7" aria-hidden />}
            title="Sin bahías ocupadas"
            description="El mapa LIFO se llena con ingresos de patio."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(dash?.yardMap || []).map((s) => (
              <div
                key={s.id}
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm text-[var(--accent-primary)]">
                    {s.laneCode}/{s.bayCode}
                  </span>
                  <Badge tone={s.status === "OCCUPIED" ? "amber" : "neutral"}>
                    {statusEs(s.status)}
                  </Badge>
                </div>
                <p className="mt-2 font-mono text-lg text-[var(--text-primary)]">
                  {s.plate || "—"}
                </p>
                {s.scheduledDepartAt ? (
                  <p className="mt-1 font-mono text-xs text-[var(--text-secondary)]">
                    Salida {new Date(s.scheduledDepartAt).toLocaleString("es-CO")}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-5">
        <h2 className="mb-3 font-display text-lg">Cola de lavado</h2>
        {(dash?.washQueue || []).length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">
            Sin unidades en cola de lavado.
          </p>
        ) : (
          <ul className="space-y-2">
            {(dash?.washQueue || []).map((w) => (
              <li
                key={w.id}
                className="flex justify-between rounded-lg border border-[var(--border-subtle)] px-3 py-2 font-mono text-sm"
              >
                <span>{w.plate}</span>
                <span className="text-[var(--text-secondary)]">
                  P{w.priority} · {statusEs(w.status)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <SlideOver
        open={lprOpen}
        onClose={() => setLprOpen(false)}
        title="Validar salida LPR"
        description="Hard-stop: despacho, SOAT, fatiga y alcoholimetría."
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              className="w-auto px-4 py-2"
              onClick={() => setLprOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="primary"
              className="w-auto px-4 py-2"
              loading={busy}
              disabled={busy || !plate.trim()}
              onClick={() => void lprCheck()}
            >
              Validar placa
            </Button>
          </>
        }
      >
        <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-[var(--text-secondary)]">
          Placa
          <input
            className="field font-mono"
            value={plate}
            onChange={(e) => setPlate(e.target.value.toUpperCase())}
            placeholder="BOG-892"
            autoFocus
          />
        </label>
        <p className="mt-3 text-xs text-[var(--text-secondary)]">
          Si falla cualquier control, la talanquera permanece bloqueada y el
          motivo se registra en el ledger.
        </p>
      </SlideOver>
    </div>
  );
}
