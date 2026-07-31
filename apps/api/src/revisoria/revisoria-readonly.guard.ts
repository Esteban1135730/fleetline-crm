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

/**
 * Módulo 11 — cualquier sesión de Revisoría Fiscal es estrictamente GET.
 */
@Injectable()
export class RevisoriaReadOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      method?: string;
      user?: { role?: string };
    }>();

    if (!isRevisoriaRole(req.user?.role)) {
      return true;
    }

    const method = String(req.method || "GET").toUpperCase();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
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
