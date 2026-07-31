import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ModulesGuard, RequireModule } from "../auth/modules.guard";
import { RrhhService } from "./rrhh.service";
import { FatigueManagementService } from "./fatigue-management.service";
import { PayrollService } from "./payroll.service";
import {
  PayrollCalculateSchema,
  ShiftCheckInSchema,
  ShiftCheckOutSchema,
  UpsertEmployeeSchema,
} from "./dto/rrhh.dto";

type AuthReq = { user: { organizationId: string; userId: string } };

@Controller("rrhh")
@UseGuards(JwtAuthGuard, ModulesGuard)
@RequireModule("rrhh")
export class RrhhController {
  constructor(
    private rrhh: RrhhService,
    private fatigue: FatigueManagementService,
    private payroll: PayrollService,
  ) {}

  @Get("employees")
  listEmployees(@Req() req: AuthReq) {
    return this.rrhh.listEmployees(req.user.organizationId);
  }

  @Post("employees")
  upsertEmployee(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = UpsertEmployeeSchema.parse(body ?? {});
    return this.rrhh.upsertEmployee(req.user.organizationId, dto);
  }

  @Post("shifts/check-in")
  checkIn(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = ShiftCheckInSchema.parse(body ?? {});
    return this.fatigue.checkIn(req.user.organizationId, dto);
  }

  @Post("shifts/check-out")
  checkOut(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = ShiftCheckOutSchema.parse(body ?? {});
    return this.fatigue.checkOut(req.user.organizationId, dto);
  }

  @Get("drivers/:id/fatigue-status")
  fatigueStatus(@Req() req: AuthReq, @Param("id") id: string) {
    return this.rrhh.fatigueStatus(req.user.organizationId, id);
  }

  @Post("payroll/calculate")
  calculatePayroll(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = PayrollCalculateSchema.parse(body ?? {});
    return this.payroll.calculate(req.user.organizationId, dto);
  }
}
