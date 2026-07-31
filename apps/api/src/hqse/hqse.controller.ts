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
import { HqseIncidentService } from "./hqse-incident.service";
import { PesvComplianceService } from "./pesv-compliance.service";
import {
  CreateAuditSchema,
  CreateIncidentSchema,
  ListIncidentsQuerySchema,
  PesvScorecardQuerySchema,
} from "./dto/hqse.dto";

type AuthReq = { user: { organizationId: string; userId: string } };

@Controller("hqse")
@UseGuards(JwtAuthGuard, ModulesGuard)
@RequireModule("qhse", "hqse")
export class HqseController {
  constructor(
    private incidents: HqseIncidentService,
    private pesv: PesvComplianceService,
  ) {}

  @Get("incidents")
  listIncidents(
    @Req() req: AuthReq,
    @Query() query: Record<string, string>,
  ) {
    const parsed = ListIncidentsQuerySchema.parse(query ?? {});
    return this.incidents.list(req.user.organizationId, parsed);
  }

  @Post("incidents")
  createIncident(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = CreateIncidentSchema.parse(body ?? {});
    return this.incidents.create(
      req.user.organizationId,
      dto,
      req.user.userId,
    );
  }

  @Get("pesv/scorecard")
  pesvScorecard(
    @Req() req: AuthReq,
    @Query() query: Record<string, string>,
  ) {
    const parsed = PesvScorecardQuerySchema.parse(query ?? {});
    return this.pesv.scorecard(req.user.organizationId, parsed);
  }

  @Get("pesv/risk-matrix")
  riskMatrix(@Req() req: AuthReq) {
    return this.pesv.listRiskMatrix(req.user.organizationId);
  }

  @Post("audits")
  createAudit(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = CreateAuditSchema.parse(body ?? {});
    return this.pesv.createAudit(req.user.organizationId, dto);
  }

  @Get("audits")
  listAudits(@Req() req: AuthReq) {
    return this.pesv.listAudits(req.user.organizationId);
  }
}
