"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { FileUp } from "lucide-react";

type EvidenceDropzoneProps = {
  onFiles?: (files: File[]) => void;
  acceptLabel?: string;
};

/** Zona drag & drop PDF/imÃ¡genes â€” evidencia forense / QHSE. */
export function EvidenceDropzone({
  onFiles,
  acceptLabel = "PDF o imÃ¡genes",
}: EvidenceDropzoneProps) {
  const [names, setNames] = useState<string[]>([]);

  const onDrop = useCallback(
    (accepted: File[]) => {
      setNames(accepted.map((f) => f.name));
      onFiles?.(accepted);
    },
    [onFiles],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "image/*": [".png", ".jpg", ".jpeg", ".webp"],
    },
    multiple: true,
  });

  return (
    <div
      {...getRootProps()}
      className={`cursor-pointer rounded-xl border border-dashed px-4 py-8 text-center transition ${
        isDragActive
          ? "border-brand-success bg-brand-success/10"
          : "border-[var(--brand-border)] bg-[color-mix(in_srgb,var(--brand-surface-elevated)_55%,transparent)] hover:border-[var(--brand-text-secondary)]"
      }`}
    >
      <input {...getInputProps()} />
      <FileUp
        className="mx-auto mb-2 h-8 w-8 text-[var(--brand-text-secondary)]"
        aria-hidden
      />
      <p className="text-sm text-[var(--brand-text-secondary)]">
        {isDragActive
          ? "Suelte la evidenciaâ€¦"
          : `Arrastre ${acceptLabel} o haga clic`}
      </p>
      {names.length > 0 ? (
        <ul className="mt-3 space-y-1 font-mono text-xs text-brand-success">
          {names.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
