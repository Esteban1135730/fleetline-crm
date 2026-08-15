import { sanitizeUnknown } from "@fsg/shared";
import type { NextFunction, Request, Response } from "express";

/** Capa de seguridad: limpia HTML, control chars y claves peligrosas en JSON. */
export function sanitizeBodyMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    req.body = sanitizeUnknown(req.body);
  }
  next();
}
