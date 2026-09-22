"use client";

/**
 * Re-export canónico para layouts y pantallas.
 * Política NEXA: sin permiso → el hijo NO se renderiza.
 */
export {
  PermissionGuard,
  Can,
  useHasPermission,
  useCapability,
} from "@/lib/permissions";
