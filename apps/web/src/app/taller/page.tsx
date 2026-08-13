"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button } from "@fsg/ui";
import { Car, ClipboardList, Ban, Wrench } from "lucide-react";
import { api } from "@/lib/api";
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
};

type WorkOrder = {
  id: string;
  code: string;
  description: string;
  status: string;
  vehicle: { plate: string };
};

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
  const [vehicleForm, setVehicleForm] = useState({
    plate: "",
    brand: "",
    model: "",
    year: String(new Date().getFullYear()),
    capacity: "20",
  });

  async function load() {
    const [v, o] = await Promise.all([
      api<Vehicle[]>("/fleet/vehicles"),
      api<WorkOrder[]>("/fleet/work-orders"),
    ]);
    setVehicles(v);
    setOrders(o);
    if (!vehicleId && v[0]) setVehicleId(v[0].id);
  }

  useEffect(() => {
    void load().catch(console.error);
  }, []);

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
    await api("/fleet/work-orders", {
      method: "POST",
      body: JSON.stringify({ vehicleId, description }),
    });
    setDescription("");
    setOtModal(false);
    await load();
  }

  async function onCreateVehicle(e: FormEvent) {
    e.preventDefault();
    await api("/fleet/vehicles", {
      method: "POST",
      body: JSON.stringify({
        plate: vehicleForm.plate,
        brand: vehicleForm.brand,
        model: vehicleForm.model,
        year: Number(vehicleForm.year),
        capacity: Number(vehicleForm.capacity),
      }),
    });
    setVehicleForm({
      plate: "",
      brand: "",
      model: "",
      year: String(new Date().getFullYear()),
      capacity: "20",
    });
    setVehicleModal(false);
    await load();
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
              onClick={() => setVehicleModal(true)}
            >
              + Matricular Vehículo
            </Button>
            <Button
              type="button"
              variant="primary"
              className="w-auto px-4 py-2"
              onClick={() => setOtModal(true)}
              disabled={vehicles.length === 0}
            >
              Abrir OT
            </Button>
          </div>
        }
      />

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
              onAction={() => setOtModal(true)}
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
                      {o.status}
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
                <th className="px-4 py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => (
                <tr key={v.id} className="border-t border-[var(--brand-line)]">
                  <td className="px-4 py-2.5 font-data">{v.plate}</td>
                  <td className="px-4 py-2.5">
                    {v.brand} {v.model} ({v.year})
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      className="field w-auto text-xs"
                      value={v.status}
                      onChange={async (e) => {
                        await api(`/fleet/vehicles/${v.id}`, {
                          method: "PATCH",
                          body: JSON.stringify({ status: e.target.value }),
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
          onAction={() => setVehicleModal(true)}
        />
      )}

      <Modal
        open={vehicleModal}
        onClose={() => setVehicleModal(false)}
        title="Matricular vehículo"
        description="Alta de unidad en flota con placa, marca y modelo."
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              className="w-auto px-4 py-2"
              onClick={() => setVehicleModal(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="vehicle-form"
              variant="primary"
              className="w-auto px-4 py-2"
            >
              Alta vehículo
            </Button>
          </>
        }
      >
        <form id="vehicle-form" onSubmit={onCreateVehicle} className="grid gap-3 sm:grid-cols-2">
          <input
            className="field h-11 min-h-[44px] font-data uppercase"
            placeholder="Placa"
            value={vehicleForm.plate}
            onChange={(e) =>
              setVehicleForm({
                ...vehicleForm,
                plate: e.target.value.toUpperCase(),
              })
            }
            required
          />
          <input
            className="field h-11 min-h-[44px]"
            placeholder="Marca"
            value={vehicleForm.brand}
            onChange={(e) =>
              setVehicleForm({ ...vehicleForm, brand: e.target.value })
            }
            required
          />
          <input
            className="field h-11 min-h-[44px]"
            placeholder="Modelo"
            value={vehicleForm.model}
            onChange={(e) =>
              setVehicleForm({ ...vehicleForm, model: e.target.value })
            }
            required
          />
          <input
            className="field h-11 min-h-[44px]"
            type="number"
            placeholder="Año"
            value={vehicleForm.year}
            onChange={(e) =>
              setVehicleForm({ ...vehicleForm, year: e.target.value })
            }
            required
          />
          <input
            className="field h-11 min-h-[44px] sm:col-span-2"
            type="number"
            placeholder="Capacidad"
            value={vehicleForm.capacity}
            onChange={(e) =>
              setVehicleForm({ ...vehicleForm, capacity: e.target.value })
            }
          />
        </form>
      </Modal>

      <Modal
        open={otModal}
        onClose={() => setOtModal(false)}
        title="Abrir orden de taller"
        description="La unidad pasa a estado En taller."
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              className="w-auto px-4 py-2"
              onClick={() => setOtModal(false)}
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
          <select
            className="field h-11 min-h-[44px]"
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
            required
          >
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.plate} — {v.brand} {v.model}
              </option>
            ))}
          </select>
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
