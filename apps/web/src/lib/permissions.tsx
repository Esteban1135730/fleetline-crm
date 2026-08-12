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
