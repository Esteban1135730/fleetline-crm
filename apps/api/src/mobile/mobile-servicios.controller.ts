import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { TripIncidentCategory } from "@fsg/db";
import { z } from "zod";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ModulesGuard, RequireModule } from "../auth/modules.guard";
import { MobileTripControlService } from "./mobile-trip-control.service";

type AuthReq = {
  user: { organizationId: string; userId: string; role: string };
};

const GpsSchema = z.object({
  lat: z.coerce.number(),
  lng: z.coerce.number(),
});

const ApproveSchema = z.object({
  decision: z.enum(["ACEPTAR", "CANCELAR"]),
  note: z.string().max(1000).optional(),
});

const IncidentSchema = z.object({
  category: z.nativeEnum(TripIncidentCategory),
  notes: z.string().max(2000).optional(),
  photoUrl: z.string().max(200_000).optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
});

/**
 * Control estricto inicio/fin + desviaciones + incidentes.
 * Alias: /api/v1/servicios y /servicios
 */
@Controller(["api/v1/servicios", "servicios"])
@UseGuards(JwtAuthGuard, ModulesGuard)
@RequireModule("logistica")
export class MobileServiciosController {
  constructor(private control: MobileTripControlService) {}

  @Get("reloj")
  reloj() {
    return this.control.serverClock();
  }

  @Get("desviaciones/pendientes")
  pendientes(@Req() req: AuthReq) {
    return this.control.listPendingDeviations(req.user.organizationId);
  }

  @Post(":id/iniciar")
  iniciar(
    @Req() req: AuthReq,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const gps = GpsSchema.parse(body ?? {});
    return this.control.iniciar(req.user.organizationId, id, req.user, gps);
  }

  @Post(":id/finalizar")
  finalizar(
    @Req() req: AuthReq,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const gps = GpsSchema.parse(body ?? {});
    return this.control.finalizar(req.user.organizationId, id, req.user, gps);
  }

  @Post(":id/aprobar-desviacion")
  aprobar(
    @Req() req: AuthReq,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const dto = ApproveSchema.parse(body ?? {});
    return this.control.aprobarDesviacion(
      req.user.organizationId,
      id,
      req.user,
      dto,
    );
  }

  @Post(":id/incidentes")
  incidentes(
    @Req() req: AuthReq,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const dto = IncidentSchema.parse(body ?? {});
    return this.control.reportIncident(req.user.organizationId, id, req.user, {
      category: dto.category,
      notes: dto.notes,
      photoUrl: dto.photoUrl || undefined,
      lat: dto.lat,
      lng: dto.lng,
    });
  }
}
