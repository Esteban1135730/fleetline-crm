import {
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { createReadStream, existsSync } from "fs";
import { basename, join, normalize, resolve } from "path";
import type { Response } from "express";

export const UPLOADS_ROOT = resolve(__dirname, "../../../../uploads");

/** Resuelve `/uploads/{name}` → ruta absoluta segura bajo UPLOADS_ROOT. */
export function resolveStoredUploadPath(fileRef: string | null | undefined): string {
  if (!fileRef?.trim()) {
    throw new NotFoundException("Archivo no asociado");
  }
  const raw = fileRef.trim().replace(/^\/+/, "");
  const name = basename(raw.startsWith("uploads/") ? raw.slice("uploads/".length) : raw);
  if (!name || name.includes("..")) {
    throw new ForbiddenException("Nombre de archivo inválido");
  }
  const full = normalize(join(UPLOADS_ROOT, name));
  if (!full.startsWith(UPLOADS_ROOT)) {
    throw new ForbiddenException("Ruta denegada");
  }
  if (!existsSync(full)) {
    throw new NotFoundException("Archivo no encontrado");
  }
  return full;
}

export function contentTypeForUpload(
  fileRef: string,
  mimeHint?: string | null,
): string {
  if (mimeHint?.startsWith("image/") || mimeHint === "application/pdf") {
    return mimeHint;
  }
  const lower = fileRef.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

/** Stream autenticado de un archivo ya validado en disco. */
export function streamStoredUpload(
  res: Response,
  opts: {
    fileRef: string;
    mimeType?: string | null;
    originalName?: string | null;
    asAttachment?: boolean;
  },
) {
  const full = resolveStoredUploadPath(opts.fileRef);
  const type = contentTypeForUpload(opts.fileRef, opts.mimeType);
  const downloadName =
    opts.originalName?.replace(/[^\w.\- ()áéíóúñÁÉÍÓÚÑ]+/gi, "_") ||
    basename(full);

  res.setHeader("Content-Type", type);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store");
  if (opts.asAttachment) {
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${downloadName}"`,
    );
  } else {
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${downloadName}"`,
    );
  }
  createReadStream(full).pipe(res);
}

export function toUploadsFileRef(storedName: string): string {
  return `/uploads/${basename(storedName)}`;
}
