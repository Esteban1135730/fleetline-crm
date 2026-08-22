"use client";

import { FormEvent, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { AlertTriangle, ClipboardList, Download, Plus, ShieldAlert, Star } from "lucide-react";
import { api, apiDownload } from "@/lib/api";
import { statusEs } from "@fsg/shared";
import { PageIntro } from "@/components/page-intro";
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
  type: "INCIDENT",
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
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState("");

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

  async function exportPesvExcel() {
    setExportError("");
    setExportBusy(true);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      await apiDownload(
        "/hqse/pesv/export/excel?days=90",
        `pesv-auditoria-${stamp}.xlsx`,
      );
    } catch (err) {
      setExportError(
        err instanceof Error
          ? err.message
          : "No se pudo exportar la auditoría PESV",
      );
    } finally {
      setExportBusy(false);
    }
  }

  function openForm() {
    setFormError("");
    setForm({
      ...EMPTY_FORM,
      date: new Date().toISOString().slice(0, 10),
    });
    setEvidence([]);
    setFormOpen(true);
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    const description = form.description.trim();
    if (description.length < 3) {
      setFormError("Indique la descripción de la novedad");
      return;
    }
    const title = form.date ? `${description} · ${form.date}` : description;
    setBusy(true);
    try {
      await api("/calidad/events", {
        method: "POST",
        body: JSON.stringify({
          type: form.type,
          title,
          description,
          score: form.type === "NPS" ? Number(form.score) : undefined,
        }),
      });
      setForm({ ...EMPTY_FORM, date: new Date().toISOString().slice(0, 10) });
      setEvidence([]);
      setFormOpen(false);
      await load();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "No se pudo registrar la novedad",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <PageIntro
        module="qhse"
        title="Safety Command Center"
        subtitle="PESV · telemetría forense · CAPA automático"
        action={
          <Button
            type="button"
            variant="ghost"
            className="w-auto border border-[var(--brand-line)]"
            loading={exportBusy}
            disabled={exportBusy}
            onClick={() => void exportPesvExcel()}
          >
            <Download className="mr-1.5 inline h-4 w-4" aria-hidden />
            Exportar auditoría PESV
          </Button>
        }
      />

      {exportError ? (
        <p
          role="alert"
          className="rounded-lg border border-[var(--accent-alert)]/40 px-4 py-3 text-sm text-[var(--accent-alert)]"
        >
          {exportError}
        </p>
      ) : null}

      {summary && summary.incidents > 0 ? (
        <div className="flex items-start gap-3 rounded-lg border border-[var(--accent-alert)]/40 bg-[var(--accent-alert)]/10 px-4 py-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 text-[var(--accent-alert)]" aria-hidden />
          <div>
            <p className="text-sm font-semibold">
              {summary.incidents} incidente{summary.incidents !== 1 ? "s" : ""} abiertos · telemetría activa
            </p>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              Frenadas bruscas y excesos de velocidad generan reportes automáticos con evidencia GPS.
            </p>
          </div>
        </div>
      ) : null}

      {summary ? (
        <div className="stagger grid grid-cols-1 gap-4 md:grid-cols-4">
          <KpiCard
            label="Satisfacción"
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

      <div className="flex justify-end">
        <Button type="button" variant="primary" className="w-auto px-4 py-2" onClick={openForm}>
          <Plus className="mr-1.5 inline h-4 w-4" aria-hidden />
          Nuevo reporte QHSE
        </Button>
      </div>

      {!rows.length ? (
        <EmptyState
          icon={<ClipboardList className="h-7 w-7" />}
          title="Sin reportes QHSE"
          description="Registre el primer evento de calidad, incidente o auditoría."
          actionLabel="+ Nuevo Reporte QHSE"
          onAction={openForm}
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
                      {statusEs(r.status)}
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
              disabled={busy}
            >
              Registrar
            </Button>
          </>
        }
      >
        <form id="qhse-report-form" onSubmit={onCreate} className="space-y-4">
          {formError ? (
            <p
              role="alert"
              className="rounded border border-[var(--brand-signal)]/40 bg-[var(--brand-signal)]/10 px-3 py-2 text-sm text-[var(--brand-signal)]"
            >
              {formError}
            </p>
          ) : null}
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Tipo
            </span>
            <select
              className="field w-full"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              <option value="INCIDENT">Incidente / novedad</option>
              <option value="NPS">Satisfacción</option>
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
              data-field="notes"
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
                Puntaje de satisfacción
              </span>
              <input
                className="field w-full font-data"
                data-field="integer"
                inputMode="numeric"
                min={0}
                max={10}
                placeholder="0 a 10"
                value={form.score}
                onChange={(e) =>
                  setForm({
                    ...form,
                    score: e.target.value.replace(/\D/g, "").slice(0, 2),
                  })
                }
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
