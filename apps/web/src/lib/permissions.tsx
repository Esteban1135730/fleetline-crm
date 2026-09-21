"use client";

import {
  hasPermission,
  normalizeRole,
  type PermissionAction,
  type PermissionResource,
} from "@fsg/shared";
import { useAuth } from "@/lib/auth-context";

export function useHasPermission(
  resource: PermissionResource | string,
  action: PermissionAction,
): boolean {
  const { user } = useAuth();
  if (!user?.role) return false;
  return hasPermission(normalizeRole(user.role), resource, action);
}

/**
 * Alias de capability: `resource:action` (ej. `gerencia_override:UPDATE`).
 * Política NEXA: sin permiso → no se renderiza el hijo (null).
 */
export function useCapability(capability: string): boolean {
  const sep = capability.lastIndexOf(":");
  const resource = sep > 0 ? capability.slice(0, sep) : "";
  const action = (sep > 0 ? capability.slice(sep + 1) : "READ") as PermissionAction;
  const allowed = useHasPermission(resource || "finanzas", action);
  if (sep <= 0 || !resource) return false;
  return allowed;
}

export function Can({
  perform,
  on,
  children,
  fallback = null,
}: {
  perform: PermissionAction;
  on: PermissionResource | string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const allowed = useHasPermission(on, perform);
  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
}

/**
 * Wrapper RBAC para acciones/botones.
 * Si el token no tiene el permiso, el componente no se renderiza.
 *
 * Uso:
 * ```tsx
 * <PermissionGuard capability="facturacion_electronica:CREATE">
 *   <Button>Emitir FE DIAN</Button>
 * </PermissionGuard>
 * ```
 * También acepta `on` + `perform` (misma API que `<Can />`).
 */
export function PermissionGuard({
  capability,
  on,
  perform,
  children,
  fallback = null,
}: {
  capability?: string;
  on?: PermissionResource | string;
  perform?: PermissionAction;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { user } = useAuth();
  if (!user?.role) return <>{fallback}</>;

  let allowed = false;
  if (capability) {
    const sep = capability.lastIndexOf(":");
    if (sep > 0) {
      const resource = capability.slice(0, sep);
      const action = capability.slice(sep + 1) as PermissionAction;
      allowed = hasPermission(normalizeRole(user.role), resource, action);
    }
  } else if (on && perform) {
    allowed = hasPermission(normalizeRole(user.role), on, perform);
  }

  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
}
