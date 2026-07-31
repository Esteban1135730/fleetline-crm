import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ModulesGuard, RequireModule } from "../auth/modules.guard";
import { B2bPortalService } from "./b2b-portal.service";
import {
  B2bActiveFleetQuerySchema,
  B2bDashboardQuerySchema,
  B2bServiceRequestSchema,
} from "./dto/clientes-b2b.dto";

type AuthReq = { user: { organizationId: string; userId: string } };

@Controller("clientes-b2b")
@UseGuards(JwtAuthGuard, ModulesGuard)
@RequireModule("apps", "comercial", "clientes-b2b", "b2b")
export class ClientesB2bController {
  constructor(private portal: B2bPortalService) {}

  @Post("services/request")
  requestService(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = B2bServiceRequestSchema.parse(body ?? {});
    return this.portal.requestService(req.user.organizationId, dto);
  }

  @Get("dashboard")
  dashboard(
    @Req() req: AuthReq,
    @Query() query: Record<string, string>,
  ) {
    const parsed = B2bDashboardQuerySchema.parse(query ?? {});
    return this.portal.dashboard(req.user.organizationId, parsed);
  }

  @Get("active-fleet")
  activeFleet(
    @Req() req: AuthReq,
    @Query() query: Record<string, string>,
  ) {
    const parsed = B2bActiveFleetQuerySchema.parse(query ?? {});
    return this.portal.activeFleet(req.user.organizationId, parsed);
  }
}
