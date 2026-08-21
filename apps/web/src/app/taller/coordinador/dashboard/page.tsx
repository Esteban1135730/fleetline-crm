"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { AlertTriangle, ClipboardList, Gauge, Wrench } from "lucide-react";
import { api } from "@/lib/api";
import { statusEs } from "@fsg/shared";
import { PageIntro } from "@/components/page-intro";
import { EmptyState, KpiCard, SlideOver } from "@/components/audit";

type Wo = {
  id: string;
  code: string;
  description: string;
  status: string;
  bayCode?: string | null;
  vehicle: { plate: string; status: string };
  assignedTo?: { name: string } | null;
};

type Dash = {
  kanban: Record<string, Wo[]>;
  bays: Array<{
    bayCode: string;
    code: string;
    plate: string;
    mechanic: string | null;
    timerActive: boolean;
    status: string;
  }>;
  predictiveAlerts: Array<{ plate: string; kmLeft: number; odometerKm: number }>;
  pendingFindings: Array<{
    id: string;
    workOrderCode: string;
    plate: string;
    transcript: string | null;
  }>;
};

const COLS = ["OPEN", "IN_PROGRESS", "WAITING_PARTS", "DONE"] as const;

export default function CoordinadorTallerDashboard() {
  const [dash, setDash] = useState<Dash | null>(null);
  const [vehicles, setVehicles] = useState<
    Array<{ id: string; plate: string; status: string }>
  >([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [otOpen, setOtOpen] = useState(false);
  const [vehicleId, setVehicleId] = useState("");
  const [desc, setDesc] = useState("Preventivo 10.000 km — pre-kitting");

  const load = useCallback(async () => {
    try {
      const [d, v] = await Promise.all([
        api.get<Dash>("/api/v1/taller/coordinador/dashboard"),
        api.get<Array<{ id: string; plate: string; status: string }>>(
          "/api/v1/taller/vehicles",
        ),
      ]);
      setDash(d);
      setVehicles(v);
      if (v[0] && !vehicleId) setVehicleId(v[0].id);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Conexión fallida");
    }
  }, [vehicleId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCount = useMemo(
    () => (dash?.kanban?.OPEN ?? []).length,
    [dash],
  );
  const waitingParts = useMemo(
    () => (dash?.kanban?.WAITING_PARTS ?? []).length,
    [dash],
  );
  const predictive = dash?.predictiveAlerts?.length ?? 0;

  async function crearOt() {
    if (!vehicleId) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.post<{
        code: string;
        logisticsStatus: string;
        message?: string;
      }>("/api/v1/taller/ordenes/crear", {
        vehicleId,
        description: desc,
        severity: "PREVENTIVE",
        bayCode: "BAY-A1",
        prekitSku: "FRN-PAD-MB40",
        prekitQty: 1,
      });
      setMsg(`${res.code} · Logística ${res.logisticsStatus}`);
      setOtOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Alta OT fallida");
    } finally {
      setBusy(false);
    }
  }

  async function liberarQc(workOrderId: string) {
    setBusy(true);
    try {
      const res = await api.post<{
        logisticsStatus: string;
        message: string;
      }>("/api/v1/taller/ordenes/liberar-qc", {
        workOrderId,
        pass: true,
        notes: "QC Coordinador — alta médica",
      });
      setMsg(`${res.logisticsStatus}: ${res.message}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "QC fallido");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <PageIntro module="taller" title="Torre de Taller 4.0" />
        <Button
          type="button"
          variant="primary"
          className="w-auto px-4 py-2"
          onClick={() => setOtOpen(true)}
        >
          + Nueva OT
        </Button>
      </header>

      {error ? (
        <p className="font-mono text-sm text-[var(--accent-alert)]">{error}</p>
      ) : null}
      {msg ? (
        <p className="font-mono text-sm text-[var(--accent-primary)]">{msg}</p>
      ) : null}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="OTs abiertas"
          value={openCount}
          tone={openCount > 0 ? "warn" : "ok"}
          icon={<ClipboardList />}
        />
        <KpiCard
          label="Esperando repuesto"
          value={waitingParts}
          tone={waitingParts > 0 ? "danger" : "ok"}
          icon={<Wrench />}
        />
        <KpiCard
          label="Bahías activas"
          value={dash?.bays?.length ?? 0}
          tone="neutral"
          icon={<Gauge />}
        />
        <KpiCard
          label="Predictivo ≤500 km"
          value={predictive}
          tone={predictive > 0 ? "warn" : "ok"}
          icon={<AlertTriangle />}
          delta="Pre-kitting preventivo"
        />
      </section>

      <section id="bahias" className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          Floor Plan — Bahías
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(dash?.bays ?? []).map((b) => (
            <article
              key={`${b.bayCode}-${b.code}`}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-4"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm text-[var(--accent-primary)]">
                  {b.bayCode}
                </span>
                {b.timerActive ? <Badge tone="amber">Cronómetro</Badge> : null}
              </div>
              <p className="mt-2 font-mono text-xs text-[var(--text-primary)]">
                {b.code} · {b.plate}
              </p>
              <p className="text-xs text-[var(--text-secondary)]">
                {b.mechanic ?? "Sin mecánico"} · {statusEs(b.status)}
              </p>
            </article>
          ))}
          {!dash?.bays?.length ? (
            <div className="col-span-full">
              <EmptyState
                icon={<Wrench className="h-7 w-7" aria-hidden />}
                title="Sin bahías ocupadas"
                description="Cree una OT para asignar bahía y mecánico."
                actionLabel="+ Nueva OT"
                onAction={() => setOtOpen(true)}
              />
            </div>
          ) : null}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          Tablero de órdenes
        </h2>
        <div className="grid gap-3 lg:grid-cols-4">
          {COLS.map((col) => (
            <div
              key={col}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-3"
            >
              <p className="mb-2 font-mono text-xs text-[var(--text-secondary)]">
                {statusEs(col)}
              </p>
              <ul className="space-y-2">
                {(dash?.kanban?.[col] ?? []).map((o) => (
                  <li
                    key={o.id}
                    className="rounded-lg border border-[var(--border-subtle)] px-3 py-2"
                  >
                    <p className="font-mono text-xs text-[var(--text-primary)]">
                      {o.code} · {o.vehicle.plate}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs text-[var(--text-secondary)]">
                      {o.description}
                    </p>
                    {col !== "DONE" ? (
                      <Button
                        className="mt-2 w-auto"
                        disabled={busy}
                        onClick={() => void liberarQc(o.id)}
                      >
                        Liberar QC
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section id="qc" className="space-y-2">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          Alertas predictivas (≤500 km)
        </h2>
        {(dash?.predictiveAlerts ?? []).length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">
            Sin alertas predictivas en ventana de 500 km.
          </p>
        ) : (
          <ul className="space-y-1 font-mono text-xs text-[var(--accent-metric)]">
            {(dash?.predictiveAlerts ?? []).map((a) => (
              <li key={a.plate}>
                {a.plate} · faltan {a.kmLeft} km · odómetro {a.odometerKm}
              </li>
            ))}
          </ul>
        )}
      </section>

      <SlideOver
        open={otOpen}
        onClose={() => setOtOpen(false)}
        title="Nueva orden de trabajo"
        description="Alta OT con pre-kitting y bloqueo logístico hasta QC."
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              className="w-auto px-4 py-2"
              onClick={() => setOtOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="primary"
              className="w-auto px-4 py-2"
              loading={busy}
              disabled={busy || !vehicleId}
              onClick={() => void crearOt()}
            >
              Crear OT
            </Button>
          </>
        }
      >
        <label className="flex flex-col gap-1 text-xs uppercase text-[var(--text-secondary)]">
          Unidad
          <select
            className="field font-mono"
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
          >
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.plate} · {statusEs(v.status)}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-3 flex flex-col gap-1 text-xs uppercase text-[var(--text-secondary)]">
          Descripción
          <textarea
            className="field min-h-[96px]"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
        </label>
      </SlideOver>
    </div>
  );
}
