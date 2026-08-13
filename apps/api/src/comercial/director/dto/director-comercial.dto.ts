import { z } from "zod";

export const CotizarSchema = z.object({
  dealId: z.string().min(1).optional(),
  accountName: z.string().min(2).optional(),
  customerId: z.string().min(1).optional(),
  zone: z.string().min(2).default("BOGOTA"),
  vehicleType: z
    .enum(["BUS_ESCOLAR", "BUS_TURISMO", "CAMION_CARGA", "VAN"])
    .default("BUS_ESCOLAR"),
  distanceKm: z.number().positive().default(45),
  /** Tarifa propuesta $/km (COP). Si omitida, se calcula con margen objetivo. */
  proposedRatePerKm: z.number().positive().optional(),
  /** Margen objetivo % cuando no hay tarifa explícita */
  targetMarginPct: z.number().min(1).max(80).optional(),
  /** Descuento comercial % sobre tarifa base */
  discountPct: z.number().min(0).max(50).default(0),
  /** Autorización CFO previa (margen < 12%) */
  cfoApproved: z.boolean().optional(),
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
