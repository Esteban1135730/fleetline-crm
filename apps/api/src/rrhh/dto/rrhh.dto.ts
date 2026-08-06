import { z } from "zod";

export const UpsertEmployeeSchema = z
  .object({
    id: z.string().min(1).optional(),
    name: z.string().min(2),
    document: z.string().min(3),
    /** Canónico Prisma */
    title: z.string().min(1).optional(),
    /** Alias UI legado */
    position: z.string().min(1).optional(),
    area: z.string().min(1),
    status: z.enum(["ACTIVE", "VACATION", "MEDICAL", "INACTIVE"]).optional(),
    baseSalary: z.coerce.number().nonnegative().optional(),
    hourlyRate: z.coerce.number().nonnegative().optional(),
    email: z.string().email().optional().nullable(),
    phone: z.string().optional().nullable(),
    driverId: z.string().min(1).optional().nullable(),
  })
  .transform((v) => ({
    ...v,
    title: (v.title || v.position || "").trim(),
  }))
  .superRefine((v, ctx) => {
    if (!v.title) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "title o position requerido",
        path: ["title"],
      });
    }
  });
export type UpsertEmployeeDto = z.infer<typeof UpsertEmployeeSchema>;

export const PatchEmployeeSchema = z
  .object({
    name: z.string().min(2).optional(),
    title: z.string().min(1).optional(),
    position: z.string().min(1).optional(),
    area: z.string().min(1).optional(),
    status: z.enum(["ACTIVE", "VACATION", "MEDICAL", "INACTIVE"]).optional(),
    baseSalary: z.coerce.number().nonnegative().optional(),
    hourlyRate: z.coerce.number().nonnegative().optional(),
    email: z.string().email().optional().nullable(),
    phone: z.string().optional().nullable(),
    driverId: z.string().min(1).optional().nullable(),
    fatigueScore: z.coerce.number().int().nonnegative().optional(),
  })
  .transform((v) => ({
    ...v,
    title: v.title ?? v.position,
  }));
export type PatchEmployeeDto = z.infer<typeof PatchEmployeeSchema>;

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
  commissionPerTrip: z.coerce.number().nonnegative().default(15_000),
  overtimeMultiplier: z.coerce.number().positive().default(1.25),
  nightMultiplier: z.coerce.number().positive().default(1.35),
  ordinaryDayHours: z.coerce.number().positive().default(8),
  employeeIds: z.array(z.string().min(1)).optional(),
});
export type PayrollCalculateDto = z.infer<typeof PayrollCalculateSchema>;

export const CreateTrainingSchema = z.object({
  driverId: z.string().min(1),
  topic: z.string().min(2),
  completedAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional().nullable(),
  provider: z.string().optional().nullable(),
  certificateRef: z.string().optional().nullable(),
});
export type CreateTrainingDto = z.infer<typeof CreateTrainingSchema>;
