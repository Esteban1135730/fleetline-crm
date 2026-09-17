import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

export const ALLOW_DIRECTIVE_QUERY_KEY = "allowDirectiveQuery";

/** Marca un handler como consulta directiva permitida (p. ej. text-to-SQL). */
export const AllowDirectiveQuery = () =>
  SetMetadata(ALLOW_DIRECTIVE_QUERY_KEY, true);

/**
 * Solo flag directiveReadOnly fuerza lectura.
 * Org admin / maestro pueden mutar (altas de usuarios, etc.).
 * El rol legado PRESIDENCIA sin flag ya no bloquea mutaciones.
 */
function isDirectiveSession(user?: {
  role?: string;
  directiveReadOnly?: boolean;
}): boolean {
  if (!user) return false;
  return Boolean(user.directiveReadOnly);
}

/**
 * Autogestión de sesión: debe funcionar aunque el perfil sea
 * solo-lectura operativa (p. ej. cambio de clave temporal al primer login).
 */
function isAuthSelfServicePath(path: string): boolean {
  const p = (path.split("?")[0] || "").replace(/\/+$/, "") || "/";
  return (
    p === "/auth/password" ||
    p === "/auth/logout" ||
    p === "/auth/refresh" ||
    p.endsWith("/auth/password") ||
    p.endsWith("/auth/logout") ||
    p.endsWith("/auth/refresh")
  );
}

/**
 * Founder's Canvas / vistas directivas: consulta consolidada sin mutación operativa.
 * Excepción: handlers anotados con @AllowDirectiveQuery() (IA / what-if de lectura).
 */
@Injectable()
export class DirectiveReadOnlyGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      method?: string;
      url?: string;
      originalUrl?: string;
      path?: string;
      user?: { role?: string; directiveReadOnly?: boolean };
    }>();

    if (!isDirectiveSession(req.user)) {
      return true;
    }

    const method = String(req.method || "GET").toUpperCase();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
      return true;
    }

    const path = String(req.originalUrl || req.url || req.path || "");
    if (isAuthSelfServicePath(path)) {
      return true;
    }

    const allowQuery = this.reflector.getAllAndOverride<boolean>(
      ALLOW_DIRECTIVE_QUERY_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (allowQuery) {
      return true;
    }

    throw new ForbiddenException({
      statusCode: 403,
      error: "DIRECTIVE_READ_ONLY",
      message:
        "Sesión directiva: consulta consolidada habilitada — mutación operativa bloqueada",
    });
  }
}
