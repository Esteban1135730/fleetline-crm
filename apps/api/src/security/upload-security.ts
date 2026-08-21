import { BadRequestException } from "@nestjs/common";
import { randomUUID } from "crypto";
import { extname } from "path";
import type { Options as MulterOptions } from "multer";
import { diskStorage } from "multer";

/** Magic bytes → MIME permitidos. */
const MAGIC: Array<{ mime: string; ext: string[]; test: (b: Buffer) => boolean }> = [
  {
    mime: "application/pdf",
    ext: [".pdf"],
    test: (b) => b.length >= 5 && b.subarray(0, 5).toString("ascii") === "%PDF-",
  },
  {
    mime: "image/jpeg",
    ext: [".jpg", ".jpeg"],
    test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: "image/png",
    ext: [".png"],
    test: (b) =>
      b.length >= 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47,
  },
  {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ext: [".xlsx"],
    test: (b) => b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b,
  },
];

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

export function assertAllowedUpload(
  file: Express.Multer.File,
  opts?: { maxBytes?: number; allowExcel?: boolean },
) {
  const max = opts?.maxBytes ?? DEFAULT_MAX_BYTES;
  if (!file?.buffer && !file?.path) {
    throw new BadRequestException("Archivo vacío");
  }
  if (file.size > max) {
    throw new BadRequestException(`Archivo supera el máximo de ${Math.floor(max / (1024 * 1024))} MB`);
  }

  const ext = extname(file.originalname || "").toLowerCase();
  const allowed = MAGIC.filter((m) =>
    opts?.allowExcel ? true : !m.ext.includes(".xlsx"),
  );

  // diskStorage: buffer no siempre disponible — validar extensión estricta
  const byExt = allowed.find((m) => m.ext.includes(ext));
  if (!byExt) {
    throw new BadRequestException(
      "Tipo no permitido. Solo PDF, JPG, PNG" +
        (opts?.allowExcel ? " o XLSX" : ""),
    );
  }

  if (file.buffer && file.buffer.length > 0) {
    const match = allowed.find((m) => m.test(file.buffer));
    if (!match || !match.ext.includes(ext)) {
      throw new BadRequestException(
        "Contenido del archivo no coincide con la extensión (magic bytes)",
      );
    }
  }
}

export function secureDiskStorage(dest: string): MulterOptions["storage"] {
  return diskStorage({
    destination: dest,
    filename: (_req, file, cb) => {
      const ext = extname(file.originalname || "").toLowerCase().slice(0, 10);
      const safe =
        [".pdf", ".jpg", ".jpeg", ".png", ".xlsx"].includes(ext) ? ext : "";
      cb(null, `${randomUUID()}${safe}`);
    },
  });
}

export function uploadMulterOptions(
  dest: string,
  opts?: { maxBytes?: number; allowExcel?: boolean },
): MulterOptions {
  const max = opts?.maxBytes ?? DEFAULT_MAX_BYTES;
  const allow = new Set(
    opts?.allowExcel
      ? [".pdf", ".jpg", ".jpeg", ".png", ".xlsx"]
      : [".pdf", ".jpg", ".jpeg", ".png"],
  );
  return {
    storage: secureDiskStorage(dest),
    limits: { fileSize: max, files: 1 },
    fileFilter: (_req, file, cb) => {
      const ext = extname(file.originalname || "").toLowerCase();
      if (!allow.has(ext)) {
        cb(null, false);
        return;
      }
      cb(null, true);
    },
  };
}
