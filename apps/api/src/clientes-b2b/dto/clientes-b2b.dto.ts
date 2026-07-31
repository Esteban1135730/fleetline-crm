import { z } from "zod";

export const B2bServiceRequestSchema = z.object({
  customerId: z.string().min(1),
  contractId: z.string().min(1),
  kind: z.enum(["EXPRESS", "RESCHEDULE"]).optional(),
  origin: z.string().min(2),
  destination: z.string().min(2),
  departAt: z.coerce.date().optional(),
  estimatedFare: z.coerce.number().nonnegative().optional(),
  notes: z.string().optional(),
  originalTripId: z.string().optional(),
});
export type B2bServiceRequestDto = z.infer<typeof B2bServiceRequestSchema>;

export const B2bDashboardQuerySchema = z.object({
  customerId: z.string().min(1),
  contractId: z.string().optional(),
  days: z.coerce.number().int().positive().max(365).optional(),
});
export type B2bDashboardQuery = z.infer<typeof B2bDashboardQuerySchema>;

export const B2bActiveFleetQuerySchema = z.object({
  customerId: z.string().min(1),
});
export type B2bActiveFleetQuery = z.infer<typeof B2bActiveFleetQuerySchema>;
