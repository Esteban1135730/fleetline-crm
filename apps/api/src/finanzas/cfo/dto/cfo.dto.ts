import { z } from "zod";

export const CfoDispersarMfaSchema = z.object({
  paymentScheduleIds: z.array(z.string().min(1)).min(1),
  mfaToken: z.string().regex(/^\d{6}$/, "OTP de 6 dígitos requerido"),
  bankRef: z.string().min(2).optional(),
});
export type CfoDispersarMfaDto = z.infer<typeof CfoDispersarMfaSchema>;

export const SimularRentabilidadSchema = z.object({
  fareAmount: z.number().nonnegative(),
  fuelProjected: z.number().nonnegative().default(0),
  tireWear: z.number().nonnegative().default(0),
  driverSalary: z.number().nonnegative().default(0),
  insurancePolicies: z.number().nonnegative().default(0),
  minEbitdaMargin: z.number().min(0).max(1).optional(),
  quoteId: z.string().optional(),
  contractCode: z.string().optional(),
});
export type SimularRentabilidadDto = z.infer<typeof SimularRentabilidadSchema>;
