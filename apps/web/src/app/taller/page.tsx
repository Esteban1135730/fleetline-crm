"use client";

import { FormEvent, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { api } from "@/lib/api";
import { HowToBox, PageIntro } from "@/components/page-intro";

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

export default function TallerPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [vehicleId, setVehicleId] = useState("");
  const [description, setDescription] = useState("");
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

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    await api("/fleet/work-orders", {
      method: "POST",
      body: JSON.stringify({ vehicleId, description }),
    });
    setDescription("");
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
    await load();
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <PageIntro module="taller" title="Vehículos y taller" />
      <HowToBox
        steps={[
          "Da de alta unidades nuevas con placa, marca y modelo.",
          "Abre una OT: el vehículo pasa a «En taller».",
          "Al cerrar la OT, el vehículo vuelve a disponible.",
        ]}
      />

      <form
        onSubmit={onCreateVehicle}
        className="fsg-panel grid grid-cols-1 gap-3 p-4 md:grid-cols-6"
      >
        <input
          className="field font-data uppercase"
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
          className="field"
          placeholder="Marca"
          value={vehicleForm.brand}
          onChange={(e) =>
            setVehicleForm({ ...vehicleForm, brand: e.target.value })
          }
          required
        />
        <input
          className="field"
          placeholder="Modelo"
          value={vehicleForm.model}
          onChange={(e) =>
            setVehicleForm({ ...vehicleForm, model: e.target.value })
          }
          required
        />
        <input
          className="field"
          type="number"
          placeholder="Año"
          value={vehicleForm.year}
          onChange={(e) =>
            setVehicleForm({ ...vehicleForm, year: e.target.value })
          }
          required
        />
        <input
          className="field"
          type="number"
          placeholder="Capacidad"
          value={vehicleForm.capacity}
          onChange={(e) =>
            setVehicleForm({ ...vehicleForm, capacity: e.target.value })
          }
        />
        <Button type="submit" variant="primary">
          Alta vehículo
        </Button>
      </form>

      <form
        onSubmit={onCreate}
        className="fsg-panel grid grid-cols-1 gap-3 p-4 md:grid-cols-3"
      >
        <select
          className="field"
          value={vehicleId}
          onChange={(e) => setVehicleId(e.target.value)}
        >
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.plate} — {v.brand} {v.model}
            </option>
          ))}
        </select>
        <input
          className="field"
          placeholder="¿Qué hay que hacer? ej. frenos"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
        />
        <Button type="submit" variant="primary">
          Abrir orden de taller
        </Button>
      </form>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
                      className="field text-xs"
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

        <div className="fsg-panel data-shell overflow-hidden">
          <div className="border-b border-[var(--brand-line)] px-4 py-3 font-display text-sm font-semibold">
            Órdenes de trabajo
          </div>
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
                    <Badge tone="amber">{o.status}</Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    {o.status !== "DONE" ? (
                      <div className="flex flex-wrap gap-1">
                        {o.status === "OPEN" ? (
                          <Button
                            variant="ghost"
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
        </div>
      </div>
    </div>
  );
}
