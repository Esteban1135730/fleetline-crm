import { Controller, Get, Req, UseGuards } from "@nestjs/common";
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

  @Get("charts")
  charts(@Req() req: { user: { organizationId: string } }) {
    return this.service.getCharts(req.user.organizationId);
  }

  @Get("ticker")
  ticker(@Req() req: { user: { organizationId: string } }) {
    return this.service.getTicker(req.user.organizationId);
  }
}
