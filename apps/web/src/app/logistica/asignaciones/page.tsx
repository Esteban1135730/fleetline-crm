"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import {
  Car,
  Link2,
  Star,
  Unlink,
  UserRound,
} from "lucide-react";
import { api } from "@/lib/api";
import { PageIntro } from "@/components/page-intro";
import {
  EmptyState,
  KpiCard,
  SlideOver,
} from "@/components/audit";

type DriverRow = {
  id: string;
  name: string;
  document: string;
  fatigueScore: number;
  dispatchBlocked: boolean;
};

type VehicleRow = {
  id: string;
  plate: string;
  brand: string;
  model: string;
  status: string;
  complianceBlocked: boolean;
};

type LinkRow = {
  id: string;
  driverId: string;
  vehicleId: string;
  isPrimary: boolean;
  notes: string | null;
  driver: { id: string; name: string; document: string };
  vehicle: { id: string; plate: string; brand: string; model: string };
};

type Matrix = {
  drivers: DriverRow[];
  vehicles: VehicleRow[];
  links: LinkRow[];
  byDriver: Array<
    DriverRow & {
      vehicles: Array<{
        linkId: string;
        isPrimary: boolean;
        notes: string | null;
        vehicle: VehicleRow;
      }>;
    }
  >;
  byVehicle: Array<
    VehicleRow & {
      drivers: Array<{
        linkId: string;
        isPrimary: boolean;
        notes: string | null;
        driver: { id: string; name: string; document: string };
      }>;
    }
  >;
};

