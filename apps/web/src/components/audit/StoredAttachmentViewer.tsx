"use client";

import { useEffect, useState } from "react";
import { Button } from "@fsg/ui";
import { Download, Eye, FileWarning } from "lucide-react";
import { apiDownload, apiFetchBlob } from "@/lib/api";

type Props = {
  /** Ruta API autenticada, p.ej. `/finance/invoices/:id/support` */
  supportPath: string | null;
  /** true cuando el registro declara archivo */
  hasFile: boolean;
  fileName?: string | null;
  mimeType?: string | null;
  emptyLabel?: string;
  title?: string;
};

function isPreviewable(mime?: string | null, name?: string | null) {
  const m = (mime || "").toLowerCase();
  const n = (name || "").toLowerCase();
  if (m.startsWith("image/") || m === "application/pdf") return true;
  if (n.endsWith(".pdf") || n.endsWith(".png") || n.endsWith(".jpg") || n.endsWith(".jpeg"))
    return true;
  return false;
}

function isImage(mime?: string | null, name?: string | null) {
  const m = (mime || "").toLowerCase();
  const n = (name || "").toLowerCase();
  return (
    m.startsWith("image/") ||
    n.endsWith(".png") ||
    n.endsWith(".jpg") ||
    n.endsWith(".jpeg")
  );
}

/**
 * Vista/descarga de adjuntos vía endpoints autenticados (JWT).
 * Reutiliza el storage en disco `/uploads` sin URLs firmadas nuevas.
 */
export function StoredAttachmentViewer({
  supportPath,
  hasFile,
  fileName,
  mimeType,
  emptyLabel = "Sin archivo adjunto",
  title = "Soporte documental",
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewKind, setPreviewKind] = useState<"image" | "pdf" | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  if (!hasFile || !supportPath) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-dashed border-brand-border bg-brand-surface px-3 py-3 text-sm text-brand-text-secondary">
        <FileWarning className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div>
          <p className="font-medium text-brand-text-primary">{title}</p>
          <p className="mt-0.5 text-xs">{emptyLabel}</p>
        </div>
      </div>
    );
  }

  const canPreview = isPreviewable(mimeType, fileName);

  async function loadPreview() {
    if (!supportPath) return;
    setBusy(true);
    setError("");
    try {
      const { blob, contentType } = await apiFetchBlob(supportPath);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      setPreviewKind(
        isImage(contentType, fileName) || isImage(mimeType, fileName)
          ? "image"
          : "pdf",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo abrir el archivo");
    } finally {
      setBusy(false);
    }
  }

  async function onDownload() {
    if (!supportPath) return;
    setBusy(true);
    setError("");
    try {
      await apiDownload(
        `${supportPath}${supportPath.includes("?") ? "&" : "?"}download=1`,
        fileName || "adjunto",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo descargar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-brand-border bg-brand-surface p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-text-secondary">
            {title}
          </p>
          <p className="truncate font-data text-sm text-brand-text-primary">
            {fileName || "Archivo adjunto"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canPreview ? (
            <Button
              type="button"
              variant="ghost"
              className="w-auto px-3 py-1.5"
              disabled={busy}
              onClick={() => void loadPreview()}
            >
              <Eye className="mr-1.5 inline h-3.5 w-3.5" aria-hidden />
              Ver
            </Button>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            className="w-auto px-3 py-1.5"
            disabled={busy}
            onClick={() => void onDownload()}
          >
            <Download className="mr-1.5 inline h-3.5 w-3.5" aria-hidden />
            Descargar
          </Button>
        </div>
      </div>
      {!canPreview ? (
        <p className="text-xs text-brand-text-secondary">
          Formato no previsualizable en pantalla — use Descargar.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-brand-danger">
          {error}
        </p>
      ) : null}
      {previewUrl && previewKind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt={fileName || "Comprobante"}
          className="max-h-72 w-full rounded-md border border-brand-border object-contain bg-black/5"
        />
      ) : null}
      {previewUrl && previewKind === "pdf" ? (
        <iframe
          title={fileName || "PDF"}
          src={previewUrl}
          className="h-80 w-full rounded-md border border-brand-border bg-brand-surface-elevated"
        />
      ) : null}
    </div>
  );
}
