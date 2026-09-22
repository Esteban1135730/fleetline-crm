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
import { SarlaftAlertStatus } from "@fsg/db";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ModulesGuard, RequireModule } from "../auth/modules.guard";
import { SarlaftScreeningService } from "./sarlaft-screening.service";
import {
  LiberarBloqueoSchema,
  ResolveAlertSchema,
  ScreenEntitySchema,
} from "./dto/sarlaft.dto";

type AuthReq = {
  user: { organizationId: string; userId: string };
};

function parseAlertStatus(raw?: string): SarlaftAlertStatus | undefined {
  if (!raw) return undefined;
  const u = String(raw).toUpperCase();
  /** Alias UI: OPEN = alertas pendientes de Oficial */
  if (u === "OPEN") return undefined;
  if (
    u === "PENDING" ||
    u === "UNDER_REVIEW" ||
    u === "RESOLVED" ||
    u === "DISMISSED"
  ) {
    return u as SarlaftAlertStatus;
  }
  return undefined;
}

@Controller("sarlaft")
@UseGuards(JwtAuthGuard, ModulesGuard)
@RequireModule("sarlaft")
export class SarlaftController {
  constructor(private screening: SarlaftScreeningService) {}

  @Post("screen")
  screen(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = ScreenEntitySchema.parse(body ?? {});
    return this.screening.screenManual(
      req.user.organizationId,
      dto,
      req.user.userId,
    );
  }

  @Get("alerts")
  alerts(
    @Req() req: AuthReq,
    @Query("status") status?: string,
  ) {
    return this.screening.listAlerts(
      req.user.organizationId,
      parseAlertStatus(status),
    );
  }

  /** GET /sarlaft/bloqueados — maestros con sarlaftBlocked */
  @Get("bloqueados")
  bloqueados(@Req() req: AuthReq) {
    return this.screening.listBlocked(req.user.organizationId);
  }

  /** POST /sarlaft/bloqueados/liberar — justificación + clearBlock */
  @Post("bloqueados/liberar")
  liberar(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = LiberarBloqueoSchema.parse(body ?? {});
    return this.screening.liberarBloqueo(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  @Post("alerts/:id/resolve")
  resolve(
    @Req() req: AuthReq,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const dto = ResolveAlertSchema.parse(body ?? {});
    return this.screening.resolveAlert(
      req.user.organizationId,
      id,
      req.user.userId,
      dto,
    );
  }
}
