import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  isPathDeniedForRole,
  normalizeRole,
  RBAC_FORBIDDEN_MESSAGE,
} from "@fsg/shared";

export const ROLES_KEY = "roles";
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
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
    const role = normalizeRole(String(req.user.role));
    const path = String(req.originalUrl || req.url || req.path || "").split(
      "?",
    )[0];
    if (isPathDeniedForRole(role, path)) {
      throw new ForbiddenException(RBAC_FORBIDDEN_MESSAGE);
    }
    if (role === "platform_master") return true;
    const allowed = required.map((r) => normalizeRole(r));
    if (allowed.includes(role)) return true;
    throw new ForbiddenException(RBAC_FORBIDDEN_MESSAGE);
  }
}
