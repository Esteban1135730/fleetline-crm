"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Button } from "@fsg/ui";
import { ClipboardList, Plus } from "lucide-react";
import { api } from "@/lib/api";
import {
  EmptyState,
  EvidenceDropzone,
  SlideOver,
  StatusPulseBadge,
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
};

function severityTone(
  severity: string,
): "active" | "fatiga" | "danger" | "neutral" {
  if (severity === "HIGH" || severity === "CRITICAL") return "danger";
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
  if (s === "HIGH") return "Alta";
  if (s === "MEDIUM") return "Media";
  if (s === "LOW") return "Baja";
  return s;
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
      await api("/revisoria/findings", {
        method: "POST",
        body: JSON.stringify({
          title: form.title,
          detail: form.detail,
          severity: form.severity,
          amount: form.amount ? Number(form.amount) : undefined,
        }),
      });
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

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title text-3xl font-bold text-white md:text-4xl">
            Revisoría forense
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            Bitácora de hallazgos · control interno inmutable
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

      {error ? (
        <p role="alert" className="text-sm text-[var(--brand-signal)]">
          {error}
        </p>
      ) : null}

      {!rows.length ? (
        <EmptyState
          icon={<ClipboardList className="h-7 w-7" />}
          title="Sin hallazgos indexados"
          description="La bitácora forense está vacía. Registra el primer hallazgo."
          actionLabel="Registrar hallazgo"
          onAction={() => setAltaOpen(true)}
        />
      ) : (
        <div className="fsg-panel data-shell overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="px-4 py-2">Fecha</th>
                <th className="px-4 py-2">Título</th>
                <th className="px-4 py-2">Gravedad</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-[var(--brand-line)]">
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-400 tabular-nums">
                    {r.createdAt
                      ? new Date(r.createdAt).toLocaleDateString("es-CO")
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="font-bold text-white">{r.title}</div>
                    {r.code ? (
                      <div className="font-mono text-xs text-emerald-500/80">
                        {r.code}
                      </div>
                    ) : null}
                    {r.detail ? (
                      <p className="mt-1 line-clamp-2 text-xs text-gray-400">
                        {r.detail}
                      </p>
                    ) : null}
                    {r.amount != null && r.amount !== "" ? (
                      <p className="mt-1 font-mono text-xs text-amber-400">
                        ${Number(r.amount).toLocaleString("es-CO")}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusPulseBadge tone={severityTone(r.severity)}>
                      {severityLabel(r.severity)}
                    </StatusPulseBadge>
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusPulseBadge
                      tone={statusTone(r.status)}
                      pulse={r.status === "OPEN"}
                    >
                      {r.status}
                    </StatusPulseBadge>
                  </td>
                  <td className="px-4 py-2.5">
                    {r.status === "OPEN" ? (
                      <Button
                        variant="ghost"
                        className="w-auto px-3 py-1.5"
                        onClick={() => void closeFinding(r.id)}
                      >
                        Cerrar
                      </Button>
                    ) : (
                      <span className="text-xs text-slate-500">—</span>
                    )}
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
        description="Evidencia forense · bitácora de control interno"
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
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-slate-400">
            Título
            <input
              className="field"
              placeholder="Título del hallazgo"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-slate-400">
            Gravedad
            <select
              className="field"
              value={form.severity}
              onChange={(e) => setForm({ ...form, severity: e.target.value })}
            >
              <option value="LOW">Baja</option>
              <option value="MEDIUM">Media</option>
              <option value="HIGH">Alta</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-slate-400">
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
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-slate-400">
            Monto (opcional)
            <input
              className="field font-mono"
              placeholder="COP"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </label>
          <div>
            <p className="mb-2 text-[11px] uppercase tracking-wide text-slate-400">
              Adjuntos / evidencia
            </p>
            <EvidenceDropzone
              acceptLabel="PDF o imágenes de soporte"
              onFiles={setEvidence}
            />
            {evidence.length > 0 ? (
              <p className="mt-2 font-mono text-xs text-slate-500">
                {evidence.length} archivo(s) en cola local
              </p>
            ) : null}
          </div>
        </form>
      </SlideOver>
    </div>
  );
}
