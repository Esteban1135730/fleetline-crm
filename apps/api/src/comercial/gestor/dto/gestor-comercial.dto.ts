import { z } from "zod";
import { HARD_RULES } from "@fsg/shared";

export const ADVANCE_PAYMENT_DISPATCH_BLOCK = "ADVANCE_PAYMENT_PENDING";

/**
 * Gate: el pase a Despacho queda bloqueado hasta confirmación de pago.
 */
export function assertAdvancePaymentAllowsDispatch(link: {
  status: string;
  dispatchUnlocked: boolean;
} | null | undefined): { ok: boolean; block: string | null } {
  if (!link) return { ok: true, block: null };
  const paid =
    String(link.status).toUpperCase() === "PAID" && link.dispatchUnlocked;
  if (paid) return { ok: true, block: null };
  return { ok: false, block: ADVANCE_PAYMENT_DISPATCH_BLOCK };
}

export function isGestorDiscountAllowed(discountPct: number): boolean {
  return discountPct <= HARD_RULES.GESTOR_COMERCIAL_MAX_DISCOUNT_PCT;
}

export const CotizacionExpressSchema = z.object({
  dealId: z.string().min(1).optional(),
  accountName: z.string().min(2).optional(),
  customerId: z.string().min(1).optional(),
  phone: z.string().optional(),
  zone: z.string().min(2).default("BOGOTA"),
  vehicleType: z
    .enum(["BUS_ESCOLAR", "BUS_TURISMO", "CAMION_CARGA", "VAN"])
    .default("VAN"),
  distanceKm: z.number().positive().default(35),
  proposedRatePerKm: z.number().positive().optional(),
  discountPct: z.number().min(0).max(50).default(0),
  /** Historial omnicanal adjunto (desde Recepción) */
  omnichannelThread: z
    .array(
      z.object({
        channel: z.enum(["WHATSAPP", "EMAIL", "VOIP"]),
        body: z.string().min(1),
        at: z.coerce.date().optional(),
      }),
    )
    .optional(),
  notifyOnPdfOpen: z.boolean().default(true),
});
export type CotizacionExpressDto = z.infer<typeof CotizacionExpressSchema>;

export const LinkCobroAnticipadoSchema = z.object({
  amount: z.number().positive(),
  method: z.enum(["PSE", "CARD"]).default("PSE"),
  customerId: z.string().min(1).optional(),
  dealId: z.string().min(1).optional(),
  accountName: z.string().min(2).optional(),
  origin: z.string().min(2).default("Origen express"),
  destination: z.string().min(2).default("Destino express"),
  departAt: z.coerce.date().optional(),
  /** Crear viaje PENDING bloqueado hasta pago */
  createTrip: z.boolean().default(true),
});
export type LinkCobroAnticipadoDto = z.infer<typeof LinkCobroAnticipadoSchema>;

export const RegistrarLlamadaSchema = z.object({
  phone: z.string().min(7),
  customerId: z.string().min(1).optional(),
  dealId: z.string().min(1).optional(),
  accountName: z.string().min(2).optional(),
  durationSec: z.number().int().min(0).optional(),
  outcome: z.string().min(1).optional(),
  voiceNoteTranscript: z.string().optional(),
  voiceNoteRef: z.string().optional(),
  priorityScore: z.number().int().min(1).max(100).default(70),
  scheduleFollowUpHours: z.number().int().min(1).max(168).optional(),
});
export type RegistrarLlamadaDto = z.infer<typeof RegistrarLlamadaSchema>;

export const ConfirmarPagoTesoreriaSchema = z.object({
  linkId: z.string().min(1),
  confirmed: z.boolean().default(true),
});
export type ConfirmarPagoTesoreriaDto = z.infer<
  typeof ConfirmarPagoTesoreriaSchema
>;
