import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";

function isRevisoriaRole(roleRaw: string | undefined): boolean {
  const role = String(roleRaw || "")
    .toLowerCase()
    .replace(/í/g, "i");
  return (
    role === "revisoria" ||
    role === "revisor_fiscal" ||
    role === "revisor-fiscal"
  );
}

/** CREATE permitidos al Revisor: Hard Lock, dictamen y notas de auditoría */
const REVISOR_MUTATION_ALLOW = [
  "/revisoria-fiscal/cierre/hard-lock",
  "/api/v1/revisoria-fiscal/cierre/hard-lock",
  "/revisoria-fiscal/notas",
  "/api/v1/revisoria-fiscal/notas",
  "/revisoria-fiscal/dictamen",
  "/api/v1/revisoria-fiscal/dictamen",
  "/revisoria/findings",
];

/**
 * Módulo 11/18 — Revisoría Fiscal es lectura forense.
 * Excepción: Hard Lock / dictamen / notas (Truth Hub).
 */
@Injectable()
export class RevisoriaReadOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      method?: string;
      originalUrl?: string;
      url?: string;
      path?: string;
      user?: { role?: string };
    }>();

    if (!isRevisoriaRole(req.user?.role)) {
      return true;
    }

    const method = String(req.method || "GET").toUpperCase();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
      return true;
    }

    const path = String(req.originalUrl || req.url || req.path || "")
      .split("?")[0]
      .toLowerCase();

    if (
      REVISOR_MUTATION_ALLOW.some((p) => path === p || path.startsWith(`${p}/`))
    ) {
      return true;
    }

    throw new ForbiddenException({
      statusCode: 403,
      error: "REVISORIA_READ_ONLY",
      message:
        "Revisoría Fiscal: ledger forense en solo lectura — mutaciones prohibidas",
    });
  }
}
