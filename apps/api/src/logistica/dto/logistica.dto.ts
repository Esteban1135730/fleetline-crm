import { z } from "zod";

export const CreateServicioSchema = z.object({
  origin: z.string().min(2),
  destination: z.string().min(2),
  departAt: z.coerce.date(),
  arriveAt: z.coerce.date().optional(),
  driverId: z.string().min(1).optional(),
  vehicleId: z.string().min(1).optional(),
  customerId: z.string().min(1).optional(),
  contractId: z.string().min(1).optional(),
  fareAmount: z.coerce.number().nonnegative().optional(),
  officerName: z.string().optional(),
  officerDocument: z.string().optional(),
  originLat: z.coerce.number().optional(),
  originLng: z.coerce.number().optional(),
  destLat: z.coerce.number().optional(),
  destLng: z.coerce.number().optional(),
});
export type CreateServicioDto = z.infer<typeof CreateServicioSchema>;

export const DriverNoveltySchema = z.object({
  driverId: z.string().min(1),
  kind: z.enum([
    "INCAPACITY",
    "VACATION_PAID",
    "REST",
    "AVAILABLE_NO_CONTRACT",
    "UNJUSTIFIED_ABSENCE",
    "AVAILABLE",
    "ASSIGNED",
  ]),
  dateFrom: z.coerce.date(),
  dateTo: z.coerce.date(),
  notes: z.string().max(1000).optional(),
  /** Reasignar automáticamente el primer servicio sugerido */
  reassignTripId: z.string().min(1).optional(),
  substituteDriverId: z.string().min(1).optional(),
});
export type DriverNoveltyDto = z.infer<typeof DriverNoveltySchema>;

export const ReassignServicioSchema = z.object({
  tripId: z.string().min(1),
  newDriverId: z.string().min(1),
});
export type ReassignServicioDto = z.infer<typeof ReassignServicioSchema>;
