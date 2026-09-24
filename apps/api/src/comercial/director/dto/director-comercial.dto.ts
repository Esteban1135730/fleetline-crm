import { z } from "zod";
import { QuoteVehicleTypeSchema } from "@fsg/shared";

export const CotizarSchema = z.object({
  dealId: z.string().min(1).optional(),
  accountName: z.string().min(2).optional(),
  customerId: z.string().min(1).optional(),
  zone: z.string().min(2).default("BOGOTA"),
  vehicleType: QuoteVehicleTypeSchema.default("BUS"),
  distanceKm: z.number().positive().default(45),
  /** Tarifa propuesta $/km (COP). Si omitida, se calcula con margen objetivo. */
  proposedRatePerKm: z.number().positive().optional(),
  /** Margen objetivo % cuando no hay tarifa explícita */
  targetMarginPct: z.number().min(1).max(80).optional(),
  /** Descuento comercial % sobre tarifa base */
  discountPct: z.number().min(0).max(50).default(0),
  /** Autorización CFO previa (margen < 12%) */
  cfoApproved: z.boolean().optional(),
  /** SCRUM-27 — PIN ejecutivo obligatorio si se aprueba margen bajo */
  executivePin: z.string().optional(),
  estimatedMonthlyValue: z.number().nonnegative().optional(),
});
export type CotizarDto = z.infer<typeof CotizarSchema>;

export const FirmarDocusignSchema = z.object({
  dealId: z.string().min(1),
  signerEmail: z.string().email(),
  signerName: z.string().min(2).optional(),
  /** Simula firma completada de inmediato (demo / mock) */
  completeSign: z.boolean().default(true),
  vehiclesRequired: z.number().int().min(1).max(200).default(2),
  routeLabel: z.string().min(2).optional(),
  contractName: z.string().min(2).optional(),
  monthlyValue: z.number().positive().optional(),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
  provider: z.enum(["DOCUSIGN_MOCK", "ADOBESIGN_MOCK"]).default("DOCUSIGN_MOCK"),
});
export type FirmarDocusignDto = z.infer<typeof FirmarDocusignSchema>;

export const CreateDealSchema = z.object({
  accountName: z.string().min(2),
  customerId: z.string().min(1).optional(),
  stage: z
    .enum([
      "NUEVO_LEAD",
      "REUNION_AGENDADA",
      "COTIZACION_ENVIADA",
      "EN_NEGOCIACION",
      "CERRADO_GANADO",
      "CERRADO_PERDIDO",
    ])
    .default("NUEVO_LEAD"),
  estimatedMonthlyValue: z.number().nonnegative().default(0),
  zone: z.string().min(2).default("BOGOTA"),
  vehicleType: z.string().optional(),
  distanceKm: z.number().positive().optional(),
});
export type CreateDealDto = z.infer<typeof CreateDealSchema>;

/** PATCH ficha / etapa del embudo (tablero Kanban). */
export const UpdateDealSchema = z.object({
  stage: z
    .enum([
      "NUEVO_LEAD",
      "REUNION_AGENDADA",
      "COTIZACION_ENVIADA",
      "EN_NEGOCIACION",
      "CERRADO_GANADO",
      "CERRADO_PERDIDO",
    ])
    .optional(),
  accountName: z.string().min(2).optional(),
  zone: z.string().min(2).optional(),
  vehicleType: z.string().optional(),
  distanceKm: z.number().positive().optional().nullable(),
  estimatedMonthlyValue: z.number().nonnegative().optional(),
  customerName: z.string().min(2).optional(),
  nit: z.string().min(5).max(20).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().min(5).max(40).optional().or(z.literal("")),
});
export type UpdateDealDto = z.infer<typeof UpdateDealSchema>;
