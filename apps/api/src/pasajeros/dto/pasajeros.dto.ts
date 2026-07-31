import { z } from "zod";

export const GenerateBoardingPassSchema = z.object({
  tripId: z.string().min(1),
  passengerId: z.string().min(1).optional(),
  passengerName: z.string().min(2).optional(),
  document: z.string().optional(),
  phone: z.string().optional(),
  customerId: z.string().optional(),
  seatLabel: z.string().optional(),
  ttlMinutes: z.coerce.number().int().positive().max(720).optional(),
}).refine((v) => Boolean(v.passengerId || v.passengerName), {
  message: "passengerId o passengerName requerido",
});
export type GenerateBoardingPassDto = z.infer<typeof GenerateBoardingPassSchema>;

export const ValidateBoardingPassSchema = z.object({
  token: z.string().min(8).optional(),
  qrPayload: z.string().min(8).optional(),
  tripId: z.string().optional(),
}).refine((v) => Boolean(v.token || v.qrPayload), {
  message: "token o qrPayload requerido",
});
export type ValidateBoardingPassDto = z.infer<typeof ValidateBoardingPassSchema>;
