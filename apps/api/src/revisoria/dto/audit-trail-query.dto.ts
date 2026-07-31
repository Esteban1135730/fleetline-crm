import { z } from "zod";

export const AuditTrailQuerySchema = z.object({
  from: z.string().datetime().or(z.string().min(4)).optional(),
  to: z.string().datetime().or(z.string().min(4)).optional(),
  userId: z.string().min(1).optional(),
  module: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export type AuditTrailQueryDto = z.infer<typeof AuditTrailQuerySchema>;