export default function AsignacionesUnidadPage() {
  const [matrix, setMatrix] = useState<Matrix | null>(null);
  const [view, setView] = useState<"conductor" | "vehiculo">("conductor");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({
    driverId: "",
    vehicleId: "",
    isPrimary: false,
    notes: "",
  });

  const load = useCallback(async () => {
    try {
      const m = await api.get<Matrix>("/logistica/asignaciones-unidad/matriz");
      setMatrix(m);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Uplink fallido");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredDrivers = useMemo(() => {
    const rows = matrix?.byDriver ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (d) =>
        d.name.toLowerCase().includes(needle) ||
        d.document.toLowerCase().includes(needle) ||
        d.vehicles.some((v) => v.vehicle.plate.toLowerCase().includes(needle)),
    );
  }, [matrix, q]);

  const filteredVehicles = useMemo(() => {
    const rows = matrix?.byVehicle ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (v) =>
        v.plate.toLowerCase().includes(needle) ||
        v.brand.toLowerCase().includes(needle) ||
        v.drivers.some((d) => d.driver.name.toLowerCase().includes(needle)),
    );
  }, [matrix, q]);

  async function linkPair() {
    if (!form.driverId || !form.vehicleId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ message: string }>(
        "/logistica/asignaciones-unidad",
        {
          driverId: form.driverId,
          vehicleId: form.vehicleId,
          isPrimary: form.isPrimary,
          notes: form.notes.trim() || undefined,
        },
      );
      setMsg(res.message || "Vínculo autorizado");
      setOpen(false);
      setForm({ driverId: "", vehicleId: "", isPrimary: false, notes: "" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo vincular");
    } finally {
      setBusy(false);
    }
  }

  async function unlink(id: string) {
    setBusy(true);
    try {
      await api.delete(`/logistica/asignaciones-unidad/${id}`);
      setMsg("Autorización retirada");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo desvincular");
    } finally {
      setBusy(false);
    }
  }

  async function setPrimary(id: string) {
    try {
      await api.patch(`/logistica/asignaciones-unidad/${id}/primary`, {});
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo marcar primaria");
    }
  }

  const linkCount = matrix?.links.length ?? 0;

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <PageIntro module="logistica" title="Unidades autorizadas" />
          <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">
            Matriz N:N — un conductor puede operar varias placas; una placa
            puede tener varios conductores autorizados. El despacho exige la
            pareja cuando ya hay roster.
          </p>
        </div>
        <Button
          type="button"
          variant="primary"
          className="w-auto px-4 py-2"
          onClick={() => setOpen(true)}
        >
          <Link2 className="mr-1.5 h-4 w-4" />
          Autorizar pareja
        </Button>
      </header>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-[var(--accent-alert)]/40 px-4 py-3 font-mono text-sm text-[var(--accent-alert)]"
        >
          {error}
        </p>
      ) : null}
      {msg ? (
        <p className="rounded-lg border border-[var(--accent-primary)]/30 px-4 py-3 text-sm">
          {msg}
        </p>
      ) : null}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <KpiCard
          label="Vínculos activos"
          value={linkCount}
          delta="Conductor ↔ vehículo"
          tone="ok"
          icon={<Link2 />}
        />
        <KpiCard
          label="Conductores"
          value={matrix?.drivers.length ?? "—"}
          delta="Con o sin placas"
          tone="neutral"
          icon={<UserRound />}
        />
        <KpiCard
          label="Vehículos"
          value={matrix?.vehicles.length ?? "—"}
          delta="Flota en matriz"
          tone="neutral"
          icon={<Car />}
        />
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={view === "conductor" ? "primary" : "secondary"}
          className="w-auto px-3 py-2"
          onClick={() => setView("conductor")}
        >
          Por conductor
        </Button>
        <Button
          type="button"
          variant={view === "vehiculo" ? "primary" : "secondary"}
          className="w-auto px-3 py-2"
          onClick={() => setView("vehiculo")}
        >
          Por vehículo
        </Button>
        <input
          className="field ml-auto max-w-xs font-mono text-sm"
          placeholder="Buscar nombre / placa / documento…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {view === "conductor" ? (
        filteredDrivers.length === 0 ? (
          <EmptyState
            icon={<UserRound className="h-7 w-7" aria-hidden />}
            title="Sin conductores en vista"
            description="Autorice la primera pareja conductor–placa."
            actionLabel="Autorizar pareja"
            onAction={() => setOpen(true)}
          />
        ) : (
          <ul className="space-y-3">
            {filteredDrivers.map((d) => (
              <li
                key={d.id}
                className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-4"
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-display text-base text-[var(--text-primary)]">
                      {d.name}
                    </p>
                    <p className="font-mono text-xs text-[var(--text-secondary)]">
                      {d.document}
                      {d.dispatchBlocked ? " · BLOQUEADO" : ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-auto px-3 py-1 text-xs"
                    onClick={() => {
                      setForm((f) => ({ ...f, driverId: d.id }));
                      setOpen(true);
                    }}
                  >
                    + Placa
                  </Button>
                </div>
                {d.vehicles.length === 0 ? (
                  <p className="text-sm text-[var(--text-secondary)]">
                    Sin vehículos autorizados
                  </p>
                ) : (
                  <ul className="flex flex-wrap gap-2">
                    {d.vehicles.map((v) => (
                      <li
                        key={v.linkId}
                        className="flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2"
                      >
                        <span className="font-mono text-sm tabular-nums">
                          {v.vehicle.plate}
                        </span>
                        {v.isPrimary ? (
                          <Badge tone="emerald">PRIMARIA</Badge>
                        ) : null}
                        {!v.isPrimary ? (
                          <button
                            type="button"
                            className="text-[var(--text-secondary)] hover:text-[var(--accent-metric)]"
                            title="Marcar primaria"
                            onClick={() => void setPrimary(v.linkId)}
                          >
                            <Star className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="text-[var(--text-secondary)] hover:text-[var(--accent-alert)]"
                          title="Retirar autorización"
                          disabled={busy}
                          onClick={() => void unlink(v.linkId)}
                        >
                          <Unlink className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )
      ) : filteredVehicles.length === 0 ? (
        <EmptyState
          icon={<Car className="h-7 w-7" aria-hidden />}
          title="Sin vehículos en vista"
          description="Vincule conductores a una placa de flota."
          actionLabel="Autorizar pareja"
          onAction={() => setOpen(true)}
        />
      ) : (
        <ul className="space-y-3">
          {filteredVehicles.map((v) => (
            <li
              key={v.id}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-4"
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-mono text-lg tabular-nums text-[var(--text-primary)]">
                    {v.plate}
                  </p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {v.brand} {v.model} · {v.status}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-auto px-3 py-1 text-xs"
                  onClick={() => {
                    setForm((f) => ({ ...f, vehicleId: v.id }));
                    setOpen(true);
                  }}
                >
                  + Conductor
                </Button>
              </div>
              {v.drivers.length === 0 ? (
                <p className="text-sm text-[var(--text-secondary)]">
                  Sin conductores autorizados
                </p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {v.drivers.map((d) => (
                    <li
                      key={d.linkId}
                      className="flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm"
                    >
                      <span>{d.driver.name}</span>
                      {d.isPrimary ? (
                        <Badge tone="emerald">PRIMARIA</Badge>
                      ) : null}
                      <button
                        type="button"
                        className="text-[var(--text-secondary)] hover:text-[var(--accent-alert)]"
                        disabled={busy}
                        onClick={() => void unlink(d.linkId)}
                      >
                        <Unlink className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      <SlideOver
        open={open}
        onClose={() => setOpen(false)}
        title="Autorizar pareja"
        description="Registra qué conductor puede operar qué vehículo (N:N)."
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              className="w-auto px-4 py-2"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="primary"
              className="w-auto px-4 py-2"
              loading={busy}
              disabled={busy || !form.driverId || !form.vehicleId}
              onClick={() => void linkPair()}
            >
              Guardar autorización
            </Button>
          </>
        }
      >
        <label className="flex flex-col gap-1 text-xs uppercase text-[var(--text-secondary)]">
          Conductor
          <select
            className="field"
            value={form.driverId}
            onChange={(e) =>
              setForm((f) => ({ ...f, driverId: e.target.value }))
            }
          >
            <option value="">Seleccionar…</option>
            {(matrix?.drivers ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} · {d.document}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-3 flex flex-col gap-1 text-xs uppercase text-[var(--text-secondary)]">
          Vehículo
          <select
            className="field font-mono"
            value={form.vehicleId}
            onChange={(e) =>
              setForm((f) => ({ ...f, vehicleId: e.target.value }))
            }
          >
            <option value="">Seleccionar…</option>
            {(matrix?.vehicles ?? []).map((v) => (
              <option key={v.id} value={v.id}>
                {v.plate} · {v.brand} {v.model}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-3 flex items-center gap-2 text-sm text-[var(--text-primary)]">
          <input
            type="checkbox"
            checked={form.isPrimary}
            onChange={(e) =>
              setForm((f) => ({ ...f, isPrimary: e.target.checked }))
            }
          />
          Marcar como placa primaria del conductor
        </label>
        <label className="mt-3 flex flex-col gap-1 text-xs uppercase text-[var(--text-secondary)]">
          Notas
          <input
            className="field"
            value={form.notes}
            onChange={(e) =>
              setForm((f) => ({ ...f, notes: e.target.value }))
            }
            placeholder="Categoría licencia, turno, etc."
          />
        </label>
      </SlideOver>
    </div>
  );
}
