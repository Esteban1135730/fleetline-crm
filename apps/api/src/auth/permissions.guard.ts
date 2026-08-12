import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  RBAC_FORBIDDEN_MESSAGE,
  hasPermission,
  isPathDeniedForRole,
  normalizeRole,
  type PermissionAction,
  type PermissionResource,
} from "@fsg/shared";

export const PERMISSIONS_KEY = "permissions";

export type PermissionRequirement = {
  resource: PermissionResource | string;
  action: PermissionAction;
};

/** @Permissions('visitas', 'CREATE') — scope fino sobre la matriz RBAC */
export const Permissions = (
  resource: PermissionResource | string,
  action: PermissionAction,
) => SetMetadata(PERMISSIONS_KEY, { resource, action } satisfies PermissionRequirement);

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      user?: { role?: string };
      url?: string;
      originalUrl?: string;
      path?: string;
    }>();
    const role = normalizeRole(String(req.user?.role || ""));
    const path = String(req.originalUrl || req.url || req.path || "");

    if (isPathDeniedForRole(role, path.split("?")[0])) {
      throw new ForbiddenException(RBAC_FORBIDDEN_MESSAGE);
    }

    const required = this.reflector.getAllAndOverride<PermissionRequirement>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    if (role === "platform_master") return true;

    if (!hasPermission(role, required.resource, required.action)) {
      throw new ForbiddenException(RBAC_FORBIDDEN_MESSAGE);
    }
    return true;
  }
}
