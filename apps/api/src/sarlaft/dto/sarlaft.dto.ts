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
