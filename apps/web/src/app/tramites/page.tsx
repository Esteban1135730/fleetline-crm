"use client";

import { FormEvent, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { api } from "@/lib/api";
import { HowToBox, PageIntro } from "@/components/page-intro";

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
  const [form, setForm] = useState({
    vehicleId: "",
    type: "SOAT",
    reference: "",
    validTo: "",
    notes: "",
  });

  async function load() {
    const [p, v] = await Promise.all([
      api<Procedure[]>("/tramites/procedures"),
      api<Vehicle[]>("/fleet/vehicles"),
    ]);
    setRows(p);
    setVehicles(v);
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

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <PageIntro module="tramites" title="Trámites y documentos del vehículo" />
      <HowToBox
        steps={[
          "Selecciona el vehículo y el tipo de trámite (SOAT, tecnomecánica, etc.).",
          "Indica la fecha de vencimiento; el sistema alerta si está por vencer.",
          "Los vencidos aparecen en rojo para gestión con el área de trámites/carros.",
        ]}
      />

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
