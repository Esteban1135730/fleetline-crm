"use client";

import { useCallback, useEffect, useState } from "react";
import { FileUp, CheckCircle2, CircleAlert } from "lucide-react";
import { api } from "@/lib/api";

type DocFile = {
  id: string;
  title: string;
  fileRef: string | null;
  originalName: string | null;
  createdAt: string;
  validationStatus?: string;
  expiresAt?: string | null;
};

type ChecklistSlot = {
  key: string;
  label: string;
  description: string;
  required: boolean;
  docType: string;
  status: "UPLOADED" | "MISSING";
  document: DocFile | null;
};

type Dossier = {
  employee: {
    id: string;
    name: string;
    document: string;
    title: string;
    area: string;
    driverId?: string | null;
  };
  license?: {
    number?: string | null;
    category?: string | null;
    expiresAt?: string | null;
  } | null;
  profileLabel: string;
  checklist: ChecklistSlot[];
  progress: {
    requiredTotal: number;
    requiredDone: number;
    complete: boolean;
  };
};

type Props = {
  employeeId: string;
  onError?: (msg: string) => void;
  onStatus?: (msg: string) => void;
  /** Recargar tabla RRHH (semáforo licencia) tras actualizar datos */
  onLicenseUpdated?: () => void;
};

const LICENSE_CATEGORIES = ["A1", "A2", "B1", "B2", "B3", "C1", "C2", "C3"];

