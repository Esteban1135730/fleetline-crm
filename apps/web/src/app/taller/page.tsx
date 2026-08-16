"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button } from "@fsg/ui";
import { Car, ClipboardList, Ban, Wrench } from "lucide-react";
import { api } from "@/lib/api";
import { statusEs } from "@fsg/shared";
import { PageIntro } from "@/components/page-intro";
import {
  EmptyState,
  KpiCard,
  Modal,
  StatusPulseBadge,
} from "@/components/audit";

type Vehicle = {
  id: string;
  plate: string;
  brand: string;
  model: string;
  year: number;
  status: string;
  capacity?: number;
};

type WorkOrder = {
  id: string;
  code: string;
  description: string;
  status: string;
  vehicle: { plate: string };
};

function asVehicleList(raw: unknown): Vehicle[] {
  if (Array.isArray(raw)) return raw as Vehicle[];
  if (!raw || typeof raw !== "object") return [];
  const o = raw as { items?: unknown; vehicles?: unknown; data?: unknown };
  if (Array.isArray(o.items)) return o.items as Vehicle[];
  if (Array.isArray(o.vehicles)) return o.vehicles as Vehicle[];
  if (Array.isArray(o.data)) return o.data as Vehicle[];
  return [];
}

function asOrderList(raw: unknown): WorkOrder[] {
  if (Array.isArray(raw)) return raw as WorkOrder[];
  if (!raw || typeof raw !== "object") return [];
  const o = raw as { items?: unknown; orders?: unknown; data?: unknown };
  if (Array.isArray(o.items)) return o.items as WorkOrder[];
  if (Array.isArray(o.orders)) return o.orders as WorkOrder[];
  if (Array.isArray(o.data)) return o.data as WorkOrder[];
  return [];
}

function otTone(status: string): "active" | "fatiga" | "danger" | "neutral" {
  if (status === "DONE") return "active";
  if (status === "WAITING_PARTS") return "fatiga";
  if (status === "IN_PROGRESS") return "fatiga";
  if (status === "OPEN") return "danger";
  return "neutral";
}

