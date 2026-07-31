import { z } from "zod";

export const CreateContractSchema = z.object({
  name: z.string().min(2),
  customerId: z.string().min(1),
  channel: z.enum(["PRIVATE", "PUBLIC_TENDER"]).optional(),
  routeLabel: z.string().min(1).optional(),
  route: z.string().min(1).optional(), // alias legado
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  monthlyValue: z.coerce.number().nonnegative().optional(),
  budgetCap: z.coerce.number().positive().optional(),
  tripQuota: z.coerce.number().int().positive().optional(),
  vehicleQuota: z.coerce.number().int().positive().optional(),
  rateType: z.enum(["FIXED", "PER_KM", "MIXED"]).optional(),
  fixedFare: z.coerce.number().nonnegative().optional(),
  ratePerKm: z.coerce.number().nonnegative().optional(),
  secopProcessId: z.string().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "SUSPENDED", "ENDED"]).optional(),
});
export type CreateContractDto = z.infer<typeof CreateContractSchema>;

export const SecopOpportunitiesQuerySchema = z.object({
  category: z.string().optional(),
  status: z.string().optional(),
  q: z.string().optional(),
  sync: z
    .union([z.boolean(), z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => v === true || v === "true"),
});
export type SecopOpportunitiesQuery = z.infer<
  typeof SecopOpportunitiesQuerySchema
>;
