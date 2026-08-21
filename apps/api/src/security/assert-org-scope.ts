import { ForbiddenException } from "@nestjs/common";

/** Pilar 6 — pertenencia multi-tenant obligatoria. */
export function assertOrgScope(
  resourceOrganizationId: string | null | undefined,
  userOrganizationId: string,
  message = "Acceso denegado: el recurso no pertenece a su organización",
): void {
  if (!resourceOrganizationId || resourceOrganizationId !== userOrganizationId) {
    throw new ForbiddenException(message);
  }
}
