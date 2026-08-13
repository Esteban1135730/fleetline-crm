"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button } from "@fsg/ui";
import { Plus, ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";
import {
  EmptyState,
  KpiCard,
  SlideOver,
  StatusPulseBadge,
} from "@/components/audit";

type Check = {
  id: string;
  subjectName: string;
  subjectDoc: string;
  risk: string;
  notes?: string | null;
  checkedAt: string;
};

const EMPTY_FORM = {
  subjectName: "",
  subjectDoc: "",
  risk: "LOW",
  notes: "",
};

function riskBadge(risk: string) {
  const u = risk.toUpperCase();
  if (u === "LOW") return { tone: "active" as const, label: "Bajo", pulse: false };
  if (u === "MEDIUM")
    return { tone: "fatiga" as const, label: "Medio", pulse: false };
  if (u === "HIGH")
    return { tone: "danger" as const, label: "Alto", pulse: true };
  return { tone: "danger" as const, label: "Bloqueado", pulse: true };
}

export default function SarlaftPage() {
  const [rows, setRows] = useState<Check[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  async function load() {
    setRows(await api<Check[]>("/sarlaft/checks"));
  }
  useEffect(() => {
    void load().catch(console.error);
  }, []);

  const kpis = useMemo(() => {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    const consultasMes = rows.filter((r) => {
      const d = new Date(r.checkedAt);
      return d.getMonth() === month && d.getFullYear() === year;
    }).length;
    const medio = rows.filter((r) => r.risk === "MEDIUM").length;
    const alto = rows.filter(
      (r) => r.risk === "HIGH" || r.risk === "BLOCKED",
    ).length;
    return { consultasMes, medio, alto };
  }, [rows]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    await api("/sarlaft/checks", { method: "POST", body: JSON.stringify(form) });
    setForm(EMPTY_FORM);
    setFormOpen(false);
    await load();
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="page-title text-3xl md:text-4xl">SARLAFT</h2>
          <p className="page-sub">Debida diligencia y clasificación de riesgo</p>
        </div>
        <Button
          type="button"
          variant="primary"
          className="w-auto px-4 py-2"
          onClick={() => setFormOpen(true)}
        >
          <Plus className="mr-1.5 inline h-4 w-4" aria-hidden />
          Nueva consulta
        </Button>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <KpiCard
          label="Debidas Diligencias Realizadas"
          value={kpis.consultasMes}
          delta="Consultas del mes"
          tone="neutral"
        />
        <KpiCard
          label="Alertas en Listas Restrictivas"
          value={kpis.medio + kpis.alto}
          delta={`${kpis.medio} medio · ${kpis.alto} alto`}
          tone={kpis.alto > 0 ? "danger" : kpis.medio > 0 ? "warn" : "ok"}
        />
        <div className={kpis.alto > 0 ? "animate-pulse rounded-xl" : undefined}>
          <KpiCard
            label="Riesgo Alto"
            value={kpis.alto}
            delta="HIGH / BLOCKED · pulse"
            tone={kpis.alto > 0 ? "danger" : "ok"}
            icon={<ShieldAlert />}
          />
        </div>
      </div>

      {!rows.length ? (
        <EmptyState
          icon={<ShieldAlert className="h-7 w-7" />}
          title="Sin consultas SARLAFT"
          description="Registre la primera debida diligencia del periodo."
          actionLabel="+ Nueva consulta"
          onAction={() => setFormOpen(true)}
        />
      ) : (
        <div className="fsg-panel data-shell overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="px-4 py-2">Sujeto</th>
                <th className="px-4 py-2">Documento</th>
                <th className="px-4 py-2">Riesgo</th>
                <th className="px-4 py-2">Fecha</th>
                <th className="px-4 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const badge = riskBadge(r.risk);
                return (
                  <tr key={r.id} className="border-t border-[var(--brand-line)]">
                    <td className="px-4 py-4">
                      <div className="font-bold text-white">{r.subjectName}</div>
                      {r.notes ? (
                        <div className="text-sm text-gray-400">{r.notes}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-4 font-data text-xs text-gray-400">
                      {r.subjectDoc}
                    </td>
                    <td className="px-4 py-4">
                      <StatusPulseBadge tone={badge.tone} pulse={badge.pulse}>
                        {badge.label}
                      </StatusPulseBadge>
                    </td>
                    <td className="px-4 py-4 font-data text-xs text-gray-400">
                      {new Date(r.checkedAt).toLocaleString("es-CO")}
                    </td>
                    <td className="px-4 py-2.5">
                      <select
                        className="field py-1 text-xs"
                        value={r.risk}
                        onChange={async (e) => {
                          await api(`/sarlaft/checks/${r.id}`, {
                            method: "PATCH",
                            body: JSON.stringify({ risk: e.target.value }),
                          });
                          await load();
                        }}
                      >
                        <option value="LOW">Bajo</option>
                        <option value="MEDIUM">Medio</option>
                        <option value="HIGH">Alto</option>
                        <option value="BLOCKED">Bloqueado</option>
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <SlideOver
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Nueva consulta SARLAFT"
        description="Debida diligencia y clasificación de riesgo."
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
              form="sarlaft-form"
              variant="primary"
              className="w-auto px-4 py-2"
            >
              Registrar chequeo
            </Button>
          </>
        }
      >
        <form id="sarlaft-form" onSubmit={onCreate} className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Nombre / razón social
            </span>
            <input
              className="field w-full"
              value={form.subjectName}
              onChange={(e) =>
                setForm({ ...form, subjectName: e.target.value })
              }
              required
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Documento / NIT
            </span>
            <input
              className="field w-full"
              value={form.subjectDoc}
              onChange={(e) =>
                setForm({ ...form, subjectDoc: e.target.value })
              }
              required
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Nivel de riesgo
            </span>
            <select
              className="field w-full"
              value={form.risk}
              onChange={(e) => setForm({ ...form, risk: e.target.value })}
            >
              <option value="LOW">Bajo</option>
              <option value="MEDIUM">Medio</option>
              <option value="HIGH">Alto</option>
              <option value="BLOCKED">Bloqueado</option>
            </select>
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
