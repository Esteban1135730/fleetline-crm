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
import { DriverNoveltySchema } from "../dto/logistica.dto";

type AuthReq = {
  user: { organizationId: string; userId: string };
};

/**
 * Submenú 2 — Gestión de Conductores y Nómina de Extras
 * Prefijo: /logistica/conductores
 */
@Controller("logistica/conductores")
@UseGuards(JwtAuthGuard, ModulesGuard)
@RequireModule("logistica")
export class ConductoresController {
  constructor(private ops: LogisticaOpsService) {}

  @Get()
  list(@Req() req: AuthReq) {
    return this.ops.listDrivers(req.user.organizationId);
  }

  @Get("calendario")
  calendario(
    @Req() req: AuthReq,
    @Query("year") year?: string,
    @Query("month") month?: string,
  ) {
    const now = new Date();
    return this.ops.calendarMonth(
      req.user.organizationId,
      year ? Number(year) : now.getFullYear(),
      month ? Number(month) : now.getMonth() + 1,
    );
  }

  @Post("novedades")
  novedades(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = DriverNoveltySchema.parse(body ?? {});
    return this.ops.registerNovelty(
      req.user.organizationId,
      dto,
      req.user.userId,
    );
  }

  @Get(":id/liquidacion-extras")
  liquidacion(
    @Req() req: AuthReq,
    @Param("id") id: string,
    @Query("month") month?: string,
    @Query("year") year?: string,
  ) {
    return this.ops.liquidacionExtras(
      req.user.organizationId,
      id,
      month ? Number(month) : undefined,
      year ? Number(year) : undefined,
    );
  }
}
