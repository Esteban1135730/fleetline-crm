import type { PqrsType, TicketPriority } from "@fsg/db";

/** SLA en horas: tipo × prioridad */
const SLA_MATRIX: Record<
  string,
  Record<string, number>
> = {
  PETITION: { LOW: 72, MEDIUM: 48, HIGH: 24, URGENT: 8 },
  COMPLAINT: { LOW: 48, MEDIUM: 24, HIGH: 12, URGENT: 4 },
  CLAIM: { LOW: 48, MEDIUM: 24, HIGH: 8, URGENT: 4 },
  SUGGESTION: { LOW: 120, MEDIUM: 72, HIGH: 48, URGENT: 24 },
};

export function resolveSlaHours(
  type: PqrsType | string,
  priority: TicketPriority | string,
): number {
  const row = SLA_MATRIX[String(type).toUpperCase()] || SLA_MATRIX.PETITION;
  return row[String(priority).toUpperCase()] ?? row.MEDIUM ?? 48;
}

export function computeSlaDueAt(
  createdAt: Date,
  slaHours: number,
): Date {
  return new Date(createdAt.getTime() + slaHours * 3_600_000);
}

export function isSlaBreached(
  slaDueAt: Date | null | undefined,
  resolvedAt: Date | null | undefined,
  now = new Date(),
): boolean {
  if (!slaDueAt) return false;
  const checkpoint = resolvedAt ?? now;
  return checkpoint.getTime() > slaDueAt.getTime();
}

export type EscalationTarget = "rrhh" | "hqse" | null;

/**
 * Alta prioridad + vínculo conductor → RRHH; vehículo → HQSE.
 */
export function resolveEscalationTarget(input: {
  type: PqrsType | string;
  priority: TicketPriority | string;
  driverId?: string | null;
  vehicleId?: string | null;
  message?: string;
}): { rrhh: boolean; hqse: boolean } {
  const priority = String(input.priority).toUpperCase();
  const type = String(input.type).toUpperCase();
  const high = priority === "HIGH" || priority === "URGENT";
  const mishandling =
    type === "CLAIM" ||
    type === "COMPLAINT" ||
    /mal\s*manejo|agres|imprud|fatiga|trato/i.test(input.message || "");

  return {
    rrhh: Boolean(high && input.driverId && mishandling),
    hqse: Boolean(high && input.vehicleId),
  };
}

export function buildVisitorPass(input: {
  organizationId: string;
  document: string;
  name: string;
  siteLabel?: string;
}): { passCode: string; qrPayload: string } {
  const stamp = Date.now().toString(36).toUpperCase();
  const docTail = input.document.replace(/\D/g, "").slice(-4) || "0000";
  const passCode = `PV-${stamp}-${docTail}`;
  const qrPayload = JSON.stringify({
    v: 1,
    kind: "VISITOR_PASS",
    passCode,
    organizationId: input.organizationId,
    document: input.document,
    name: input.name,
    site: input.siteLabel || "SEDE_PRINCIPAL",
    issuedAt: new Date().toISOString(),
  });
  return { passCode, qrPayload };
}
