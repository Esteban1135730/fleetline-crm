import { z } from "zod";
import { Field, FieldOptional, HARD_RULES } from "@fsg/shared";
import { ComplianceDocType, DocStatus, VehicleStatus } from "@fsg/db";

export const PortalLinkSchema = z.object({
  ownerName: Field.personName,
  ownerDocument: Field.document,
  ownerEmail: FieldOptional.email,
  ownerPhone: FieldOptional.phone,
  plate: FieldOptional.plate,
  /** horas de vigencia del link */
  ttlHours: z.coerce.number().int().min(1).max(168).optional().default(72),
});
export type PortalLinkDto = z.infer<typeof PortalLinkSchema>;

export const BackgroundCheckSchema = z.object({
  document: Field.document,
  driverName: FieldOptional.personName,
  driverId: z.string().optional(),
});
export type BackgroundCheckDto = z.infer<typeof BackgroundCheckSchema>;

export const ValidarOcrSchema = z.object({
  onboardingId: z.string().optional(),
  plate: z.string().optional(),
  vehicleId: z.string().optional(),
  /** Texto OCR crudo o hint de campos */
  rawText: z.string().optional(),
  docType: z
    .enum([
      "TARJETA_PROPIEDAD",
      "SOAT",
      "TECNOMECANICA",
      "TARJETA_OPERACION",
      "POLIZA_CONTRACTUAL",
      "RCC",
      "RCE",
      "PERITAJE",
    ])
    .optional()
    .default("TARJETA_PROPIEDAD"),
  extracted: z
    .object({
      plate: z.string().optional(),
      reference: z.string().optional(),
      issuedAt: z.string().optional(),
      expiresAt: z.string().optional(),
      ownerName: z.string().optional(),
      ownerDocument: z.string().optional(),
    })
    .optional(),
  fileRef: z.string().optional(),
});
export type ValidarOcrDto = z.infer<typeof ValidarOcrSchema>;

export const EXPIRY_ALERT_DAYS = [15, 7, 0] as const;

/**
 * Semáforo de alerta por días a vencimiento.
 */
export function expiryAlertLevel(
  expiresAt: Date,
  now = new Date(),
): "GREEN" | "AMBER_15" | "AMBER_7" | "RED_0" | "EXPIRED" {
  const ms = expiresAt.getTime() - now.getTime();
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
  if (days < 0) return "EXPIRED";
  if (days === 0) return "RED_0";
  if (days <= 7) return "AMBER_7";
  if (days <= HARD_RULES.DOC_EXPIRING_DAYS || days <= 15) return "AMBER_15";
  return "GREEN";
}

/**
 * Pure: al llegar fecha de vencimiento de Tarjeta de Operación,
 * el vehículo debe quedar bloqueado legal (ROJO) y rebotar Logística.
 */
export function shouldBlockVehicleOnToExpiry(input: {
  docType: string;
  expiresAt: Date | null | undefined;
  docStatus?: string;
  now?: Date;
}): { block: boolean; reason: string | null; legalRed: boolean } {
  if (input.docType !== ComplianceDocType.TARJETA_OPERACION && input.docType !== "TARJETA_OPERACION") {
    return { block: false, reason: null, legalRed: false };
  }
  const now = input.now || new Date();
  const expiredByStatus =
    input.docStatus === DocStatus.EXPIRED || input.docStatus === "EXPIRED";
  const expiredByDate =
    input.expiresAt != null &&
    startOfDay(input.expiresAt).getTime() <= startOfDay(now).getTime();

  if (expiredByStatus || expiredByDate) {
    return {
      block: true,
      legalRed: true,
      reason: "TARJETA_OPERACION_VENCIDA — Bloqueo Legal ROJO (rebote Logística)",
    };
  }
  return { block: false, reason: null, legalRed: false };
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Resultado apply legal block */
export function legalBlockVehiclePatch(reason: string) {
  return {
    complianceBlocked: true,
    complianceReason: reason,
    status: VehicleStatus.COMPLIANCE_BLOCKED,
  };
}

/**
 * Diagnóstico SIMIT + RUNT → semáforo riesgo conductor.
 */
export function diagnoseBackgroundRisk(input: {
  simitFinesCount: number;
  simitTotalCop: number;
  runtLicenseValid: boolean;
  runtLicenseExpiresAt?: Date | null;
  now?: Date;
}): { riskLight: "GREEN" | "AMBER" | "RED"; diagnosis: string } {
  const now = input.now || new Date();
  const licExpired =
    !input.runtLicenseValid ||
    (input.runtLicenseExpiresAt != null &&
      input.runtLicenseExpiresAt.getTime() <= now.getTime());

  if (licExpired || input.simitFinesCount >= 5 || input.simitTotalCop >= 5_000_000) {
    return {
      riskLight: "RED",
      diagnosis: licExpired
        ? "Licencia RUNT inválida/vencida — no apto vinculación"
        : `SIMIT crítico (${input.simitFinesCount} multas · $${input.simitTotalCop.toLocaleString("es-CO")})`,
    };
  }
  if (input.simitFinesCount >= 1 || input.simitTotalCop >= 500_000) {
    return {
      riskLight: "AMBER",
      diagnosis: `SIMIT con pendientes (${input.simitFinesCount} · $${input.simitTotalCop.toLocaleString("es-CO")}) — requiere descargos`,
    };
  }
  return {
    riskLight: "GREEN",
    diagnosis: "RUNT válido · SIMIT sin hallazgos — apto para vinculación",
  };
}

/** Mock SIMIT determinista por cédula */
export function mockSimitLookup(document: string): {
  finesCount: number;
  totalCop: number;
  raw: object;
} {
  const n = Number(String(document).replace(/\D/g, "").slice(-3)) || 0;
  if (n % 10 === 0) {
    return { finesCount: 6, totalCop: 6_200_000, raw: { mock: true, risk: "HIGH" } };
  }
  if (n % 3 === 0) {
    return { finesCount: 2, totalCop: 780_000, raw: { mock: true, risk: "MED" } };
  }
  return { finesCount: 0, totalCop: 0, raw: { mock: true, risk: "LOW" } };
}
