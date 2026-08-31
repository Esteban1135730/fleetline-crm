"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { AlertTriangle, ClipboardList, Gauge, Wrench } from "lucide-react";
import { api } from "@/lib/api";
import { statusEs } from "@fsg/shared";
import { EmptyState, KpiCard, SlideOver } from "@/components/audit";
import { BentoPanel } from "@/components/nexa/bento-panel";
import { NexaTable, NexaRow, NexaCell } from "@/components/nexa/nexa-table";

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
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-border pb-4">
        <div>
          <p className="font-data text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-primary">
            Taller · Coordinación
          </p>
          <h1 className="font-sans text-2xl font-semibold tracking-tight text-brand-text-primary md:text-3xl">
            Torre de Taller 4.0
          </h1>
        </div>
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
        <p className="rounded-lg border border-brand-danger/40 bg-brand-danger/10 px-4 py-3 font-data text-sm text-brand-danger">
          {error}
        </p>
      ) : null}
      {msg ? (
        <p className="rounded-lg border border-brand-primary/40 bg-brand-primary/10 px-4 py-3 font-data text-sm text-brand-primary">
          {msg}
        </p>
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

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 lg:gap-4">
        <BentoPanel
          id="bahias"
          title="Floor plan · Bahías"
          subtitle="Ocupación en tiempo real"
          icon={<Gauge />}
          className="lg:col-span-12"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(dash?.bays ?? []).map((b) => (
              <article
                key={`${b.bayCode}-${b.code}`}
                className="rounded-lg border border-brand-border bg-brand-canvas p-3 transition-colors hover:border-brand-border-active"
              >
                <div className="flex items-center justify-between">
                  <span className="font-data text-sm text-brand-primary">
                    {b.bayCode}
                  </span>
                  {b.timerActive ? <Badge tone="warning">Cronómetro</Badge> : null}
                </div>
                <p className="mt-2 font-data text-xs tabular-nums text-brand-text-primary">
                  {b.code} · {b.plate}
                </p>
                <p className="font-sans text-xs text-brand-text-secondary">
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
        </BentoPanel>

        {COLS.map((col) => (
          <BentoPanel
            key={col}
            title={statusEs(col)}
            subtitle={`${(dash?.kanban?.[col] ?? []).length} órdenes`}
            className="lg:col-span-3"
          >
            <ul className="space-y-2">
              {(dash?.kanban?.[col] ?? []).map((o) => (
                <li
                  key={o.id}
                  className="rounded-lg border border-brand-border px-3 py-2 transition-colors hover:border-brand-border-active hover:bg-brand-surface-hover"
                >
                  <p className="font-data text-xs text-brand-text-primary">
                    {o.code} · {o.vehicle.plate}
                  </p>
                  <p className="mt-1 line-clamp-2 font-sans text-xs text-brand-text-secondary">
                    {o.description}
                  </p>
                  {col !== "DONE" ? (
                    <div className="mt-2 flex justify-end">
                      <Button
                        className="w-auto px-3 py-1 text-xs"
                        disabled={busy}
                        onClick={() => void liberarQc(o.id)}
                      >
                        Liberar QC
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
              {(dash?.kanban?.[col] ?? []).length === 0 ? (
                <li className="font-data text-xs text-brand-text-secondary">
                  Columna vacía
                </li>
              ) : null}
            </ul>
          </BentoPanel>
        ))}

        <BentoPanel
          id="qc"
          title="Alertas predictivas"
          subtitle="Ventana ≤500 km"
          icon={<AlertTriangle />}
          className="lg:col-span-12"
        >
          {(dash?.predictiveAlerts ?? []).length === 0 ? (
            <p className="font-sans text-sm text-brand-text-secondary">
              Sin alertas predictivas en ventana de 500 km.
            </p>
          ) : (
            <NexaTable columns={["Placa", "Km restantes", "Odómetro"]}>
              {(dash?.predictiveAlerts ?? []).map((a) => (
                <NexaRow key={a.plate}>
                  <NexaCell mono className="text-brand-warning">
                    {a.plate}
                  </NexaCell>
                  <NexaCell mono>{a.kmLeft}</NexaCell>
                  <NexaCell mono>
                    {a.odometerKm.toLocaleString("es-CO")} km
                  </NexaCell>
                </NexaRow>
              ))}
            </NexaTable>
          )}
        </BentoPanel>
      </div>

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
        <label className="flex flex-col gap-1 font-data text-[10px] uppercase tracking-[0.12em] text-brand-text-secondary">
          Unidad
          <select
            className="field font-data"
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
        <label className="mt-3 flex flex-col gap-1 font-data text-[10px] uppercase tracking-[0.12em] text-brand-text-secondary">
          Descripción
          <textarea
            className="field min-h-[96px] font-sans"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
        </label>
      </SlideOver>
    </div>
  );
}
