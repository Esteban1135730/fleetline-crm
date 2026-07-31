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
  ResolveAlertSchema,
  ScreenEntitySchema,
} from "./dto/sarlaft.dto";

type AuthReq = {
  user: { organizationId: string; userId: string };
};

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
    const parsed = status
      ? (String(status).toUpperCase() as SarlaftAlertStatus)
      : undefined;
    return this.screening.listAlerts(req.user.organizationId, parsed);
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
