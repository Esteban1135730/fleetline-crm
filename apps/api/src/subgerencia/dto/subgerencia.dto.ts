import { z } from "zod";

export const ResolverConflictoSchema = z.object({
  conflictId: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  resolution: z.string().min(8).max(4000),
  approveLevel2: z.boolean().optional().default(true),
});
export type ResolverConflictoDto = z.infer<typeof ResolverConflictoSchema>;

export const CrearConflictoSchema = z.object({
  title: z.string().min(4).max(200),
  parties: z
    .array(z.enum(["TALLER", "LOGISTICA", "PATIO", "COMERCIAL"]))
    .min(2),
  meta: z.record(z.unknown()).optional(),
});
export type CrearConflictoDto = z.infer<typeof CrearConflictoSchema>;
