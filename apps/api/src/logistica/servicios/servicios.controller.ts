import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { ModulesGuard, RequireModule } from "../../auth/modules.guard";
import { LogisticaOpsService } from "../logistica-ops.service";
import {
  CreateServicioSchema,
  ReassignServicioSchema,
} from "../dto/logistica.dto";
import { z } from "zod";

type AuthReq = {
  user: { organizationId: string; userId: string };
};

const PreviewRutaSchema = z.object({
  originLat: z.coerce.number(),
  originLng: z.coerce.number(),
  destLat: z.coerce.number(),
  destLng: z.coerce.number(),
});

const ReverseSchema = z.object({
  lat: z.coerce.number(),
  lng: z.coerce.number(),
});

/**
 * Submenú 1 — Programación de Servicios y Tracking GPS
 * Prefijo: /logistica/servicios
 */
@Controller("logistica/servicios")
@UseGuards(JwtAuthGuard, ModulesGuard)
@RequireModule("logistica")
export class ServiciosController {
  constructor(private ops: LogisticaOpsService) {}

  @Get()
  list(@Req() req: AuthReq) {
    return this.ops.listServicios(req.user.organizationId);
  }

  /** Búsqueda de lugares (tipo Uber) — Nominatim CO */
  @Get("geocode")
  geocode(@Query("q") q?: string) {
    return this.ops.searchPlaces(q ?? "");
  }

  /** Click en mapa → dirección legible */
  @Post("reverse-geocode")
  reverse(@Body() body: unknown) {
    const dto = ReverseSchema.parse(body ?? {});
    return this.ops.reversePlace(dto.lat, dto.lng);
  }

  /** Vista previa de ruta antes de confirmar el servicio */
  @Post("preview-ruta")
  preview(@Body() body: unknown) {
    const dto = PreviewRutaSchema.parse(body ?? {});
    return this.ops.previewRuta(dto);
  }

  @Post()
  create(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = CreateServicioSchema.parse(body ?? {});
    return this.ops.createServicio(
      req.user.organizationId,
      dto,
      req.user.userId,
    );
  }

  @Get(":id/tracking")
  tracking(@Req() req: AuthReq, @Param("id") id: string) {
    return this.ops.tracking(req.user.organizationId, id);
  }

  @Post(":id/iniciar")
  iniciar(@Req() req: AuthReq, @Param("id") id: string) {
    return this.ops.markStarted(
      req.user.organizationId,
      id,
      req.user.userId,
    );
  }

  @Post(":id/cerrar")
  cerrar(@Req() req: AuthReq, @Param("id") id: string) {
    return this.ops.markCompleted(
      req.user.organizationId,
      id,
      req.user.userId,
    );
  }

  @Post("reasignar")
  reasignar(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = ReassignServicioSchema.parse(body ?? {});
    return this.ops.reassignServicio(
      req.user.organizationId,
      dto,
      req.user.userId,
    );
  }
}
