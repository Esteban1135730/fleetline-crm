import { z } from "zod";
import { Field, FieldOptional } from "@fsg/shared";

export const VisitClassSchema = z.enum([
  "DRIVER_CANDIDATE",
  "SUPPLIER",
  "B2B_MEETING",
  "OTHER",
]);

export const VisitBoardStatusSchema = z.enum([
  "WAITING",
  "CHECKED_IN",
  "CHECKED_OUT",
]);

export const OmnicanalTagSchema = z.enum([
  "COTIZACION_B2B",
  "ATENCION_PADRES",
  "SOPORTE_RUTA",
  "PROVEEDORES",
]);

export const RecepcionCheckInSchema = z.object({
  name: Field.personName,
  document: Field.document,
  reason: Field.text,
  hostName: Field.personName,
  company: FieldOptional.legalName,
  siteLabel: FieldOptional.text,
  phone: FieldOptional.phone,
  kind: z.enum(["VISITOR", "CONTRACTOR"]).optional(),
  visitClass: VisitClassSchema.optional(),
  boardStatus: VisitBoardStatusSchema.optional(),
  badgeRfid: z.string().min(1).optional(),
  hostUserId: z.string().optional(),
  arlValid: z.boolean().optional(),
  arlExpiresAt: z.coerce.date().optional(),
});
export type RecepcionCheckInDto = z.infer<typeof RecepcionCheckInSchema>;

export const ConvertLeadSchema = z.object({
  ticketId: z.string().min(1).optional(),
  companyName: Field.legalName,
  email: Field.email,
  serviceDate: z.coerce.date().optional(),
  phone: FieldOptional.phone,
  nit: FieldOptional.nit,
  notes: FieldOptional.notes,
  assigneeEmail: FieldOptional.email,
  assigneeId: z.string().optional(),
});
export type ConvertLeadDto = z.infer<typeof ConvertLeadSchema>;

export const QuickPqrsSchema = z.object({
  subject: z.string().min(3).optional().default("Retraso en ruta"),
  requester: Field.personName,
  message: Field.notes,
  routeLabel: FieldOptional.text,
  schoolName: FieldOptional.legalName,
  tripId: z.string().optional(),
  vehiclePlate: FieldOptional.plate,
  channel: z
    .enum(["WHATSAPP", "EMAIL", "PHONE", "WEB", "PRESENCIAL", "VOICE_AI"])
    .optional(),
});
export type QuickPqrsDto = z.infer<typeof QuickPqrsSchema>;

export const RadarQuerySchema = z.object({
  q: z.string().optional(),
  school: z.string().optional(),
  route: z.string().optional(),
});
export type RadarQuery = z.infer<typeof RadarQuerySchema>;
