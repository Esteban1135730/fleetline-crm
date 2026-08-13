"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { api } from "@/lib/api";
import { HowToBox, PageIntro } from "@/components/page-intro";

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
      setError(e instanceof Error ? e.message : "Uplink fallido");
    }
  }, [vehicleId]);

  useEffect(() => {
    void load();
  }, [load]);

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
    <div className="space-y-8">
      <PageIntro module="taller" title="Torre de Taller 4.0" />
      <HowToBox
        steps={[
          "Kanban de OT y mapa de bahías con cronómetro en vivo.",
          "Alerta predictiva 500 km antes del preventivo + pre-kitting.",
          "QC Coordinador libera el vehículo en Logística (Rojo → Verde).",
        ]}
      />

      {error && (
        <p className="font-mono text-sm text-[var(--fl-critical)]">{error}</p>
      )}
      {msg && (
        <p className="font-mono text-sm text-[var(--fl-accent)]">{msg}</p>
      )}

      <section className="flex flex-wrap gap-2">
        <select
          value={vehicleId}
          onChange={(e) => setVehicleId(e.target.value)}
          className="rounded-lg border border-[var(--fl-border)] bg-[var(--fl-surface)] px-3 py-2 font-mono text-sm"
        >
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.plate} · {v.status}
            </option>
          ))}
        </select>
        <input
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          className="min-w-[240px] flex-1 rounded-lg border border-[var(--fl-border)] bg-[var(--fl-surface)] px-3 py-2 text-sm"
        />
        <Button disabled={busy} onClick={() => void crearOt()}>
          Crear OT
        </Button>
      </section>

      <section id="bahias" className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--fl-text)]">
          Floor Plan — Bahías
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(dash?.bays ?? []).map((b) => (
            <article
              key={`${b.bayCode}-${b.code}`}
              className="rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-4"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm text-[var(--fl-accent)]">
                  {b.bayCode}
                </span>
                {b.timerActive && <Badge tone="amber">TIMER</Badge>}
              </div>
              <p className="mt-2 font-mono text-xs text-[var(--fl-text)]">
                {b.code} · {b.plate}
              </p>
              <p className="text-xs text-[var(--fl-subtext)]">
                {b.mechanic ?? "Sin mecánico"} · {b.status}
              </p>
            </article>
          ))}
          {!dash?.bays?.length && (
            <p className="text-sm text-[var(--fl-subtext)]">Sin bahías ocupadas</p>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--fl-text)]">
          Kanban OT
        </h2>
        <div className="grid gap-3 lg:grid-cols-4">
          {COLS.map((col) => (
            <div
              key={col}
              className="rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-3"
            >
              <p className="mb-2 font-mono text-xs text-[var(--fl-subtext)]">
                {col}
              </p>
              <ul className="space-y-2">
                {(dash?.kanban?.[col] ?? []).map((o) => (
                  <li
                    key={o.id}
                    className="rounded-lg border border-[var(--fl-border)] px-3 py-2"
                  >
                    <p className="font-mono text-xs text-[var(--fl-text)]">
                      {o.code} · {o.vehicle.plate}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs text-[var(--fl-subtext)]">
                      {o.description}
                    </p>
                    {col !== "DONE" && (
                      <Button
                        className="mt-2"
                        disabled={busy}
                        onClick={() => void liberarQc(o.id)}
                      >
                        Liberar QC
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section id="qc" className="space-y-2">
        <h2 className="text-lg font-semibold text-[var(--fl-text)]">
          Alertas predictivas (≤500 km)
        </h2>
        <ul className="space-y-1 font-mono text-xs text-[var(--fl-amber)]">
          {(dash?.predictiveAlerts ?? []).map((a) => (
            <li key={a.plate}>
              {a.plate} · faltan {a.kmLeft} km · odómetro {a.odometerKm}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
