"use client";

import { FormEvent, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { AlertTriangle, ClipboardList, Download, Plus, ShieldAlert, Star } from "lucide-react";
import { api, apiDownload } from "@/lib/api";
import { statusEs } from "@fsg/shared";
import {
  EmptyState,
  EvidenceDropzone,
  KpiCard,
  SlideOver,
  StatusPulseBadge,
} from "@/components/audit";
import { BentoPanel } from "@/components/nexa/bento-panel";
import { NexaTable, NexaRow, NexaCell } from "@/components/nexa/nexa-table";
import { ComplianceBadge } from "@/components/rrhh/compliance-badge";

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
          : "No se pudo exportar la auditorÃ­a PESV",
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
      setFormError("Indique la descripciÃ³n de la novedad");
      return;
    }
    const title = form.date ? `${description} Â· ${form.date}` : description;
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
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-border pb-4">
        <div>
          <p className="font-data text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-primary">
            QHSE / PESV
          </p>
          <h1 className="font-sans text-2xl font-semibold tracking-tight text-brand-text-primary md:text-3xl">
            Safety Command Center
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            className="w-auto border border-brand-border"
            loading={exportBusy}
            disabled={exportBusy}
            onClick={() => void exportPesvExcel()}
          >
            <Download className="mr-1.5 inline h-4 w-4" aria-hidden />
            Exportar auditoría PESV
          </Button>
          <Button type="button" variant="primary" className="w-auto px-4 py-2" onClick={openForm}>
            <Plus className="mr-1.5 inline h-4 w-4" aria-hidden />
            Nuevo reporte
          </Button>
        </div>
      </header>

      {exportError ? (
        <p
          role="alert"
          className="rounded-lg border border-brand-danger/40 px-4 py-3 text-sm text-brand-danger"
        >
          {exportError}
        </p>
      ) : null}

      {summary && summary.incidents > 0 ? (
        <div className="flex items-start gap-3 rounded-lg border border-brand-danger/40 bg-brand-danger/10 px-4 py-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 text-brand-danger" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-brand-text-primary">
              {summary.incidents} incidente{summary.incidents !== 1 ? "s" : ""} abiertos · telemetría activa
            </p>
            <p className="mt-0.5 text-xs text-brand-text-secondary">
              Frenadas bruscas y excesos de velocidad generan reportes automáticos con evidencia GPS.
            </p>
          </div>
        </div>
      ) : null}

      {summary ? (
        <div className="stagger grid grid-cols-1 gap-4 md:grid-cols-4">
          <KpiCard
            label="SatisfacciÃ³n"
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
          description="Registre el primer evento de calidad, incidente o auditorÃ­a."
          actionLabel="+ Nuevo Reporte QHSE"
          onAction={openForm}
        />
      ) : (
        <BentoPanel
          title="Registro QHSE / PESV"
          subtitle={`${rows.length} eventos`}
          icon={<ClipboardList className="h-4 w-4" />}
        >
          <NexaTable columns={["Tipo", "Título", "Score", "Estado", "Acciones"]}>
            {rows.map((r) => (
              <NexaRow key={r.id}>
                <NexaCell>
                  <Badge>{r.type}</Badge>
                </NexaCell>
                <NexaCell>{r.title}</NexaCell>
                <NexaCell mono>{r.score != null ? r.score : "N/A"}</NexaCell>
                <NexaCell>
                  <StatusPulseBadge
                    tone={r.status === "OPEN" ? "danger" : "active"}
                    pulse={r.status === "OPEN"}
                  >
                    {statusEs(r.status)}
                  </StatusPulseBadge>
                </NexaCell>
                <NexaCell>
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
                </NexaCell>
              </NexaRow>
            ))}
          </NexaTable>
        </BentoPanel>
      )}

      <SlideOver
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Nuevo reporte QHSE"
        description="Tipo, fecha, descripciÃ³n y evidencia adjunta."
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
              className="rounded border border-[var(--brand-danger)]/40 bg-[var(--brand-danger)]/10 px-3 py-2 text-sm text-[var(--brand-danger)]"
            >
              {formError}
            </p>
          ) : null}
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-brand-text-secondary">
              Tipo
            </span>
            <select
              className="field w-full"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              <option value="INCIDENT">Incidente / novedad</option>
              <option value="NPS">SatisfacciÃ³n</option>
              <option value="AUDIT">AuditorÃ­a</option>
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-brand-text-secondary">
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
            <span className="text-xs font-semibold uppercase tracking-wider text-brand-text-secondary">
              DescripciÃ³n
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
              <span className="text-xs font-semibold uppercase tracking-wider text-brand-text-secondary">
                Puntaje de satisfacciÃ³n
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
            <span className="text-xs font-semibold uppercase tracking-wider text-brand-text-secondary">
              Evidencia
            </span>
            <EvidenceDropzone onFiles={setEvidence} />
            {evidence.length > 0 ? (
              <p className="font-mono text-xs text-brand-text-secondary">
                {evidence.length} archivo(s) listos para adjunto local
              </p>
            ) : null}
          </div>
        </form>
      </SlideOver>
    </div>
  );
}
