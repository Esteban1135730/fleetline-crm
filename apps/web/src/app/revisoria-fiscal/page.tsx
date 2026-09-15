"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@fsg/ui";
import { ClipboardList, Plus, ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";
import { statusEs } from "@fsg/shared";
import {
  EmptyState,
  EvidenceDropzone,
  KpiCard,
  SlideOver,
  StatusPulseBadge,
  StoredAttachmentViewer,
} from "@/components/audit";

type Finding = {
  id: string;
  code?: string;
  title: string;
  severity: string;
  status: string;
  detail: string;
  amount?: string | number | null;
  createdAt?: string;
  supportFileRef?: string | null;
  supportOriginalName?: string | null;
  supportMimeType?: string | null;
};

function severityTone(
  severity: string,
): "active" | "fatiga" | "danger" | "neutral" {
  if (severity === "CRITICAL") return "danger";
  if (severity === "HIGH") return "danger";
  if (severity === "MEDIUM") return "fatiga";
  if (severity === "LOW") return "active";
  return "neutral";
}

function statusTone(status: string): "active" | "fatiga" | "danger" | "neutral" {
  if (status === "OPEN") return "danger";
  if (status === "CLOSED") return "active";
  return "neutral";
}

function severityLabel(s: string) {
  if (s === "CRITICAL") return "Crítica";
  if (s === "HIGH") return "Alta";
  if (s === "MEDIUM") return "Media";
  if (s === "LOW") return "Baja";
  return s;
}

function formatCop(n: number) {
  return `$${Math.round(n).toLocaleString("es-CO")}`;
}

const EMPTY_FORM = {
  title: "",
  detail: "",
  severity: "MEDIUM",
  amount: "",
};

export default function RevisoriaPage() {
  const [rows, setRows] = useState<Finding[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [altaOpen, setAltaOpen] = useState(false);
  const [evidence, setEvidence] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterSeverity, setFilterSeverity] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");

  const load = useCallback(async () => {
    setRows(await api<Finding[]>("/revisoria/findings"));
  }, []);

  useEffect(() => {
    void load().catch((e) =>
      setError((e as Error).message || "Señal perdida — bitácora forense"),
    );
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api<Finding>("/revisoria/findings", {
        method: "POST",
        body: JSON.stringify({
          title: form.title,
          detail: form.detail,
          severity: form.severity,
          amount: form.amount ? Number(form.amount) : undefined,
        }),
      });
      if (evidence[0] && created?.id) {
        const fd = new FormData();
        fd.append("file", evidence[0]);
        await api(`/revisoria/findings/${created.id}/support`, {
          method: "POST",
          body: fd,
        });
      }
      setForm(EMPTY_FORM);
      setEvidence([]);
      setAltaOpen(false);
      await load();
    } catch (err) {
      setError((err as Error).message || "No se pudo registrar hallazgo");
    } finally {
      setBusy(false);
    }
  }

  async function closeFinding(id: string) {
    await api(`/revisoria/findings/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "CLOSED" }),
    });
    await load();
  }

  const stats = useMemo(() => {
    const open = rows.filter((r) => r.status === "OPEN");
    const critical = open.filter(
      (r) => r.severity === "HIGH" || r.severity === "CRITICAL",
    );
    const exposed = open.reduce(
      (sum, r) =>
        sum + (r.amount != null && r.amount !== "" ? Number(r.amount) : 0),
      0,
    );
    return { open: open.length, critical: critical.length, exposed };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filterSeverity !== "ALL" && r.severity !== filterSeverity) return false;
      if (filterStatus !== "ALL" && r.status !== filterStatus) return false;
      if (!q) return true;
      return (
        r.title.toLowerCase().includes(q) ||
        (r.code?.toLowerCase().includes(q) ?? false) ||
        r.detail.toLowerCase().includes(q)
      );
    });
  }, [rows, search, filterSeverity, filterStatus]);

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-sans text-xl font-semibold tracking-tight text-brand-text-primary">
            Revisoría forense
          </h1>
          <p className="mt-1 font-data text-[10px] uppercase tracking-[0.14em] text-brand-text-secondary">
            Bitácora inmutable · NEXA OS
          </p>
        </div>
        <Button
          type="button"
          variant="primary"
          className="w-auto px-4 py-2"
          onClick={() => setAltaOpen(true)}
        >
          <Plus className="mr-1.5 inline h-4 w-4" aria-hidden />
          Registrar hallazgo
        </Button>
      </header>

      <div
        className="nexa-panel flex flex-wrap items-center gap-3 border border-[color-mix(in_srgb,var(--brand-primary)_25%,transparent)] bg-[color-mix(in_srgb,var(--brand-primary)_6%,transparent)] p-3"
        data-testid="revisoria-immutable-banner"
      >
        <ShieldAlert className="h-5 w-5 shrink-0 text-[var(--brand-primary)]" />
        <p className="text-sm text-[var(--brand-text-primary)]">
          Bitácora inmutable — los hallazgos no pueden eliminarse. Solo cierre con
          evidencia adjunta.
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-[var(--brand-danger)]">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard
          label="Hallazgos abiertos"
          value={stats.open}
          tone={stats.open > 0 ? "warn" : "ok"}
          icon={<ClipboardList className="h-10 w-10" />}
        />
        <KpiCard
          label="Críticos / alta gravedad"
          value={stats.critical}
          tone={stats.critical > 0 ? "danger" : "ok"}
          icon={<ShieldAlert className="h-10 w-10" />}
        />
        <KpiCard
          label="Riesgo financiero expuesto"
          value={formatCop(stats.exposed)}
          tone={stats.exposed > 0 ? "danger" : "ok"}
        />
      </div>

      <div className="nexa-panel flex flex-wrap items-end gap-3 p-4">
        <label className="min-w-[200px] flex-1 text-xs text-[var(--brand-text-secondary)]">
          Búsqueda forense
          <input
            className="field mt-1 w-full"
            placeholder="Título, código RF-xxx o detalle"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="text-xs text-[var(--brand-text-secondary)]">
          Gravedad
          <select
            className="field mt-1"
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value)}
          >
            <option value="ALL">Todas</option>
            <option value="CRITICAL">Crítica</option>
            <option value="HIGH">Alta</option>
            <option value="MEDIUM">Media</option>
            <option value="LOW">Baja</option>
          </select>
        </label>
        <label className="text-xs text-[var(--brand-text-secondary)]">
          Estado
          <select
            className="field mt-1"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="ALL">Todos</option>
            <option value="OPEN">Abierto</option>
            <option value="CLOSED">Cerrado</option>
          </select>
        </label>
      </div>

      {!rows.length ? (
        <EmptyState
          icon={<ClipboardList className="h-7 w-7" />}
          title="Sin hallazgos indexados"
          description="La bitácora forense está vacía. Registra el primer hallazgo."
          actionLabel="Registrar hallazgo"
          onAction={() => setAltaOpen(true)}
        />
      ) : filteredRows.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-7 w-7" />}
          title="Sin coincidencias"
          description="Ajusta los filtros o el buscador forense."
        />
      ) : (
        <div className="nexa-panel data-shell overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="px-4 py-2">Fecha</th>
                <th className="px-4 py-2">Hallazgo</th>
                <th className="px-4 py-2">Gravedad</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr key={r.id} className="border-t border-[var(--brand-border)]">
                  <td className="px-4 py-2.5 font-data text-xs tabular-nums text-[var(--brand-text-secondary)]">
                    {r.createdAt
                      ? new Date(r.createdAt).toLocaleDateString("es-CO")
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    {r.code ? (
                      <div className="font-data text-xs font-bold text-[var(--brand-primary)]">
                        {r.code}
                      </div>
                    ) : null}
                    <div className="font-semibold text-[var(--brand-text-primary)]">
                      {r.title}
                    </div>
                    {r.detail ? (
                      <p className="mt-1 line-clamp-2 text-xs text-[var(--brand-text-secondary)]">
                        {r.detail}
                      </p>
                    ) : null}
                    {r.amount != null && r.amount !== "" ? (
                      <p className="mt-1 font-data text-sm font-bold tabular-nums text-[var(--brand-warning)]">
                        {formatCop(Number(r.amount))}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusPulseBadge
                      tone={severityTone(r.severity)}
                      pulse={
                        r.severity === "CRITICAL" || r.severity === "HIGH"
                      }
                    >
                      {severityLabel(r.severity)}
                    </StatusPulseBadge>
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusPulseBadge
                      tone={statusTone(r.status)}
                      pulse={r.status === "OPEN"}
                    >
                      {statusEs(r.status)}
                    </StatusPulseBadge>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-col items-start gap-2">
                      <StoredAttachmentViewer
                        title="Soporte"
                        emptyLabel="Sin soporte adjunto"
                        hasFile={Boolean(r.supportFileRef)}
                        supportPath={
                          r.supportFileRef
                            ? `/revisoria/findings/${r.id}/support`
                            : null
                        }
                        fileName={r.supportOriginalName}
                        mimeType={r.supportMimeType}
                      />
                      {r.status === "OPEN" ? (
                        <Button
                          variant="ghost"
                          className="w-auto px-3 py-1.5"
                          onClick={() => void closeFinding(r.id)}
                        >
                          Cerrar hallazgo
                        </Button>
                      ) : (
                        <span className="text-xs text-[var(--brand-text-secondary)]">
                          Inmutable
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SlideOver
        open={altaOpen}
        onClose={() => setAltaOpen(false)}
        title="Nuevo hallazgo"
        description="Evidencia forense · registro inmutable"
        widthClass="max-w-lg"
        footer={
          <Button
            type="submit"
            form="revisoria-alta-form"
            variant="primary"
            className="w-auto px-4 py-2"
            disabled={busy}
          >
            Registrar hallazgo
          </Button>
        }
      >
        <form
          id="revisoria-alta-form"
          onSubmit={onCreate}
          className="grid grid-cols-1 gap-3"
        >
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--brand-text-secondary)]">
            Título
            <input
              className="field"
              placeholder="Título del hallazgo"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--brand-text-secondary)]">
            Gravedad
            <select
              className="field"
              value={form.severity}
              onChange={(e) => setForm({ ...form, severity: e.target.value })}
            >
              <option value="LOW">Baja</option>
              <option value="MEDIUM">Media</option>
              <option value="HIGH">Alta</option>
              <option value="CRITICAL">Crítica</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--brand-text-secondary)]">
            Detalle
            <textarea
              className="field"
              rows={4}
              placeholder="Descripción forense del hallazgo"
              value={form.detail}
              onChange={(e) => setForm({ ...form, detail: e.target.value })}
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--brand-text-secondary)]">
            Monto expuesto (COP)
            <input
              className="field font-data"
              placeholder="Ej. 15000000"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </label>
          <div>
            <p className="mb-2 text-[11px] uppercase tracking-wide text-[var(--brand-text-secondary)]">
              Evidencia / adjuntos
            </p>
            <EvidenceDropzone
              acceptLabel="PDF o imágenes de soporte"
              onFiles={setEvidence}
            />
            {evidence.length > 0 ? (
              <p className="mt-2 font-data text-xs text-[var(--brand-text-secondary)]">
                {evidence.length} archivo(s) listo(s) para adjuntar al registrar
              </p>
            ) : null}
          </div>
        </form>
      </SlideOver>
    </div>
  );
}
