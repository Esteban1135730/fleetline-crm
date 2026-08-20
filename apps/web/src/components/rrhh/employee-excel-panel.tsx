"use client";

import { useMemo, useState } from "react";
import { Button } from "@fsg/ui";
import {
  RRHH_EXCEL_COLUMNS,
  RRHH_EXCEL_DEFAULT_EXPORT_KEYS,
  RRHH_EXCEL_GROUP_LABELS,
  RRHH_EXCEL_IMPORT_KEYS,
  type RrhhExcelColumnGroup,
  type RrhhExcelColumnKey,
} from "@fsg/shared";
import { Download, Upload } from "lucide-react";
import { Modal } from "@/components/audit";
import { api, apiDownload } from "@/lib/api";

type ImportResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onImported?: () => void;
};

const GROUPS = Object.keys(RRHH_EXCEL_GROUP_LABELS) as RrhhExcelColumnGroup[];

export function EmployeeExcelPanel({ open, onClose, onImported }: Props) {
  const [mode, setMode] = useState<"export" | "import">("export");
  const [selected, setSelected] = useState<Set<RrhhExcelColumnKey>>(
    () => new Set(RRHH_EXCEL_DEFAULT_EXPORT_KEYS),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const byGroup = useMemo(() => {
    const map = new Map<
      RrhhExcelColumnGroup,
      Array<(typeof RRHH_EXCEL_COLUMNS)[number]>
    >();
    for (const g of GROUPS) map.set(g, []);
    for (const col of RRHH_EXCEL_COLUMNS) {
      map.get(col.group)!.push(col);
    }
    return map;
  }, []);

  function toggle(key: RrhhExcelColumnKey) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectGroup(group: RrhhExcelColumnGroup, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const col of byGroup.get(group) ?? []) {
        if (on) next.add(col.key);
        else next.delete(col.key);
      }
      return next;
    });
  }

  function selectAllExportable() {
    setSelected(new Set(RRHH_EXCEL_COLUMNS.map((c) => c.key)));
  }

  function selectImportableOnly() {
    setSelected(new Set(RRHH_EXCEL_IMPORT_KEYS));
  }

  async function runExport() {
    if (selected.size === 0) {
      setError("Seleccione al menos una columna");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const cols = [...selected].join(",");
      const stamp = new Date().toISOString().slice(0, 10);
      await apiDownload(
        `/rrhh/employees/export/excel?columns=${encodeURIComponent(cols)}`,
        `rrhh-personal-${stamp}.xlsx`,
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Exportación fallida");
    } finally {
      setBusy(false);
    }
  }

  async function downloadTemplate() {
    setBusy(true);
    setError("");
    try {
      const keys = (
        selected.size
          ? [...selected].filter((k) =>
              RRHH_EXCEL_IMPORT_KEYS.includes(k),
            )
          : [...RRHH_EXCEL_IMPORT_KEYS]
      ).join(",");
      await apiDownload(
        `/rrhh/employees/export/template?columns=${encodeURIComponent(keys)}`,
        "rrhh-plantilla-importacion.xlsx",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Plantilla fallida");
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    setError("");
    setImportResult(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const result = await api<ImportResult>("/rrhh/employees/import/excel", {
        method: "POST",
        body,
        signal: AbortSignal.timeout(90_000),
      });
      setImportResult(result);
      onImported?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Importación fallida");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Excel · Personal RRHH"
      size="lg"
    >
      <div className="space-y-4">
        <div className="flex gap-2">
          <button
            type="button"
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
              mode === "export"
                ? "bg-[var(--accent-primary)] text-[var(--brand-primary-fg)]"
                : "border border-[var(--border-subtle)] text-[var(--text-secondary)]"
            }`}
            onClick={() => setMode("export")}
          >
            Exportar
          </button>
          <button
            type="button"
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
              mode === "import"
                ? "bg-[var(--accent-primary)] text-[var(--brand-primary-fg)]"
                : "border border-[var(--border-subtle)] text-[var(--text-secondary)]"
            }`}
            onClick={() => setMode("import")}
          >
            Importar
          </button>
        </div>

        {error ? (
          <p className="rounded-lg border border-[var(--accent-alert)]/40 bg-[color-mix(in_srgb,var(--accent-alert)_10%,transparent)] px-3 py-2 text-sm text-[var(--accent-alert)]">
            {error}
          </p>
        ) : null}

        {mode === "export" ? (
          <>
            <p className="text-sm text-[var(--text-secondary)]">
              Marque las columnas a incluir en el archivo Excel.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                className="w-auto px-3 py-1.5 text-xs"
                onClick={selectAllExportable}
              >
                Todas
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="w-auto px-3 py-1.5 text-xs"
                onClick={selectImportableOnly}
              >
                Solo importables
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="w-auto px-3 py-1.5 text-xs"
                onClick={() => setSelected(new Set())}
              >
                Ninguna
              </Button>
            </div>

            <div className="max-h-[50vh] space-y-4 overflow-y-auto pr-1">
              {GROUPS.map((group) => {
                const cols = byGroup.get(group) ?? [];
                if (!cols.length) return null;
                const allOn = cols.every((c) => selected.has(c.key));
                return (
                  <section
                    key={group}
                    className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-3"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--accent-primary)]">
                        {RRHH_EXCEL_GROUP_LABELS[group]}
                      </h4>
                      <button
                        type="button"
                        className="text-[11px] text-[var(--text-secondary)] underline"
                        onClick={() => selectGroup(group, !allOn)}
                      >
                        {allOn ? "Quitar grupo" : "Marcar grupo"}
                      </button>
                    </div>
                    <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {cols.map((col) => (
                        <li key={col.key}>
                          <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text-primary)]">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-[var(--accent-primary)]"
                              checked={selected.has(col.key)}
                              onChange={() => toggle(col.key)}
                            />
                            <span>
                              {col.label}
                              {col.exportOnly ? (
                                <span className="ml-1 text-[10px] text-[var(--text-secondary)]">
                                  (solo lectura)
                                </span>
                              ) : null}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>

            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="secondary"
                className="w-auto px-4 py-2"
                onClick={onClose}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="primary"
                className="w-auto px-4 py-2"
                loading={busy}
                disabled={busy || selected.size === 0}
                onClick={() => void runExport()}
              >
                <Download className="mr-1.5 h-4 w-4" aria-hidden />
                Descargar ({selected.size})
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-[var(--text-secondary)]">
              Suba un Excel con encabezados en español. Si el documento ya
              existe se actualiza; si no, se crea expediente + usuario (requiere
              correo).
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                className="w-auto px-4 py-2"
                loading={busy}
                onClick={() => void downloadTemplate()}
              >
                Descargar plantilla
              </Button>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] hover:border-[var(--accent-primary)]">
                <Upload className="h-4 w-4" aria-hidden />
                {busy ? "Procesando…" : "Elegir archivo .xlsx"}
                <input
                  type="file"
                  accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    e.target.value = "";
                    void onFile(f);
                  }}
                />
              </label>
            </div>

            {importResult ? (
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-3 text-sm">
                <p className="font-semibold text-[var(--text-primary)]">
                  Resultado: {importResult.created} creados ·{" "}
                  {importResult.updated} actualizados · {importResult.skipped}{" "}
                  vacíos
                </p>
                {importResult.errors.length ? (
                  <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto font-mono text-xs text-[var(--accent-alert)]">
                    {importResult.errors.slice(0, 40).map((err) => (
                      <li key={`${err.row}-${err.message}`}>
                        Fila {err.row}: {err.message}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-[var(--text-secondary)]">
                    Sin errores de fila.
                  </p>
                )}
              </div>
            ) : null}

            <div className="flex justify-end pt-1">
              <Button
                type="button"
                variant="secondary"
                className="w-auto px-4 py-2"
                onClick={onClose}
              >
                Cerrar
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
