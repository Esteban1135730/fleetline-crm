import { z } from "zod";
import { Field, FieldOptional } from "@fsg/shared";

export const CreatePqrsTicketSchema = z.object({
  subject: z.string().min(3).max(200),
  requester: Field.personName,
  message: Field.notes,
  type: z.enum(["PETITION", "COMPLAINT", "CLAIM", "SUGGESTION"]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  channel: z
    .enum(["WHATSAPP", "EMAIL", "PHONE", "WEB", "PRESENCIAL", "VOICE_AI"])
    .optional(),
  customerId: z.string().optional(),
  vehicleId: z.string().optional(),
  driverId: z.string().optional(),
  assigneeId: z.string().optional(),
});
export type CreatePqrsTicketDto = z.infer<typeof CreatePqrsTicketSchema>;

export const ListPqrsTicketsQuerySchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  type: z.enum(["PETITION", "COMPLAINT", "CLAIM", "SUGGESTION"]).optional(),
  customerId: z.string().optional(),
  q: z.string().optional(),
});
export type ListPqrsTicketsQuery = z.infer<typeof ListPqrsTicketsQuerySchema>;

export const ResolvePqrsTicketSchema = z.object({
  resolutionNotes: z.string().min(3),
  status: z.enum(["RESOLVED", "CLOSED"]).optional(),
});
export type ResolvePqrsTicketDto = z.infer<typeof ResolvePqrsTicketSchema>;

export const VisitorCheckInSchema = z.object({
  name: Field.personName,
  document: Field.document,
  reason: Field.text,
  hostName: Field.personName,
  company: FieldOptional.legalName,
  siteLabel: FieldOptional.text,
  phone: FieldOptional.phone,
  kind: z.enum(["VISITOR", "CONTRACTOR"]).optional(),
  arlValid: z.boolean().optional(),
  arlExpiresAt: z.coerce.date().optional(),
});
export type VisitorCheckInDto = z.infer<typeof VisitorCheckInSchema>;

export const VisitorCheckOutSchema = z.object({
  visitorId: z.string().min(1).optional(),
  passCode: z.string().min(1).optional(),
  document: FieldOptional.document,
}).refine((v) => Boolean(v.visitorId || v.passCode || v.document), {
  message: "visitorId, passCode o document requerido",
});
export type VisitorCheckOutDto = z.infer<typeof VisitorCheckOutSchema>;
