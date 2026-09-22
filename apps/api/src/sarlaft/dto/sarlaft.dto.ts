import { z } from "zod";

export const SarlaftEntityTypeSchema = z.enum([
  "SUPPLIER",
  "EMPLOYEE",
  "CUSTOMER",
  "THIRD_PARTY",
]);
export type SarlaftScreenEntityType = z.infer<typeof SarlaftEntityTypeSchema>;

export const ScreenEntitySchema = z.object({
  type: SarlaftEntityTypeSchema,
  entityId: z.string().min(1).optional().nullable(),
  taxIdOrDocument: z.string().min(3),
  subjectName: z.string().min(1).optional(),
});
export type ScreenEntityDto = z.infer<typeof ScreenEntitySchema>;

export const ResolveAlertSchema = z.object({
  resolution: z.enum(["RESOLVED", "DISMISSED"]),
  notes: z.string().min(5).max(2000),
  /** Si true y RESOLVED, limpia sarlaftBlocked en la entidad */
  clearBlock: z.boolean().optional().default(false),
});
export type ResolveAlertDto = z.infer<typeof ResolveAlertSchema>;

/** Liberación de bloqueo por Oficial de Cumplimiento (SCRUM-33). */
export const LiberarBloqueoSchema = z
  .object({
    entityType: SarlaftEntityTypeSchema.optional(),
    entityId: z.string().min(1).optional(),
    notes: z.string().min(5).max(2000),
    /** Alerta abierta a cerrar (matriz / cuarentena) */
    alertId: z.string().min(1).optional(),
  })
  .refine((d) => Boolean(d.alertId) || (d.entityType && d.entityId), {
    message: "Indique alertId o entityType+entityId",
  });
export type LiberarBloqueoDto = z.infer<typeof LiberarBloqueoSchema>;
