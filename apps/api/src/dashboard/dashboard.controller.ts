import { Body, Controller, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ModulesGuard, RequireModule } from "../auth/modules.guard";
import { DashboardService } from "./dashboard.service";

@Controller("dashboard")
@UseGuards(JwtAuthGuard, ModulesGuard)
@RequireModule("dashboard")
export class DashboardController {
  constructor(private service: DashboardService) {}

  @Get("metrics")
  metrics(@Req() req: { user: { organizationId: string } }) {
    return this.service.getMetrics(req.user.organizationId);
  }

  @Get("today")
  today(@Req() req: { user: { organizationId: string } }) {
    return this.service.today(req.user.organizationId);
  }

  @Get("plate")
  plate(
    @Req() req: { user: { organizationId: string } },
    @Query("q") q?: string,
  ) {
    return this.service.plate(req.user.organizationId, q || "");
  }

  @Get("dispatch-options")
  dispatchOptions(@Req() req: { user: { organizationId: string } }) {
    return this.service.dispatchOptions(req.user.organizationId);
  }

  @Post("trips")
  createTrip(
    @Req() req: { user: { organizationId: string } },
    @Body()
    body: {
      origin: string;
      destination: string;
      customerId?: string;
      vehicleId?: string;
      driverId?: string;
    },
  ) {
    return this.service.createExpressTrip(req.user.organizationId, body);
  }

  @Post("work-orders")
  createWorkOrder(
    @Req() req: { user: { organizationId: string } },
    @Body() body: { vehicleId: string; description: string },
  ) {
    return this.service.createExpressWorkOrder(req.user.organizationId, body);
  }

  @Get("charts")
  charts(@Req() req: { user: { organizationId: string } }) {
    return this.service.getCharts(req.user.organizationId);
  }

  @Get("ticker")
  ticker(@Req() req: { user: { organizationId: string } }) {
    return this.service.getTicker(req.user.organizationId);
  }
}
