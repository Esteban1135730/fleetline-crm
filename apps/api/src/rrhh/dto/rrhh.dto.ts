import { z } from "zod";

export const UpsertEmployeeSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(2),
  document: z.string().min(3),
  title: z.string().min(1),
  area: z.string().min(1),
  status: z.enum(["ACTIVE", "VACATION", "MEDICAL", "INACTIVE"]).optional(),
  baseSalary: z.coerce.number().nonnegative().optional(),
  hourlyRate: z.coerce.number().nonnegative().optional(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  driverId: z.string().min(1).optional().nullable(),
});
export type UpsertEmployeeDto = z.infer<typeof UpsertEmployeeSchema>;

export const ShiftCheckInSchema = z.object({
  driverId: z.string().min(1),
  checkInAt: z.coerce.date().optional(),
  notes: z.string().max(500).optional(),
});
export type ShiftCheckInDto = z.infer<typeof ShiftCheckInSchema>;

export const ShiftCheckOutSchema = z.object({
  driverId: z.string().min(1),
  shiftId: z.string().min(1).optional(),
  checkOutAt: z.coerce.date().optional(),
  notes: z.string().max(500).optional(),
});
export type ShiftCheckOutDto = z.infer<typeof ShiftCheckOutSchema>;

export const PayrollCalculateSchema = z.object({
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  /** Comisión fija COP por viaje COMPLETED */
  commissionPerTrip: z.coerce.number().nonnegative().default(15_000),
  /** Multiplicador horas extra sobre hourlyRate (ej. 1.25) */
  overtimeMultiplier: z.coerce.number().positive().default(1.25),
  /** Multiplicador recargo nocturno (ej. 1.35) */
  nightMultiplier: z.coerce.number().positive().default(1.35),
  /** Horas ordinarias diarias antes de overtime */
  ordinaryDayHours: z.coerce.number().positive().default(8),
  employeeIds: z.array(z.string().min(1)).optional(),
});
export type PayrollCalculateDto = z.infer<typeof PayrollCalculateSchema>;
