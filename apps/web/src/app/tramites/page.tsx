"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button } from "@fsg/ui";
import { FileCheck, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { PageIntro } from "@/components/page-intro";
import {
  EmptyState,
  KpiCard,
  SlideOver,
  StatusPulseBadge,
} from "@/components/audit";
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

const EMPTY_FORM = {
  vehicleId: "",
  type: "SOAT",
  reference: "",
  validTo: "",
  notes: "",
};

export default function TramitesPage() {
  const [rows, setRows] = useState<Procedure[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [matrix, setMatrix] = useState<FleetMatrix | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
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
    if (!form.vehicleId && v[0]) {
      setForm((f) => ({ ...f, vehicleId: v[0].id }));
    }
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
    setForm((f) => ({ ...f, reference: "", notes: "", validTo: "" }));
    setFormOpen(false);
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

  const alertCount = (matrix?.counts.yellow ?? 0) + (matrix?.counts.red ?? 0);

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <PageIntro
        module="tramites"
        title="Trámites y documentos del vehículo"
        action={
          <Button
            type="button"
            variant="primary"
            className="w-auto px-4 py-2"
            onClick={() => {
              setForm((f) => ({
                ...f,
                vehicleId: f.vehicleId || vehicles[0]?.id || "",
              }));
              setFormOpen(true);
            }}
          >
            <Plus className="mr-1.5 inline h-4 w-4" aria-hidden />
            Nuevo Trámite
          </Button>
        }
      />

      {matrix ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <KpiCard
            label="Verde · aptos"
            value={matrix.counts.green}
            delta="Documentación vigente (>15 d)"
            tone="ok"
          />
          <article className="relative overflow-hidden rounded-xl border border-slate-800 bg-zinc-900/80 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Amarillo · ≤15 días
            </p>
            <p className="mt-2 font-mono text-5xl font-bold tracking-tight tabular-nums text-amber-400">
              {matrix.counts.yellow}
            </p>
            <p className="mt-3 text-xs font-medium text-slate-400">
              Renovación planificada
            </p>
          </article>
          <article className="relative overflow-hidden rounded-xl border border-slate-800 bg-zinc-900/80 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Rojo · bloqueados
            </p>
            <p className="mt-2 font-mono text-5xl font-bold tracking-tight tabular-nums text-[var(--fl-critical,#FF2A5F)]">
              {matrix.counts.red}
            </p>
            <p className="mt-3 text-xs font-medium text-slate-400">
              Hard-Stop despacho · alertas {alertCount}
            </p>
          </article>
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
          {!filteredFleet.length ? (
            <div className="p-4">
              <EmptyState
                icon={<FileCheck className="h-7 w-7" />}
                title="Sin unidades en filtro"
                description="Ajuste pestaña o búsqueda de placa."
              />
            </div>
          ) : (
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
                  <tr
                    key={v.vehicleId}
                    className="border-t border-[var(--border-subtle)]"
                  >
                    <td className="px-4 py-2.5 font-data">{v.plate}</td>
                    <td className="px-4 py-2.5 font-data text-xs">
                      {v.odometerKm.toLocaleString("es-CO")} km
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusPulseBadge
                        tone={
                          v.semaphore === "GREEN"
                            ? "active"
                            : v.semaphore === "YELLOW"
                              ? "fatiga"
                              : "danger"
                        }
                        pulse={v.semaphore !== "GREEN"}
                      >
                        {v.semaphore === "GREEN"
                          ? "Verde"
                          : v.semaphore === "YELLOW"
                            ? "Amarillo"
                            : "Rojo · bloqueado"}
                      </StatusPulseBadge>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-[var(--text-secondary)]">
                      {[...v.blockReasons, ...v.warnings].join(" · ") ||
                        "Documentación al día"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}

      {!rows.length ? (
        <EmptyState
          icon={<FileCheck className="h-7 w-7" />}
          title="Sin trámites registrados"
          description="Indexe SOAT, tecnomecánica o tarjeta de operación."
          actionLabel="+ Nuevo Trámite"
          onAction={() => setFormOpen(true)}
        />
      ) : (
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
                    <StatusPulseBadge
                      tone={
                        r.status === "VALID"
                          ? "active"
                          : r.status === "EXPIRING"
                            ? "fatiga"
                            : "danger"
                      }
                      pulse={r.status !== "VALID"}
                    >
                      {r.status === "VALID"
                        ? "Vigente"
                        : r.status === "EXPIRING"
                          ? "Por vencer"
                          : r.status === "EXPIRED"
                            ? "Vencido"
                            : r.status}
                    </StatusPulseBadge>
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
                        className="w-auto px-2 py-1"
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
                        className="w-auto px-2 py-1"
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
                        className="w-auto px-2 py-1"
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
      )}

      <SlideOver
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Nuevo trámite"
        description="SOAT, tecnomecánica, tarjeta de operación y afines."
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              className="w-auto px-4 py-2"
              onClick={() => setFormOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="tramite-form"
              variant="primary"
              className="w-auto px-4 py-2"
            >
              Registrar
            </Button>
          </>
        }
      >
        <form id="tramite-form" onSubmit={onCreate} className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Vehículo
            </span>
            <select
              className="field w-full"
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
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Tipo
            </span>
            <select
              className="field w-full"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              {Object.entries(TYPE_ES).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Nº póliza / referencia
            </span>
            <input
              className="field w-full"
              value={form.reference}
              onChange={(e) => setForm({ ...form, reference: e.target.value })}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Vigente hasta
            </span>
            <input
              className="field w-full"
              type="date"
              value={form.validTo}
              onChange={(e) => setForm({ ...form, validTo: e.target.value })}
              required
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Notas
            </span>
            <input
              className="field w-full"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>
        </form>
      </SlideOver>
    </div>
  );
}
