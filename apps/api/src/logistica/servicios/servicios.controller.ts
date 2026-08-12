import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { ModulesGuard, RequireModule } from "../../auth/modules.guard";
import { Roles, RolesGuard } from "../../auth/roles.guard";
import { Permissions, PermissionsGuard } from "../../auth/permissions.guard";
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
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, ModulesGuard)
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
  @Permissions("logistica_despacho", "CREATE")
  @Roles(
    "gestor_operativo",
    "director_operativo",
    "centro_control",
    "supervisor_logistica",
    "coordinador_operativo",
    "org_admin",
    "platform_master",
    "gerente_general",
  )
  create(@Req() req: AuthReq, @Body() body: unknown) {
    const parsed = CreateServicioSchema.safeParse(body ?? {});
    if (!parsed.success) {
      const msg = parsed.error.issues
        .map((i) => i.message)
        .filter(Boolean)
        .join(" · ");
      throw new BadRequestException(msg || "Datos de servicio inválidos");
    }
    return this.ops.createServicio(
      req.user.organizationId,
      parsed.data,
      req.user.userId,
    );
  }

  @Get("recursos-despacho")
  recursos(@Req() req: AuthReq) {
    return this.ops.listDispatchPool(req.user.organizationId);
  }

  @Post("despachar")
  @Permissions("logistica_despacho", "CREATE")
  @Roles(
    "gestor_operativo",
    "director_operativo",
    "centro_control",
    "supervisor_logistica",
    "coordinador_operativo",
    "org_admin",
    "platform_master",
    "gerente_general",
  )
  despachar(
    @Req() req: AuthReq,
    @Body() body: { tripId?: string; id?: string; vehicleId?: string; driverId?: string },
  ) {
    const id = body.tripId || body.id;
    if (!id) throw new BadRequestException("tripId requerido");
    return this.ops.assignServicio(
      req.user.organizationId,
      id,
      {
        vehicleId: body.vehicleId!,
        driverId: body.driverId!,
      },
      req.user.userId,
    );
  }

  @Post(":id/asignar")
  @Permissions("logistica_despacho", "CREATE")
  @Roles(
    "gestor_operativo",
    "director_operativo",
    "centro_control",
    "supervisor_logistica",
    "coordinador_operativo",
    "org_admin",
    "platform_master",
    "gerente_general",
  )
  asignar(
    @Req() req: AuthReq,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const dto = z
      .object({
        driverId: z.string().min(1),
        vehicleId: z.string().min(1),
      })
      .parse(body ?? {});
    return this.ops.assignServicio(
      req.user.organizationId,
      id,
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
  @Permissions("logistica_despacho", "UPDATE")
  @Roles(
    "gestor_operativo",
    "director_operativo",
    "centro_control",
    "supervisor_logistica",
    "coordinador_operativo",
    "org_admin",
    "platform_master",
    "gerente_general",
  )
  reasignar(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = ReassignServicioSchema.parse(body ?? {});
    return this.ops.reassignServicio(
      req.user.organizationId,
      dto,
      req.user.userId,
    );
  }
}
