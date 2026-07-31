import { z } from "zod";

export const BoardingCheckInSchema = z.object({
  studentId: z.string().optional(),
  qrCode: z.string().optional(),
  nfcUid: z.string().optional(),
  routeId: z.string().min(1),
  runId: z.string().optional(),
  kind: z.enum(["BOARD", "ALIGHT", "ABSENT"]).optional(),
  method: z.enum(["QR", "NFC", "MANUAL"]).optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
}).refine((v) => Boolean(v.studentId || v.qrCode || v.nfcUid), {
  message: "studentId, qrCode o nfcUid requerido",
});
export type BoardingCheckInDto = z.infer<typeof BoardingCheckInSchema>;

export const RouteStartSchema = z.object({
  routeId: z.string().min(1),
  monitorId: z.string().optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
});
export type RouteStartDto = z.infer<typeof RouteStartSchema>;

export const RouteEndSchema = z.object({
  routeId: z.string().min(1),
  runId: z.string().optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
});
export type RouteEndDto = z.infer<typeof RouteEndSchema>;

export const SchoolNoveltySchema = z.object({
  kind: z.enum([
    "STUDENT_ABSENT",
    "GUARDIAN_DELAY",
    "ROUTE_DELAY",
    "OTHER",
  ]),
  notes: z.string().optional(),
  routeId: z.string().optional(),
  runId: z.string().optional(),
  studentId: z.string().optional(),
});
export type SchoolNoveltyDto = z.infer<typeof SchoolNoveltySchema>;
