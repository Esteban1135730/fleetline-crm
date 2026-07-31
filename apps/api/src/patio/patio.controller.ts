import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ModulesGuard, RequireModule } from "../auth/modules.guard";
import { YardAccessService } from "./yard-access.service";
import { PhysicalInspectionService } from "./physical-inspection.service";
import {
  YardAccessLogSchema,
  YardInspectionSchema,
} from "./dto/patio.dto";

type AuthReq = { user: { organizationId: string; userId: string } };

@Controller("patio")
@UseGuards(JwtAuthGuard, ModulesGuard)
@RequireModule("parqueadero")
export class PatioController {
  constructor(
    private access: YardAccessService,
    private inspections: PhysicalInspectionService,
  ) {}

  @Post("access-log")
  accessLog(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = YardAccessLogSchema.parse(body ?? {});
    return this.access.recordAccess(
      req.user.organizationId,
      dto,
      req.user.userId,
    );
  }

  @Post("inspections")
  createInspection(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = YardInspectionSchema.parse(body ?? {});
    return this.inspections.createInspection(
      req.user.organizationId,
      dto,
      req.user.userId,
    );
  }

  @Get("current-inventory")
  currentInventory(@Req() req: AuthReq) {
    return this.access.currentInventory(req.user.organizationId);
  }
}
