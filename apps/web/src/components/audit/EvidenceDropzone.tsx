"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { FileUp } from "lucide-react";

type EvidenceDropzoneProps = {
  onFiles?: (files: File[]) => void;
  acceptLabel?: string;
};

/** Zona drag & drop PDF/imágenes — evidencia forense / QHSE. */
export function EvidenceDropzone({
  onFiles,
  acceptLabel = "PDF o imágenes",
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
          ? "border-emerald-500 bg-emerald-500/10"
          : "border-slate-700 bg-zinc-900/50 hover:border-slate-500"
      }`}
    >
      <input {...getInputProps()} />
      <FileUp className="mx-auto mb-2 h-8 w-8 text-slate-500" aria-hidden />
      <p className="text-sm text-slate-300">
        {isDragActive
          ? "Suelte la evidencia…"
          : `Arrastre ${acceptLabel} o haga clic`}
      </p>
      {names.length > 0 ? (
        <ul className="mt-3 space-y-1 font-mono text-xs text-emerald-400">
          {names.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
