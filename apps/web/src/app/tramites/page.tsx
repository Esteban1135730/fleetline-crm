"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { api } from "@/lib/api";
import { HowToBox, PageIntro } from "@/components/page-intro";
import {
  WorkbenchSearch,
  WorkbenchTabs,
  WorkbenchToolbar,
} from "@/components/workbench-toolbar";

type Vehicle = { id: string; plate: string; brand: string; model: string };

type Procedure = {
  id: string;
  type: string;
  reference?: string | null;
  status: string;
  validTo: string;
  notes?: string | null;
  vehicle: { plate: string; brand: string; model: string };
};

type FleetMatrix = {
  counts: { green: number; yellow: number; red: number };
  vehicles: {
    vehicleId: string;
    plate: string;
    semaphore: "GREEN" | "YELLOW" | "RED";
    dispatchable: boolean;
    blockReasons: string[];
    warnings: string[];
    odometerKm: number;
  }[];
};

const TYPE_ES: Record<string, string> = {
  SOAT: "SOAT",
  TECNOMECANICA: "Tecnomecánica",
  TARJETA_OPERACION: "Tarjeta de operación",
  LICENCIA_TRANSITO: "Licencia de tránsito",
  REVISION_PREVENTIVA: "Revisión preventiva",
  OTHER: "Otro",
};

