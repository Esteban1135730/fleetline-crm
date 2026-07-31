import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

export const ALLOW_DIRECTIVE_QUERY_KEY = "allowDirectiveQuery";

/** Marca un handler como consulta directiva permitida (p. ej. Text-to-SQL). */
export const AllowDirectiveQuery = () =>
  SetMetadata(ALLOW_DIRECTIVE_QUERY_KEY, true);

function isPresidenciaRole(roleRaw: string | undefined): boolean {
  return String(roleRaw || "").toLowerCase() === "presidencia";
}

function isDirectiveSession(user?: {
  role?: string;
  directiveReadOnly?: boolean;
}): boolean {
  if (!user) return false;
  return Boolean(user.directiveReadOnly) || isPresidenciaRole(user.role);
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
      user?: { role?: string; directiveReadOnly?: boolean };
    }>();

    if (!isDirectiveSession(req.user)) {
      return true;
    }

    const method = String(req.method || "GET").toUpperCase();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
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
