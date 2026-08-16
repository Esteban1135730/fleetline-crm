"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button } from "@fsg/ui";
import { ParkingSquare, LogIn } from "lucide-react";
import { api } from "@/lib/api";
import { PageIntro } from "@/components/page-intro";
import {
  EmptyState,
  KpiCard,
  StatusPulseBadge,
} from "@/components/audit";

type ParkingLog = {
  id: string;
  plate: string;
  driverName?: string | null;
  guardName: string;
  checkInAt: string;
  checkOutAt?: string | null;
  vehicle?: { plate: string; brand: string } | null;
};

type Summary = { vehiclesInside: number; checkInsToday: number };

export default function ParqueaderoPage() {
  const [rows, setRows] = useState<ParkingLog[]>([]);
  const [summary, setSummary] = useState<Summary>({
    vehiclesInside: 0,
    checkInsToday: 0,
  });
  const [form, setForm] = useState({
    plate: "",
    driverName: "",
    guardName: "",
  });
  const [filter, setFilter] = useState<"ALL" | "INSIDE" | "OUT">("ALL");

  async function load() {
    const [logs, sum] = await Promise.all([
      api<ParkingLog[]>("/parqueadero/logs"),
      api<Summary>("/parqueadero/summary"),
    ]);
    setRows(logs);
    setSummary(sum);
  }

  useEffect(() => {
    void load().catch(console.error);
  }, []);

  async function onCheckIn(e: FormEvent) {
    e.preventDefault();
    await api("/parqueadero/checkin", {
      method: "POST",
      body: JSON.stringify(form),
    });
    setForm({ plate: "", driverName: "", guardName: form.guardName });
    await load();
  }

  const filtered = rows.filter((r) => {
    if (filter === "INSIDE") return !r.checkOutAt;
    if (filter === "OUT") return !!r.checkOutAt;
    return true;
  });

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <PageIntro module="parqueadero" title="Control de parqueadero" />

      <section className="grid gap-3 md:grid-cols-2">
        <KpiCard
          label="Vehículos en patio"
          value={summary.vehiclesInside}
          tone="ok"
          icon={<ParkingSquare />}
          delta="Sin salida registrada"
        />
        <KpiCard
          label="Ingresos hoy"
          value={summary.checkInsToday}
          tone="neutral"
          icon={<LogIn />}
          delta="Desde medianoche"
        />
      </section>

      <form
        onSubmit={onCheckIn}
        className="fsg-panel space-y-3 p-4"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            className="field h-11 min-h-[44px] font-data uppercase"
            placeholder="Placa (ej. ABC123)"
            value={form.plate}
            onChange={(e) =>
              setForm({ ...form, plate: e.target.value.toUpperCase() })
            }
            required
          />
          <input
            className="field h-11 min-h-[44px]"
            placeholder="Conductor"
            value={form.driverName}
            onChange={(e) => setForm({ ...form, driverName: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            className="field h-11 min-h-[44px] flex-1"
            placeholder="Guarda / verificador"
            value={form.guardName}
            onChange={(e) => setForm({ ...form, guardName: e.target.value })}
            required
          />
          <Button type="submit" variant="primary" className="w-auto px-4 py-2">
            Registrar ingreso
          </Button>
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-[var(--brand-muted)]">Filtrar:</span>
        <select
          className="field h-11 min-h-[44px] w-auto py-1 text-xs"
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
        >
          <option value="ALL">Todos</option>
          <option value="INSIDE">En patio</option>
          <option value="OUT">Con salida</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<ParkingSquare className="h-7 w-7" />}
          title="Sin movimientos de patio"
          description="Registra el primer ingreso con placa y guarda."
        />
      ) : (
        <div className="fsg-panel data-shell overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="px-4 py-2">Placa</th>
                <th className="px-4 py-2">Conductor</th>
                <th className="px-4 py-2">Ingreso</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-[var(--brand-line)]">
                  <td className="px-4 py-2.5 font-data">{r.plate}</td>
                  <td className="px-4 py-2.5">
                    {r.driverName || "—"}
                    <div className="text-[11px] text-[var(--brand-muted)]">
                      Guarda: {r.guardName}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 font-data text-xs tabular-nums">
                    {new Date(r.checkInAt).toLocaleString("es-CO")}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusPulseBadge
                      tone={r.checkOutAt ? "neutral" : "active"}
                      pulse={!r.checkOutAt}
                    >
                      {r.checkOutAt ? "SALIDA" : "EN PATIO"}
                    </StatusPulseBadge>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {!r.checkOutAt ? (
                      <Button
                        variant="ghost"
                        className="w-auto px-3 py-1.5"
                        onClick={async () => {
                          await api(`/parqueadero/checkout/${r.id}`, {
                            method: "PATCH",
                          });
                          await load();
                        }}
                      >
                        Registrar salida
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
