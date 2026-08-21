import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Res,
  UseGuards,
} from "@nestjs/common";
import { createReadStream, existsSync } from "fs";
import { basename, join, normalize, resolve } from "path";
import type { Response } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";

@Controller("uploads")
@UseGuards(JwtAuthGuard)
export class SecureUploadsController {
  private readonly root = resolve(__dirname, "../../../../uploads");

  @Get(":name")
  stream(@Param("name") name: string, @Res() res: Response) {
    const safe = basename(name);
    if (!safe || safe !== name || safe.includes("..")) {
      throw new ForbiddenException("Nombre de archivo inválido");
    }
    const full = normalize(join(this.root, safe));
    if (!full.startsWith(this.root)) {
      throw new ForbiddenException("Ruta denegada");
    }
    if (!existsSync(full)) throw new NotFoundException("Archivo no encontrado");

    const lower = safe.toLowerCase();
    const type = lower.endsWith(".pdf")
      ? "application/pdf"
      : lower.endsWith(".png")
        ? "image/png"
        : lower.endsWith(".jpg") || lower.endsWith(".jpeg")
          ? "image/jpeg"
          : "application/octet-stream";

    res.setHeader("Content-Type", type);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");
    createReadStream(full).pipe(res);
  }
}