function isoDateInput(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function EmployeeDocumentsPanel({
  employeeId,
  onError,
  onStatus,
  onLicenseUpdated,
}: Props) {
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [licenseForm, setLicenseForm] = useState({
    number: "",
    category: "C1",
    expiresAt: "",
  });
  const [pendingFile, setPendingFile] = useState<{
    slot: ChecklistSlot;
    file: File;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<Dossier>(`/rrhh/employees/${employeeId}/documents`);
      setDossier(data);
      setLicenseForm({
        number: data.license?.number ?? "",
        category: data.license?.category ?? "C1",
        expiresAt: isoDateInput(data.license?.expiresAt),
      });
    } catch (err) {
      onError?.(
        err instanceof Error ? err.message : "No se pudo cargar documentos",
      );
    } finally {
      setLoading(false);
    }
  }, [employeeId, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function uploadForSlot(
    slot: ChecklistSlot,
    file: File,
    license?: { number: string; category: string; expiresAt: string },
  ) {
    setUploadingKey(slot.key);
    onError?.("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("slotKey", slot.key);
      fd.append("title", `${slot.label}`);
      if (license) {
        fd.append("licenseNumber", license.number);
        fd.append("licenseCategory", license.category);
        fd.append("licenseExpiresAt", license.expiresAt);
      }
      const res = await api<{ dossier: Dossier }>(
        `/rrhh/employees/${employeeId}/documents`,
        { method: "POST", body: fd },
      );
      setDossier(res.dossier);
      setPendingFile(null);
      onStatus?.(
        slot.key === "LICENCIA"
          ? "Licencia guardada · datos del conductor actualizados"
          : `Documento cargado: ${slot.label}`,
      );
      if (slot.key === "LICENCIA") onLicenseUpdated?.();
    } catch (err) {
      onError?.(
        err instanceof Error ? err.message : "No se pudo subir el archivo",
      );
    } finally {
      setUploadingKey(null);
    }
  }

  function onPickFile(slot: ChecklistSlot, file: File) {
    if (slot.key === "LICENCIA") {
      setPendingFile({ slot, file });
      return;
    }
    void uploadForSlot(slot, file);
  }

  function confirmLicenseUpload() {
    if (!pendingFile) return;
    const number = licenseForm.number.trim();
    const category = licenseForm.category.trim();
    const expiresAt = licenseForm.expiresAt.trim();
    if (!number || !category || !expiresAt) {
      onError?.(
        "Completa número, categoría y vencimiento de la licencia antes de guardar",
      );
      return;
    }
    void uploadForSlot(pendingFile.slot, pendingFile.file, {
      number,
      category,
      expiresAt,
    });
  }

  if (loading && !dossier) {
    return (
      <p className="text-sm text-[var(--text-secondary)]">
        Cargando expediente documental…
      </p>
    );
  }

  if (!dossier) return null;

  const pct =
    dossier.progress.requiredTotal === 0
      ? 100
      : Math.round(
          (dossier.progress.requiredDone / dossier.progress.requiredTotal) *
            100,
        );

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-[var(--brand-line)] bg-[color-mix(in_srgb,var(--accent-primary)_6%,transparent)] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-[var(--text-primary)]">
              {dossier.employee.name}
            </div>
            <div className="text-xs text-[var(--text-secondary)]">
              {dossier.employee.title} · {dossier.profileLabel}
            </div>
          </div>
          <div className="text-right">
            <div className="font-data text-lg text-[var(--brand-primary)]">
              {pct}%
            </div>
            <div className="text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">
              Obligatorios {dossier.progress.requiredDone}/
              {dossier.progress.requiredTotal}
            </div>
          </div>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--border-subtle)]">
          <div
            className="h-full rounded-full bg-[var(--brand-primary)] transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {pendingFile?.slot.key === "LICENCIA" ? (
        <div className="space-y-3 rounded-lg border border-[var(--brand-primary)]/40 bg-[color-mix(in_srgb,var(--accent-primary)_8%,transparent)] p-3">
          <div>
            <div className="text-sm font-semibold text-[var(--text-primary)]">
              Datos de la licencia
            </div>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              Archivo:{" "}
              <span className="font-data">{pendingFile.file.name}</span>
              . Escribe los datos que ves en el documento (así se quita el
              BLOQUEO).
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">
              Número
              <input
                className="field font-data"
                value={licenseForm.number}
                onChange={(e) =>
                  setLicenseForm({ ...licenseForm, number: e.target.value })
                }
                placeholder="Ej. 123456789"
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">
              Categoría
              <select
                className="field"
                value={licenseForm.category}
                onChange={(e) =>
                  setLicenseForm({ ...licenseForm, category: e.target.value })
                }
              >
                {LICENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">
              Vence
              <input
                className="field font-data"
                type="date"
                value={licenseForm.expiresAt}
                onChange={(e) =>
                  setLicenseForm({ ...licenseForm, expiresAt: e.target.value })
                }
                required
              />
            </label>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="rounded-md px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              onClick={() => setPendingFile(null)}
              disabled={uploadingKey === "LICENCIA"}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="rounded-md bg-[var(--brand-primary)] px-3 py-1.5 text-xs font-semibold text-[#04110c]"
              onClick={confirmLicenseUpload}
              disabled={uploadingKey === "LICENCIA"}
            >
              {uploadingKey === "LICENCIA"
                ? "Guardando…"
                : "Guardar licencia y datos"}
            </button>
          </div>
        </div>
      ) : null}

      <ul className="space-y-3">
        {dossier.checklist.map((slot) => {
          const done = slot.status === "UPLOADED";
          const isLicense = slot.key === "LICENCIA";
          return (
            <li
              key={slot.key}
              className="rounded-lg border border-[var(--brand-line)] p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {done ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--brand-primary)]" />
                    ) : (
                      <CircleAlert
                        className={`h-4 w-4 shrink-0 ${
                          slot.required
                            ? "text-[var(--brand-amber)]"
                            : "text-[var(--brand-muted)]"
                        }`}
                      />
                    )}
                    <span className="text-sm font-semibold text-[var(--text-primary)]">
                      {slot.label}
                      {slot.required ? (
                        <span className="ml-1 text-[10px] uppercase text-[var(--brand-amber)]">
                          Obligatorio
                        </span>
                      ) : (
                        <span className="ml-1 text-[10px] uppercase text-[var(--brand-muted)]">
                          Opcional
                        </span>
                      )}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    {isLicense
                      ? "Sube el PDF/foto y completa número, categoría y vencimiento"
                      : slot.description}
                  </p>
                  {isLicense && dossier.license?.expiresAt ? (
                    <p className="mt-1 font-data text-[11px] text-[var(--brand-primary)]">
                      Vigente · {dossier.license.category || "—"} · vence{" "}
                      {new Date(dossier.license.expiresAt).toLocaleDateString(
                        "es-CO",
                      )}
                    </p>
                  ) : null}
                  {slot.document ? (
                    <p className="mt-1 font-data text-[11px] text-[var(--text-secondary)]">
                      {slot.document.originalName || slot.document.title} ·{" "}
                      {new Date(slot.document.createdAt).toLocaleDateString(
                        "es-CO",
                      )}
                      {slot.document.fileRef ? (
                        <>
                          {" · "}
                          <a
                            href={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}${slot.document.fileRef}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[var(--brand-primary)] underline"
                          >
                            Ver archivo
                          </a>
                        </>
                      ) : null}
                    </p>
                  ) : null}
                </div>
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[var(--brand-line)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)]">
                  <input
                    type="file"
                    className="sr-only"
                    accept=".pdf,image/png,image/jpeg,image/webp"
                    disabled={uploadingKey === slot.key}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) onPickFile(slot, file);
                    }}
                  />
                  <FileUp className="h-3.5 w-3.5" />
                  {uploadingKey === slot.key
                    ? "Subiendo…"
                    : done
                      ? "Reemplazar"
                      : "Subir"}
                </label>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
