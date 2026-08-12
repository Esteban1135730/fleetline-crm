import { z } from "zod";

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
  name: z.string().min(2),
  document: z.string().min(4),
  reason: z.string().min(3),
  hostName: z.string().min(2),
  company: z.string().optional(),
  siteLabel: z.string().optional(),
  phone: z.string().optional(),
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
  ticketId: z.string().min(1),
  companyName: z.string().min(2),
  email: z.string().email(),
  serviceDate: z.coerce.date().optional(),
  phone: z.string().optional(),
  nit: z.string().optional(),
  notes: z.string().optional(),
  assigneeEmail: z.string().email().optional(),
  assigneeId: z.string().optional(),
});
export type ConvertLeadDto = z.infer<typeof ConvertLeadSchema>;

export const QuickPqrsSchema = z.object({
  subject: z.string().min(3).optional().default("Retraso en ruta"),
  requester: z.string().min(2),
  message: z.string().min(3),
  routeLabel: z.string().optional(),
  schoolName: z.string().optional(),
  tripId: z.string().optional(),
  vehiclePlate: z.string().optional(),
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
