import { z } from "zod";

export const CreateIncidentSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  kind: z
    .enum([
      "TRAFFIC_ACCIDENT",
      "SST_FINDING",
      "NEAR_MISS",
      "ENVIRONMENTAL",
    ])
    .optional(),
  severity: z.enum(["MINOR", "MODERATE", "SEVERE", "CRITICAL"]),
  occurredAt: z.coerce.date().optional(),
  location: z.string().optional(),
  vehicleId: z.string().min(1).optional(),
  driverId: z.string().min(1).optional(),
});
export type CreateIncidentDto = z.infer<typeof CreateIncidentSchema>;

export const ListIncidentsQuerySchema = z.object({
  severity: z
    .enum(["MINOR", "MODERATE", "SEVERE", "CRITICAL"])
    .optional(),
  status: z.enum(["OPEN", "INVESTIGATING", "CLOSED"]).optional(),
  kind: z
    .enum([
      "TRAFFIC_ACCIDENT",
      "SST_FINDING",
      "NEAR_MISS",
      "ENVIRONMENTAL",
    ])
    .optional(),
  vehicleId: z.string().optional(),
  driverId: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type ListIncidentsQuery = z.infer<typeof ListIncidentsQuerySchema>;

export const CreateAuditSchema = z.object({
  title: z.string().min(3),
  scope: z.enum(["INTERNAL", "EXTERNAL"]).optional(),
  standard: z.string().min(2).optional(),
  auditedAt: z.coerce.date().optional(),
  findingsCount: z.coerce.number().int().nonnegative().optional(),
  nonConformities: z.coerce.number().int().nonnegative().optional(),
  score: z.coerce.number().int().min(0).max(100).optional(),
  auditorName: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(["PLANNED", "IN_PROGRESS", "CLOSED"]).optional(),
});
export type CreateAuditDto = z.infer<typeof CreateAuditSchema>;

export const PesvScorecardQuerySchema = z.object({
  days: z.coerce.number().int().positive().max(365).optional(),
});
export type PesvScorecardQuery = z.infer<typeof PesvScorecardQuerySchema>;
