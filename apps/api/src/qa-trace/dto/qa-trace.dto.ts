import { z } from "zod";

export const QaEventIngestSchema = z.object({
  sessionId: z.string().min(8).max(64).optional(),
  kind: z.enum(["route", "action", "heartbeat", "session_end"]),
  path: z.string().max(500).optional(),
  method: z.string().max(16).optional(),
  meta: z.record(z.unknown()).optional(),
});

export type QaEventIngestDto = z.infer<typeof QaEventIngestSchema>;

export const QaSessionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  email: z.string().email().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export type QaSessionsQueryDto = z.infer<typeof QaSessionsQuerySchema>;
