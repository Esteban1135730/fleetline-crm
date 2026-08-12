import { z } from "zod";

const emptyToUndef = (v: unknown) =>
  v === "" || v === null || v === undefined ? undefined : v;

export const CreateServicioSchema = z.object({
  origin: z.string().min(2, "Origen requerido"),
  destination: z.string().min(2, "Destino requerido"),
  departAt: z.coerce.date({
    errorMap: () => ({ message: "Fecha/hora de salida inválida" }),
  }),
  arriveAt: z.preprocess(emptyToUndef, z.coerce.date().optional()),
  driverId: z.preprocess(emptyToUndef, z.string().min(1).optional()),
  vehicleId: z.preprocess(emptyToUndef, z.string().min(1).optional()),
  customerId: z.preprocess(emptyToUndef, z.string().min(1).optional()),
  contractId: z.preprocess(emptyToUndef, z.string().min(1).optional()),
  fareAmount: z.preprocess(emptyToUndef, z.coerce.number().nonnegative().optional()),
  officerName: z.preprocess(emptyToUndef, z.string().optional()),
  officerDocument: z.preprocess(emptyToUndef, z.string().optional()),
  originLat: z.preprocess(emptyToUndef, z.coerce.number().optional()),
  originLng: z.preprocess(emptyToUndef, z.coerce.number().optional()),
  destLat: z.preprocess(emptyToUndef, z.coerce.number().optional()),
  destLng: z.preprocess(emptyToUndef, z.coerce.number().optional()),
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