export default function TallerPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [vehicleId, setVehicleId] = useState("");
  const [description, setDescription] = useState("");
  const [vehicleModal, setVehicleModal] = useState(false);
  const [otModal, setOtModal] = useState(false);
  const [fleetOpen, setFleetOpen] = useState(false);
  const [fleetQuery, setFleetQuery] = useState("");
  const [loadError, setLoadError] = useState("");
  const [otError, setOtError] = useState("");
  const [pendingOt, setPendingOt] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [vehicleForm, setVehicleForm] = useState({
    plate: "",
    brand: "",
    model: "",
    year: String(new Date().getFullYear()),
    capacity: "20",
  });

  async function load() {
    setLoadError("");
    const paths = ["/fleet/vehicles", "/taller/vehicles", "/tramites/vehicles"];
    let list: Vehicle[] = [];
    const errors: string[] = [];
    for (const path of paths) {
      try {
        const raw = await api<unknown>(path);
        list = asVehicleList(raw);
        if (list.length) break;
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }

    let orderList: WorkOrder[] = [];
    try {
      orderList = asOrderList(await api<unknown>("/fleet/work-orders"));
    } catch {
      try {
        orderList = asOrderList(await api<unknown>("/taller/work-orders"));
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }

    setVehicles(list);
    setOrders(orderList);
    setVehicleId((current) =>
      current && list.some((v) => v.id === current) ? current : list[0]?.id || "",
    );
    if (!list.length && errors.length) {
      setLoadError(errors[0]);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const fleetFiltered = useMemo(() => {
    const q = fleetQuery.trim().toLowerCase();
    if (!q) return vehicles;
    return vehicles.filter((v) =>
      `${v.plate} ${v.brand} ${v.model}`.toLowerCase().includes(q),
    );
  }, [vehicles, fleetQuery]);

  const selectedVehicle = vehicles.find((v) => v.id === vehicleId) || null;

  function openOtModal() {
    setOtError("");
    setFleetQuery("");
    setFleetOpen(true);
    if (vehicles.length === 0) {
      setPendingOt(true);
      setVehicleModal(true);
      return;
    }
    setOtModal(true);
    void load();
  }

  const openOrders = useMemo(
    () => orders.filter((o) => o.status !== "DONE"),
    [orders],
  );

  const flotaOperativa = useMemo(
    () =>
      vehicles.filter(
        (v) => v.status === "AVAILABLE" || v.status === "IN_SERVICE",
      ).length,
    [vehicles],
  );

  const inmovilizados = useMemo(
    () =>
      vehicles.filter(
        (v) => v.status === "MAINTENANCE" || v.status === "OUT_OF_SERVICE",
      ).length,
    [vehicles],
  );

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setOtError("");
    if (!vehicleId) {
      setOtError("Selecciona una unidad de la lista.");
      setFleetOpen(true);
      return;
    }
    try {
      await api("/fleet/work-orders", {
        method: "POST",
        body: JSON.stringify({ vehicleId, description }),
      });
      setDescription("");
      setOtModal(false);
      setFleetOpen(false);
      await load();
    } catch (err) {
      setOtError(err instanceof Error ? err.message : "No se pudo abrir la OT");
    }
  }

  const EMPTY_VEHICLE = {
    plate: "",
    brand: "",
    model: "",
    year: String(new Date().getFullYear()),
    capacity: "20",
  };

  async function onSaveVehicle(e: FormEvent) {
    e.preventDefault();
    setLoadError("");
    const payload = {
      plate: vehicleForm.plate,
      brand: vehicleForm.brand,
      model: vehicleForm.model,
      year: Number(vehicleForm.year),
      capacity: Number(vehicleForm.capacity),
    };
    const wasEditing = Boolean(editingId);
    try {
      if (editingId) {
        const prev = vehicles.find((v) => v.id === editingId);
        await api(`/fleet/vehicles/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
          confirm: {
            title: `Confirmar edición · ${payload.plate}`,
            previous: prev
              ? {
                  plate: prev.plate,
                  brand: prev.brand,
                  model: prev.model,
                  year: prev.year,
                  capacity: prev.capacity ?? 20,
                }
              : undefined,
          },
        });
      } else {
        const created = await api<Vehicle>("/fleet/vehicles", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        if (created?.id) setVehicleId(created.id);
      }
      setVehicleForm(EMPTY_VEHICLE);
      setEditingId(null);
      setVehicleModal(false);
      await load();
      if (!wasEditing && pendingOt) {
        setPendingOt(false);
        setOtModal(true);
        setFleetOpen(true);
      }
    } catch (err) {
      if ((err as { name?: string })?.name === "MutationCancelled") return;
      setLoadError(
        err instanceof Error
          ? err.message
          : wasEditing
            ? "No se pudo guardar la unidad"
            : "No se pudo matricular",
      );
    }
  }

  function openCreateVehicle() {
    setEditingId(null);
    setVehicleForm(EMPTY_VEHICLE);
    setVehicleModal(true);
  }

  function openEditVehicle(v: Vehicle) {
    setEditingId(v.id);
    setVehicleForm({
      plate: v.plate,
      brand: v.brand,
      model: v.model,
      year: String(v.year || new Date().getFullYear()),
      capacity: String(v.capacity ?? 20),
    });
    setVehicleModal(true);
  }

  async function removeVehicle(v: Vehicle) {
    setLoadError("");
    try {
      await api(`/fleet/vehicles/${v.id}`, {
        method: "DELETE",
        confirm: {
          title: `Eliminar unidad ${v.plate}`,
          record: {
            plate: v.plate,
            brand: v.brand,
            model: v.model,
            year: v.year,
            capacity: v.capacity ?? 20,
            status: v.status,
          },
        },
      });
      await load();
    } catch (err) {
      if ((err as { name?: string })?.name === "MutationCancelled") return;
      setLoadError(err instanceof Error ? err.message : "No se pudo eliminar");
    }
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <PageIntro
        module="taller"
        title="Vehículos y taller"
        action={
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              className="w-auto px-4 py-2"
              onClick={openCreateVehicle}
            >
              + Matricular Vehículo
            </Button>
            <Button
              type="button"
              variant="primary"
              className="w-auto px-4 py-2"
              onClick={openOtModal}
            >
              Abrir OT
            </Button>
          </div>
        }
      />

      {loadError ? (
        <p className="text-sm text-[var(--brand-signal,#FF2A5F)]">{loadError}</p>
      ) : null}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard
          label="Flota Operativa"
          value={flotaOperativa}
          tone="ok"
          icon={<Car />}
          delta={`${vehicles.length} unidades`}
        />
        <KpiCard
          label="OTs Abiertas"
          value={openOrders.length}
          tone={openOrders.length > 0 ? "warn" : "neutral"}
          icon={<ClipboardList />}
        />
        <KpiCard
          label="Vehículos Inmovilizados"
          value={inmovilizados}
          tone={inmovilizados > 0 ? "danger" : "ok"}
          icon={<Ban />}
        />
      </section>

      <div className="fsg-panel data-shell overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--brand-line)] px-4 py-3">
          <div className="flex items-center gap-2 font-display text-sm font-semibold">
            <Wrench className="h-4 w-4 text-slate-500" aria-hidden />
            Órdenes de trabajo
          </div>
          <span className="font-mono text-xs tabular-nums text-slate-500">
            {orders.length} totales
          </span>
        </div>

        {orders.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<ClipboardList className="h-7 w-7" />}
              title="Sin órdenes de trabajo"
              description="Abre la primera OT para poner una unidad en taller."
              actionLabel="Abrir OT"
              onAction={openOtModal}
            />
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="px-4 py-2">OT</th>
                <th className="px-4 py-2">Detalle</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-[var(--brand-line)]">
                  <td className="px-4 py-2.5 font-data text-xs">
                    {o.code}
                    <div className="text-[var(--brand-muted)]">
                      {o.vehicle.plate}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">{o.description}</td>
                  <td className="px-4 py-2.5">
                    <StatusPulseBadge tone={otTone(o.status)}>
                      {statusEs(o.status)}
                    </StatusPulseBadge>
                  </td>
                  <td className="px-4 py-2.5">
                    {o.status !== "DONE" ? (
                      <div className="flex flex-wrap justify-end gap-1">
                        {o.status === "OPEN" ? (
                          <Button
                            variant="ghost"
                            className="w-auto px-3 py-1.5"
                            onClick={async () => {
                              await api(`/fleet/work-orders/${o.id}`, {
                                method: "PATCH",
                                body: JSON.stringify({ status: "IN_PROGRESS" }),
                              });
                              await load();
                            }}
                          >
                            En curso
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          className="w-auto px-3 py-1.5"
                          onClick={async () => {
                            await api(`/fleet/work-orders/${o.id}`, {
                              method: "PATCH",
                              body: JSON.stringify({ status: "WAITING_PARTS" }),
                            });
                            await load();
                          }}
                        >
                          Repuestos
                        </Button>
                        <Button
                          variant="ghost"
                          className="w-auto px-3 py-1.5"
                          onClick={async () => {
                            await api(`/fleet/work-orders/${o.id}`, {
                              method: "PATCH",
                              body: JSON.stringify({ status: "DONE" }),
                            });
                            await load();
                          }}
                        >
                          Cerrar
                        </Button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {vehicles.length > 0 ? (
        <div className="fsg-panel data-shell overflow-hidden">
          <div className="border-b border-[var(--brand-line)] px-4 py-3 font-display text-sm font-semibold">
            Flota ({vehicles.length})
          </div>
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="px-4 py-2">Placa</th>
                <th className="px-4 py-2">Unidad</th>
                <th className="px-4 py-2">Año</th>
                <th className="px-4 py-2">Cupo</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => (
                <tr key={v.id} className="border-t border-[var(--brand-line)]">
                  <td className="px-4 py-2.5 font-data">{v.plate}</td>
                  <td className="px-4 py-2.5">
                    {v.brand} {v.model}
                  </td>
                  <td className="px-4 py-2.5 font-data">{v.year}</td>
                  <td className="px-4 py-2.5 font-data">{v.capacity ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <select
                      className="field w-auto text-xs"
                      value={v.status}
                      onChange={async (e) => {
                        await api(`/fleet/vehicles/${v.id}`, {
                          method: "PATCH",
                          body: JSON.stringify({ status: e.target.value }),
                          confirm: {
                            title: `Cambiar estado · ${v.plate}`,
                            previous: { plate: v.plate, status: v.status },
                          },
                        });
                        await load();
                      }}
                    >
                      <option value="AVAILABLE">Disponible</option>
                      <option value="IN_SERVICE">En servicio</option>
                      <option value="MAINTENANCE">En taller</option>
                      <option value="OUT_OF_SERVICE">Fuera de servicio</option>
                    </select>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        className="w-auto px-3 py-1.5"
                        onClick={() => openEditVehicle(v)}
                      >
                        Editar
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="w-auto px-3 py-1.5 text-rose-400"
                        onClick={() => void removeVehicle(v)}
                      >
                        Eliminar
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon={<Car className="h-7 w-7" />}
          title="Sin vehículos matriculados"
          description="Matricula la primera unidad de la flota."
          actionLabel="+ Matricular Vehículo"
          onAction={openCreateVehicle}
        />
      )}

      <Modal
        open={vehicleModal}
        onClose={() => {
          setVehicleModal(false);
          setEditingId(null);
        }}
        title={editingId ? "Editar unidad" : "Matricular vehículo"}
        description={
          editingId
            ? "Corrige placa, marca, línea, año o cupo de pasajeros."
            : "Identifica la unidad: placa, marca, línea/modelo, año y cupo de pasajeros."
        }
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              className="w-auto px-4 py-2"
              onClick={() => {
                setVehicleModal(false);
                setEditingId(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="vehicle-form"
              variant="primary"
              className="w-auto px-4 py-2"
            >
              {editingId ? "Guardar cambios" : "Alta vehículo"}
            </Button>
          </>
        }
      >
        <form id="vehicle-form" onSubmit={onSaveVehicle} className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="field-label">Placa</span>
            <input
              className="field h-11 min-h-[44px] font-data uppercase"
              placeholder="Ej. AAA123"
              value={vehicleForm.plate}
              onChange={(e) =>
                setVehicleForm({
                  ...vehicleForm,
                  plate: e.target.value.toUpperCase(),
                })
              }
              required
            />
          </label>
          <label className="block">
            <span className="field-label">Marca</span>
            <input
              className="field h-11 min-h-[44px]"
              placeholder="Ej. Renault"
              value={vehicleForm.brand}
              onChange={(e) =>
                setVehicleForm({ ...vehicleForm, brand: e.target.value })
              }
              required
            />
          </label>
          <label className="block">
            <span className="field-label">Línea / modelo</span>
            <input
              className="field h-11 min-h-[44px]"
              placeholder="Ej. Duster, Sprinter 515"
              value={vehicleForm.model}
              onChange={(e) =>
                setVehicleForm({ ...vehicleForm, model: e.target.value })
              }
              required
            />
          </label>
          <label className="block">
            <span className="field-label">Año del vehículo</span>
            <input
              className="field h-11 min-h-[44px] font-data"
              type="number"
              min="1980"
              max="2040"
              placeholder="Ej. 2022"
              value={vehicleForm.year}
              onChange={(e) =>
                setVehicleForm({ ...vehicleForm, year: e.target.value })
              }
              required
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="field-label">Cupo de pasajeros</span>
            <input
              className="field h-11 min-h-[44px] font-data"
              type="number"
              min="1"
              max="80"
              placeholder="Ej. 20"
              value={vehicleForm.capacity}
              onChange={(e) =>
                setVehicleForm({ ...vehicleForm, capacity: e.target.value })
              }
            />
            <span className="mt-1 block text-xs text-[var(--text-secondary)]">
              Cantidad de sillas / pasajeros que transporta la unidad. No es el año.
            </span>
          </label>
        </form>
      </Modal>

      <Modal
        open={otModal}
        onClose={() => setOtModal(false)}
        title="Abrir orden de taller"
        description="Elige la placa. La unidad pasa a estado En taller."
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              className="w-auto px-4 py-2"
              onClick={() => {
                setOtModal(false);
                setFleetOpen(false);
              }}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="ot-form"
              variant="primary"
              className="w-auto px-4 py-2"
            >
              Abrir OT
            </Button>
          </>
        }
      >
        <form id="ot-form" onSubmit={onCreate} className="space-y-3">
          <div>
            <p className="field-label">Unidad</p>
            <button
              type="button"
              className="field flex h-11 min-h-[44px] w-full items-center justify-between text-left"
              onClick={() => setFleetOpen((o) => !o)}
              aria-expanded={fleetOpen}
            >
              <span className="truncate font-data">
                {selectedVehicle
                  ? `${selectedVehicle.plate} — ${selectedVehicle.brand} ${selectedVehicle.model}`
                  : "Seleccionar placa"}
              </span>
              <span aria-hidden className="text-[var(--text-secondary)]">
                {fleetOpen ? "▴" : "▾"}
              </span>
            </button>
            {fleetOpen ? (
              <div className="mt-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-2">
                <input
                  className="field mb-2 h-10"
                  placeholder="Buscar placa / marca"
                  value={fleetQuery}
                  onChange={(e) => setFleetQuery(e.target.value)}
                  autoFocus
                />
                <ul className="max-h-52 overflow-y-auto">
                  {fleetFiltered.length === 0 ? (
                    <li className="px-2 py-3 text-sm text-[var(--text-secondary)]">
                      Sin unidades. Matricula un vehículo primero.
                    </li>
                  ) : (
                    fleetFiltered.map((v) => (
                      <li key={v.id}>
                        <button
                          type="button"
                          className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-all duration-150 ease-in-out ${
                            v.id === vehicleId
                              ? "bg-[color-mix(in_srgb,var(--accent-primary)_16%,transparent)]"
                              : "hover:bg-[color-mix(in_srgb,var(--accent-primary)_8%,transparent)]"
                          }`}
                          onClick={() => {
                            setVehicleId(v.id);
                            setFleetOpen(false);
                            setOtError("");
                          }}
                        >
                          <span className="font-data">{v.plate}</span>
                          <span className="text-xs text-[var(--text-secondary)]">
                            {v.brand} {v.model}
                          </span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            ) : null}
          </div>
          {otError ? (
            <p className="text-sm text-[var(--brand-signal,#FF2A5F)]">{otError}</p>
          ) : null}
          <input
            className="field h-11 min-h-[44px]"
            placeholder="¿Qué hay que hacer? ej. frenos"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </form>
      </Modal>
    </div>
  );
}
