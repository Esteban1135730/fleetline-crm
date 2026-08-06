import {
  Body,
  Controller,
  Get,
  Param,
  Post,
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

type AuthReq = {
  user: { organizationId: string; userId: string };
};

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
