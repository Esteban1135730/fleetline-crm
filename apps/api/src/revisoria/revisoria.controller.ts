import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ModulesGuard, RequireModule } from "../auth/modules.guard";
import { RevisoriaReadOnlyGuard } from "./revisoria-readonly.guard";
import { RevisoriaForenseService } from "./revisoria-forense.service";
import {
  AuditTrailQuerySchema,
  type AuditTrailQueryDto,
} from "./dto/audit-trail-query.dto";

@Controller("revisoria")
@UseGuards(JwtAuthGuard, ModulesGuard, RevisoriaReadOnlyGuard)
@RequireModule("revisoria_fiscal")
export class RevisoriaController {
  constructor(private forense: RevisoriaForenseService) {}

  @Get("audit-trail")
  auditTrail(
    @Req() req: { user: { organizationId: string } },
    @Query() query: AuditTrailQueryDto,
  ) {
    const parsed = AuditTrailQuerySchema.parse(query ?? {});
    return this.forense.auditTrail(req.user.organizationId, parsed);
  }
}
