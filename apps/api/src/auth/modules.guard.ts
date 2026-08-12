import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  canAccessModule,
  isPathDeniedForRole,
  isRecepcionistaDeniedModule,
  normalizeRole,
  RBAC_FORBIDDEN_MESSAGE,
  type ModuleId,
} from "@fsg/shared";

export const MODULE_KEY = "modules";
export const RequireModule = (...modules: Array<ModuleId | string>) =>
  SetMetadata(MODULE_KEY, modules);

@Injectable()
export class ModulesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<ModuleId[]>(MODULE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const req = context.switchToHttp().getRequest<{
      user?: { role?: string };
      originalUrl?: string;
      url?: string;
      path?: string;
    }>();
    if (!req.user?.role) {
      throw new ForbiddenException(RBAC_FORBIDDEN_MESSAGE);
    }

    const role = normalizeRole(req.user.role);
    const path = String(req.originalUrl || req.url || req.path || "").split(
      "?",
    )[0];

    if (isPathDeniedForRole(role, path)) {
      throw new ForbiddenException(RBAC_FORBIDDEN_MESSAGE);
    }

    if (role === "recepcionista") {
      const deniedHit = required.some((m) =>
        isRecepcionistaDeniedModule(String(m)),
      );
      if (deniedHit) {
        throw new ForbiddenException(RBAC_FORBIDDEN_MESSAGE);
      }
    }

    const ok = required.some((m) => canAccessModule(role, m));
    if (!ok) {
      throw new ForbiddenException(RBAC_FORBIDDEN_MESSAGE);
    }
    return true;
  }
}
