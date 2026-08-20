import { z } from "zod";
import { Field, FieldOptional } from "@fsg/shared";

const contractTypes = [
  "INDEFINIDO",
  "TERMINO_FIJO",
  "OBRA_LABOR",
  "APRENDIZAJE",
  "PRESTACION_SERVICIOS",
] as const;

const bankAccountTypes = ["AHORROS", "CORRIENTE"] as const;

const hrFields = {
  address: z.string().max(200).optional().nullable(),
  city: z.string().max(80).optional().nullable(),
  contractType: z.enum(contractTypes).optional().nullable(),
  hireDate: z.coerce.date().optional().nullable(),
  eps: z.string().max(120).optional().nullable(),
  arl: z.string().max(120).optional().nullable(),
  pensionFund: z.string().max(120).optional().nullable(),
  compensationFund: z.string().max(120).optional().nullable(),
  bankName: z.string().max(120).optional().nullable(),
  bankAccountType: z.enum(bankAccountTypes).optional().nullable(),
  bankAccountNumber: z.string().max(40).optional().nullable(),
  emergencyContactName: z.string().max(120).optional().nullable(),
  emergencyContactPhone: FieldOptional.phone.nullable().optional(),
  emergencyContactRelation: z.string().max(80).optional().nullable(),
};

export const ProvisionEmployeeSchema = z
  .object({
    name: Field.personName,
    document: Field.document,
    email: Field.email,
    phone: FieldOptional.phone,
    role: z.string().min(1),
    title: z.string().min(1).optional(),
    position: z.string().min(1).optional(),
    area: z.string().min(1),
    baseSalary: Field.money.optional(),
    hourlyRate: Field.money.optional(),
    driverId: z.string().min(1).optional().nullable(),
    ...hrFields,
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
export type ProvisionEmployeeDto = z.infer<typeof ProvisionEmployeeSchema>;

export const UpsertEmployeeSchema = z
  .object({
    id: z.string().min(1).optional(),
    name: Field.personName,
    document: Field.document,
    /** Canónico Prisma */
    title: z.string().min(1).optional(),
    /** Alias UI legado */
    position: z.string().min(1).optional(),
    area: z.string().min(1),
    status: z.enum(["ACTIVE", "VACATION", "MEDICAL", "INACTIVE"]).optional(),
    baseSalary: Field.money.optional(),
    hourlyRate: Field.money.optional(),
    email: FieldOptional.email,
    phone: FieldOptional.phone,
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
    name: Field.personName.optional(),
    title: z.string().min(1).optional(),
    position: z.string().min(1).optional(),
    area: z.string().min(1).optional(),
    status: z.enum(["ACTIVE", "VACATION", "MEDICAL", "INACTIVE"]).optional(),
    baseSalary: Field.money.optional(),
    hourlyRate: Field.money.optional(),
    email: z.union([Field.email, z.null()]).optional(),
    phone: z.union([Field.phone, z.null()]).optional(),
    driverId: z.string().min(1).optional().nullable(),
    fatigueScore: Field.integer.nonnegative().optional(),
    document: Field.document.optional(),
    role: z.string().min(1).optional(),
    ...hrFields,
  })
  .transform((v) => ({
    ...v,
    title: v.title ?? v.position,
  }));
export type PatchEmployeeDto = z.infer<typeof PatchEmployeeSchema>;

export const TerminateEmployeeSchema = z.object({
  reason: z.string().max(500).optional().nullable(),
});
export type TerminateEmployeeDto = z.infer<typeof TerminateEmployeeSchema>;

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
