"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button } from "@fsg/ui";
import { FileText, FolderOpen, Plus, ShieldAlert } from "lucide-react";
import { api, API_URL } from "@/lib/api";
import {
  EmptyState,
  EvidenceDropzone,
  KpiCard,
  SlideOver,
  StatusPulseBadge,
} from "@/components/audit";

type Evidence = {
  id: string;
  source: string;
  title: string;
  fileRef?: string | null;
  originalName?: string | null;
  createdAt: string;
};

type Check = {
  id: string;
  subjectName: string;
  subjectDoc: string;
  document?: string;
  risk: string;
  notes?: string | null;
  checkedAt?: string;
  createdAt?: string;
  evidenceCount?: number;
  evidences?: Evidence[];
};

const EMPTY_FORM = {
  subjectName: "",
  subjectDoc: "",
  risk: "LOW",
  notes: "",
};

const EVIDENCE_SOURCES: { id: string; label: string }[] = [
  { id: "POLICIA", label: "Policía Nacional" },
  { id: "PROCURADURIA", label: "Procuraduría" },
  { id: "REGISTRADURIA", label: "Registraduría" },
  { id: "ANTECEDENTES", label: "Antecedentes judiciales" },
  { id: "LISTAS", label: "Listas restrictivas (OFAC / ONU / PEPS)" },
  { id: "OTHER", label: "Otra evidencia" },
];

const SOURCE_ES: Record<string, string> = Object.fromEntries(
  EVIDENCE_SOURCES.map((s) => [s.id, s.label]),
);

function riskBadge(risk: string) {
  const u = risk.toUpperCase();
  if (u === "LOW") return { tone: "active" as const, label: "Bajo", pulse: false };
  if (u === "MEDIUM")
    return { tone: "fatiga" as const, label: "Medio", pulse: false };
  if (u === "HIGH")
    return { tone: "danger" as const, label: "Alto", pulse: true };
  return { tone: "danger" as const, label: "Bloqueado", pulse: true };
}

function formatCheckedAt(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-CO");
}

function fileHref(ref?: string | null) {
  if (!ref) return null;
  return ref.startsWith("http") ? ref : `${API_URL}${ref}`;
}

