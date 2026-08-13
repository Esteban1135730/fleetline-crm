"use client";

import { FormEvent, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { AlertTriangle, ClipboardList, Plus, Star } from "lucide-react";
import { api } from "@/lib/api";
import {
  EmptyState,
  EvidenceDropzone,
  KpiCard,
  SlideOver,
  StatusPulseBadge,
} from "@/components/audit";

type Summary = {
  total: number;
  open: number;
  nps: number | null;
  incidents: number;
};
type Event = {
  id: string;
  type: string;
  title: string;
  score?: number | null;
  status: string;
  description?: string | null;
};

const EMPTY_FORM = {
  type: "NPS",
  date: "",
  description: "",
  score: "5",
};

function npsDisplay(nps: number | null | undefined) {
  if (nps == null) return "N/A";
  return String(nps);
}

export default function CalidadPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rows, setRows] = useState<Event[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [evidence, setEvidence] = useState<File[]>([]);

  async function load() {
    const [s, e] = await Promise.all([
      api<Summary>("/calidad/summary"),
      api<Event[]>("/calidad/events"),
    ]);
    setSummary(s);
    setRows(e);
  }
  useEffect(() => {
    void load().catch(console.error);
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const title = form.date
      ? `${form.description.trim()} · ${form.date}`
      : form.description.trim();
    await api("/calidad/events", {
      method: "POST",
      body: JSON.stringify({
        type: form.type,
        title,
        score: form.type === "NPS" ? Number(form.score) : undefined,
      }),
    });
    setForm({ ...EMPTY_FORM, date: new Date().toISOString().slice(0, 10) });
    setEvidence([]);
    setFormOpen(false);
    await load();
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="page-title text-3xl md:text-4xl">QHSE & NPS</h2>
          <p className="page-sub">Calidad, seguridad y satisfacción</p>
        </div>
        <Button
          type="button"
          variant="primary"
          className="w-auto px-4 py-2"
          onClick={() => {
            setForm({
              ...EMPTY_FORM,
              date: new Date().toISOString().slice(0, 10),
            });
            setFormOpen(true);
          }}
        >
          <Plus className="mr-1.5 inline h-4 w-4" aria-hidden />
          Nuevo Reporte QHSE
        </Button>
      </header>

      {summary ? (
        <div className="stagger grid grid-cols-1 gap-4 md:grid-cols-4">
          <KpiCard
            label="NPS"
            value={npsDisplay(summary.nps)}
            tone={
              summary.nps == null
                ? "neutral"
                : summary.nps >= 0
                  ? "ok"
                  : "danger"
            }
            icon={<Star />}
          />
          <KpiCard label="Eventos" value={summary.total} tone="neutral" />
          <KpiCard
            label="Abiertos"
            value={summary.open}
            tone={summary.open > 0 ? "warn" : "ok"}
          />
          <KpiCard
            label="Incidentes"
            value={summary.incidents}
            tone={summary.incidents > 0 ? "danger" : "ok"}
            icon={<AlertTriangle />}
          />
        </div>
      ) : null}

      {!rows.length ? (
        <EmptyState
          icon={<ClipboardList className="h-7 w-7" />}
          title="Sin reportes QHSE"
          description="Registre el primer evento de calidad, incidente o auditoría."
          actionLabel="+ Nuevo Reporte QHSE"
          onAction={() => {
            setForm({
              ...EMPTY_FORM,
              date: new Date().toISOString().slice(0, 10),
            });
            setFormOpen(true);
          }}
        />
      ) : (
        <div className="fsg-panel data-shell overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="px-4 py-2">Tipo</th>
                <th className="px-4 py-2">Título</th>
                <th className="px-4 py-2">Score</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-[var(--brand-line)]">
                  <td className="px-4 py-2.5">
                    <Badge>{r.type}</Badge>
                  </td>
                  <td className="px-4 py-2.5">{r.title}</td>
                  <td className="px-4 py-2.5 font-data tabular-nums">
                    {r.score != null ? r.score : "N/A"}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusPulseBadge
                      tone={r.status === "OPEN" ? "danger" : "active"}
                      pulse={r.status === "OPEN"}
                    >
                      {r.status}
                    </StatusPulseBadge>
                  </td>
                  <td className="px-4 py-2.5">
                    {r.status === "OPEN" ? (
                      <Button
                        variant="ghost"
                        className="w-auto px-3 py-1"
                        onClick={async () => {
                          await api(`/calidad/events/${r.id}`, {
                            method: "PATCH",
                            body: JSON.stringify({ status: "CLOSED" }),
                          });
                          await load();
                        }}
                      >
                        Cerrar
                      </Button>
                    ) : null}
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
        title="Nuevo reporte QHSE"
        description="Tipo, fecha, descripción y evidencia adjunta."
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
              form="qhse-report-form"
              variant="primary"
              className="w-auto px-4 py-2"
            >
              Registrar
            </Button>
          </>
        }
      >
        <form id="qhse-report-form" onSubmit={onCreate} className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Tipo
            </span>
            <select
              className="field w-full"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              <option value="NPS">NPS</option>
              <option value="INCIDENT">Incidente</option>
              <option value="AUDIT">Auditoría</option>
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Fecha
            </span>
            <input
              className="field w-full"
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              required
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Descripción
            </span>
            <textarea
              className="field min-h-[96px] w-full"
              placeholder="Detalle operativo del reporte"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              required
            />
          </label>
          {form.type === "NPS" ? (
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Score NPS
              </span>
              <input
                className="field w-full"
                type="number"
                min={0}
                max={10}
                value={form.score}
                onChange={(e) => setForm({ ...form, score: e.target.value })}
              />
            </label>
          ) : null}
          <div className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Evidencia
            </span>
            <EvidenceDropzone onFiles={setEvidence} />
            {evidence.length > 0 ? (
              <p className="font-mono text-xs text-slate-500">
                {evidence.length} archivo(s) listos para adjunto local
              </p>
            ) : null}
          </div>
        </form>
      </SlideOver>
    </div>
  );
}