export default function TramitesPage() {
  const [rows, setRows] = useState<Procedure[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [matrix, setMatrix] = useState<FleetMatrix | null>(null);
  const [form, setForm] = useState({
    vehicleId: "",
    type: "SOAT",
    reference: "",
    validTo: "",
    notes: "",
  });
  const [fleetTab, setFleetTab] = useState<"all" | "route" | "alerts">("all");
  const [fleetQuery, setFleetQuery] = useState("");

  async function load() {
    const [p, v, m] = await Promise.all([
      api<Procedure[]>("/tramites/procedures"),
      api<Vehicle[]>("/fleet/vehicles"),
      api<FleetMatrix>("/tramites/fleet-matrix"),
    ]);
    setRows(p);
    setVehicles(v);
    setMatrix(m);
    if (!form.vehicleId && v[0]) setForm((f) => ({ ...f, vehicleId: v[0].id }));
  }

  useEffect(() => {
    void load().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    await api("/tramites/procedures", {
      method: "POST",
      body: JSON.stringify(form),
    });
    setForm((f) => ({ ...f, reference: "", notes: "" }));
    await load();
  }

  const filteredFleet = useMemo(() => {
    const list = matrix?.vehicles || [];
    const q = fleetQuery.trim().toLowerCase();
    return list.filter((v) => {
      if (fleetTab === "route" && v.semaphore !== "GREEN") return false;
      if (
        fleetTab === "alerts" &&
        v.semaphore !== "YELLOW" &&
        v.semaphore !== "RED"
      ) {
        return false;
      }
      if (!q) return true;
      const hay = [v.plate, ...v.blockReasons, ...v.warnings]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [matrix, fleetTab, fleetQuery]);

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <PageIntro module="tramites" title="Trámites y documentos del vehículo" />
      <HowToBox
        steps={[
          "El semáforo usa regla dura: verde >15 días, amarillo ≤15, rojo vencido.",
          "Documentos en rojo bloquean despacho en Logística.",
          "Registre SOAT / tecnomecánica / tarjeta de operación por vehículo.",
        ]}
      />

      {matrix ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flt-panel !border-l-[3px] !border-l-[var(--accent-primary)]" title="Unidades con documentación vigente (>15 días). Aptas para despacho.">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
              Verde · aptos
            </p>
            <p className="mt-2 font-data text-3xl font-extrabold text-[var(--accent-primary)]">
              {matrix.counts.green}
            </p>
          </div>
          <div className="flt-panel !border-l-[3px] !border-l-[var(--accent-metric)]" title="Documentos que vencen en ≤15 días. Planifique renovación.">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
              Amarillo · ≤15 días
            </p>
            <p className="mt-2 font-data text-3xl font-extrabold text-[var(--accent-metric)]">
              {matrix.counts.yellow}
            </p>
          </div>
          <div className="flt-panel !border-l-[3px] !border-l-[var(--accent-alert)]" title="Bloqueo activo: documentación vencida (ej. SOAT). No se puede despachar.">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
              Rojo · bloqueados
            </p>
            <p className="mt-2 font-data text-3xl font-extrabold text-[var(--accent-alert)]">
              {matrix.counts.red}
            </p>
          </div>
        </div>
      ) : null}

      {matrix ? (
        <div className="flt-panel data-shell overflow-hidden !p-0">
          <div className="space-y-3 border-b border-[var(--border-subtle)] px-4 py-3">
            <div className="text-sm font-semibold">Semáforo de flota</div>
            <WorkbenchToolbar>
              <WorkbenchTabs
                value={fleetTab}
                onChange={(id) =>
                  setFleetTab(id as "all" | "route" | "alerts")
                }
                tabs={[
                  {
                    id: "all",
                    label: "Todos",
                    count: matrix.vehicles.length,
                    tip: "Toda la flota con semáforo documental",
                  },
                  {
                    id: "route",
                    label: "Aptos",
                    count: matrix.counts.green,
                    tip: "Verde: documentación vigente (>15 días). Aptos para despacho.",
                  },
                  {
                    id: "alerts",
                    label: "Alertas / bloqueados",
                    count: matrix.counts.yellow + matrix.counts.red,
                    tip: "Amarillo ≤15 días o rojo vencido. Rojo bloquea despacho.",
                  },
                ]}
              />
              <WorkbenchSearch
                value={fleetQuery}
                onChange={setFleetQuery}
                placeholder="Buscar por placa…"
              />
            </WorkbenchToolbar>
          </div>
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="px-4 py-2">Placa</th>
                <th className="px-4 py-2">Odómetro</th>
                <th className="px-4 py-2">Semáforo</th>
                <th className="px-4 py-2">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {filteredFleet.map((v) => (
                <tr key={v.vehicleId} className="border-t border-[var(--border-subtle)]">
                  <td className="px-4 py-2.5 font-data">{v.plate}</td>
                  <td className="px-4 py-2.5 font-data text-xs">
                    {v.odometerKm.toLocaleString("es-CO")} km
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge
                      tone={
                        v.semaphore === "GREEN"
                          ? "emerald"
                          : v.semaphore === "YELLOW"
                            ? "amber"
                            : "rose"
                      }
                      title={
                        v.semaphore === "GREEN"
                          ? "Apto: documentación vigente. Puede despacharse."
                          : v.semaphore === "YELLOW"
                            ? "Alerta: algún documento vence en ≤15 días. Planifique renovación."
                            : v.blockReasons[0]
                              ? `Bloqueo activo: ${v.blockReasons[0]}`
                              : "Bloqueo activo: este vehículo no puede ser despachado por documentación vencida (ej. SOAT)."
                      }
                    >
                      {v.semaphore === "GREEN"
                        ? "Verde"
                        : v.semaphore === "YELLOW"
                          ? "Amarillo"
                          : "Rojo · bloqueado"}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-[var(--text-secondary)]">
                    {[...v.blockReasons, ...v.warnings].join(" · ") || "Documentación al día"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <form
        onSubmit={onCreate}
        className="fsg-panel grid grid-cols-1 gap-3 p-4 md:grid-cols-6"
      >
        <select
          className="field"
          value={form.vehicleId}
          onChange={(e) => setForm({ ...form, vehicleId: e.target.value })}
          required
        >
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.plate} — {v.brand} {v.model}
            </option>
          ))}
        </select>
        <select
          className="field"
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value })}
        >
          {Object.entries(TYPE_ES).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <input
          className="field"
          placeholder="Nº póliza / referencia"
          value={form.reference}
          onChange={(e) => setForm({ ...form, reference: e.target.value })}
        />
        <input
          className="field"
          type="date"
          value={form.validTo}
          onChange={(e) => setForm({ ...form, validTo: e.target.value })}
          required
        />
        <input
          className="field"
          placeholder="Notas"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
        <Button type="submit" variant="primary">
          Registrar trámite
        </Button>
      </form>

      <div className="fsg-panel data-shell overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="px-4 py-2">Vehículo</th>
              <th className="px-4 py-2">Trámite</th>
              <th className="px-4 py-2">Vence</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-[var(--brand-line)]">
                <td className="px-4 py-2.5 font-data">{r.vehicle.plate}</td>
                <td className="px-4 py-2.5">
                  {TYPE_ES[r.type] || r.type}
                  {r.reference ? (
                    <div className="text-[11px] text-[var(--brand-muted)]">
                      Ref: {r.reference}
                    </div>
                  ) : null}
                </td>
                <td className="px-4 py-2.5 font-data text-xs">
                  {new Date(r.validTo).toLocaleDateString("es-CO")}
                </td>
                <td className="px-4 py-2.5">
                  <Badge
                    tone={
                      r.status === "VALID"
                        ? "emerald"
                        : r.status === "EXPIRING"
                          ? "amber"
                          : "rose"
                    }
                  >
                    {r.status === "VALID"
                      ? "Vigente"
                      : r.status === "EXPIRING"
                        ? "Por vencer"
                        : r.status === "EXPIRED"
                          ? "Vencido"
                          : r.status}
                  </Badge>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap items-center gap-1">
                    <input
                      className="field w-28 py-1 text-xs"
                      type="date"
                      id={`renew-${r.id}`}
                      defaultValue={r.validTo.slice(0, 10)}
                    />
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        const el = document.getElementById(
                          `renew-${r.id}`,
                        ) as HTMLInputElement | null;
                        if (!el?.value) return;
                        await api(`/tramites/procedures/${r.id}`, {
                          method: "PATCH",
                          body: JSON.stringify({ validTo: el.value }),
                        });
                        await load();
                      }}
                    >
                      Renovar
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        await api(`/tramites/procedures/${r.id}`, {
                          method: "PATCH",
                          body: JSON.stringify({ status: "VALID" }),
                        });
                        await load();
                      }}
                    >
                      Vigente
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        await api(`/tramites/procedures/${r.id}`, {
                          method: "PATCH",
                          body: JSON.stringify({ status: "EXPIRED" }),
                        });
                        await load();
                      }}
                    >
                      Vencido
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
