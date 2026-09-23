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
  /** PIN ejecutivo del Oficial de Cumplimiento */
  pin: z.string().min(4).max(8),
  /** Referencia de evidencia obligatoria (id de SarlaftEvidence o fileRef) */
  evidenceId: z.string().min(1).optional(),
  evidenceFileRef: z.string().min(1).optional(),
  /** Si true y RESOLVED, limpia sarlaftBlocked en la entidad */
  clearBlock: z.boolean().optional().default(false),
}).refine((v) => Boolean(v.evidenceId || v.evidenceFileRef), {
  message: "Evidencia requerida (evidenceId o evidenceFileRef)",
  path: ["evidenceId"],
});
export type ResolveAlertDto = z.infer<typeof ResolveAlertSchema>;

/** Roles que pueden resolver alertas SARLAFT (Oficial de Cumplimiento / equivalentes). */
export const SARLAFT_OFFICER_ROLES = new Set([
  "control_interno",
  "auditor_control_interno",
  "director_juridico",
  "juridico",
  "org_admin",
  "platform_master",
]);