export default function SarlaftPage() {
  const [rows, setRows] = useState<Check[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dossier, setDossier] = useState<Check | null>(null);
  const [source, setSource] = useState("POLICIA");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [dossierError, setDossierError] = useState("");
  const [dossierBusy, setDossierBusy] = useState(false);

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
      const d = new Date(r.checkedAt || r.createdAt || "");
      return (
        !Number.isNaN(d.getTime()) &&
        d.getMonth() === month &&
        d.getFullYear() === year
      );
    }).length;
    const medio = rows.filter((r) => r.risk === "MEDIUM").length;
    const alto = rows.filter(
      (r) => r.risk === "HIGH" || r.risk === "BLOCKED",
    ).length;
    return { consultasMes, medio, alto };
  }, [rows]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    setBusy(true);
    try {
      await api("/sarlaft/checks", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm(EMPTY_FORM);
      setFormOpen(false);
      await load();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "No se pudo registrar la consulta",
      );
    } finally {
      setBusy(false);
    }
  }

  async function openDossier(row: Check) {
    setDossierError("");
    setPendingFiles([]);
    setSource("POLICIA");
    try {
      const evidences = await api<Evidence[]>(
        `/sarlaft/checks/${row.id}/evidence`,
      );
      setDossier({ ...row, evidences });
    } catch {
      setDossier({ ...row, evidences: row.evidences ?? [] });
    }
  }

  async function uploadEvidence() {
    if (!dossier || !pendingFiles[0]) {
      setDossierError("Adjunte el PDF o imagen de la consulta");
      return;
    }
    setDossierError("");
    setDossierBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", pendingFiles[0]);
      fd.append("source", source);
      fd.append("title", pendingFiles[0].name);
      await api(`/sarlaft/checks/${dossier.id}/evidence`, {
        method: "POST",
        body: fd,
      });
      setPendingFiles([]);
      const evidences = await api<Evidence[]>(
        `/sarlaft/checks/${dossier.id}/evidence`,
      );
      setDossier({ ...dossier, evidences, evidenceCount: evidences.length });
      await load();
    } catch (err) {
      setDossierError(
        err instanceof Error ? err.message : "No se pudo indexar la evidencia",
      );
    } finally {
      setDossierBusy(false);
    }
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
          onClick={() => {
            setFormError("");
            setFormOpen(true);
          }}
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
                <th className="px-4 py-2">Evidencias</th>
                <th className="px-4 py-2">Riesgo</th>
                <th className="px-4 py-2">Fecha</th>
                <th className="px-4 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const badge = riskBadge(r.risk);
                const doc = r.subjectDoc || r.document || "—";
                const count = r.evidenceCount ?? r.evidences?.length ?? 0;
                return (
                  <tr key={r.id} className="border-t border-[var(--brand-line)]">
                    <td className="px-4 py-4">
                      <div className="font-bold">{r.subjectName}</div>
                      {r.notes ? (
                        <div className="text-sm text-[var(--brand-muted)]">
                          {r.notes}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-4 font-data text-xs text-[var(--brand-muted)]">
                      {doc}
                    </td>
                    <td className="px-4 py-4">
                      <Button
                        type="button"
                        variant="ghost"
                        className="w-auto px-3 py-1"
                        onClick={() => void openDossier(r)}
                      >
                        <FolderOpen className="mr-1 inline h-3.5 w-3.5" />
                        {count} archivo{count === 1 ? "" : "s"}
                      </Button>
                    </td>
                    <td className="px-4 py-4">
                      <StatusPulseBadge tone={badge.tone} pulse={badge.pulse}>
                        {badge.label}
                      </StatusPulseBadge>
                    </td>
                    <td className="px-4 py-4 font-data text-xs text-[var(--brand-muted)]">
                      {formatCheckedAt(r.checkedAt || r.createdAt)}
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
              disabled={busy}
            >
              Registrar chequeo
            </Button>
          </>
        }
      >
        <form id="sarlaft-form" onSubmit={onCreate} className="space-y-4">
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
              Nombre / razón social
            </span>
            <input
              className="field w-full"
              data-field="legalName"
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
              className="field w-full font-data"
              data-field="document"
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
              data-field="notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>
        </form>
      </SlideOver>

      <SlideOver
        open={Boolean(dossier)}
        onClose={() => setDossier(null)}
        title={dossier ? `Expediente · ${dossier.subjectName}` : "Expediente"}
        description="Evidencias de policía, procuraduría, registraduría y antecedentes. Quedan selladas para auditoría SARLAFT."
        widthClass="max-w-lg"
        footer={
          <Button
            type="button"
            variant="ghost"
            className="w-auto px-4 py-2"
            onClick={() => setDossier(null)}
          >
            Cerrar
          </Button>
        }
      >
        {dossier ? (
          <div className="space-y-4">
            <p className="font-data text-xs text-[var(--brand-muted)]">
              {dossier.subjectDoc || dossier.document} ·{" "}
              {formatCheckedAt(dossier.checkedAt || dossier.createdAt)}
            </p>

            {(dossier.evidences ?? []).length ? (
              <ul className="divide-y divide-[var(--brand-line)] rounded-lg border border-[var(--brand-line)]">
                {(dossier.evidences ?? []).map((ev) => {
                  const href = fileHref(ev.fileRef);
                  return (
                    <li key={ev.id} className="px-3 py-2.5">
                      <p className="text-[10px] uppercase tracking-wide text-[var(--brand-muted)]">
                        {SOURCE_ES[ev.source] || ev.source}
                      </p>
                      <p className="text-sm">{ev.title}</p>
                      <p className="font-data text-[10px] text-[var(--brand-muted)]">
                        {formatCheckedAt(ev.createdAt)}
                      </p>
                      {href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-flex items-center text-xs font-semibold text-[var(--brand-primary)]"
                        >
                          <FileText className="mr-1 h-3.5 w-3.5" />
                          Abrir evidencia
                        </a>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-[var(--brand-muted)]">
                Sin evidencias indexadas. Adjunte el pantallazo o PDF de cada
                consulta.
              </p>
            )}

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Fuente de la consulta
              </span>
              <select
                className="field w-full"
                value={source}
                onChange={(e) => setSource(e.target.value)}
              >
                {EVIDENCE_SOURCES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <EvidenceDropzone onFiles={setPendingFiles} />
            {pendingFiles[0] ? (
              <p className="font-data text-xs text-[var(--brand-primary)]">
                Listo: {pendingFiles[0].name}
              </p>
            ) : null}
            {dossierError ? (
              <p
                role="alert"
                className="rounded border border-[var(--brand-signal)]/40 bg-[var(--brand-signal)]/10 px-3 py-2 text-sm text-[var(--brand-signal)]"
              >
                {dossierError}
              </p>
            ) : null}
            <div className="flex justify-end">
              <Button
                type="button"
                variant="primary"
                className="w-auto"
                disabled={dossierBusy}
                onClick={() => void uploadEvidence()}
              >
                Indexar evidencia
              </Button>
            </div>
          </div>
        ) : null}
      </SlideOver>
    </div>
  );
}
