import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ModulesGuard, RequireModule } from "../auth/modules.guard";
import { Roles, RolesGuard } from "../auth/roles.guard";
import { Permissions, PermissionsGuard } from "../auth/permissions.guard";
import { RrhhService } from "./rrhh.service";
import { FatigueManagementService } from "./fatigue-management.service";
import { PayrollService } from "./payroll.service";
import {
  CreateTrainingSchema,
  PatchEmployeeSchema,
  PayrollCalculateSchema,
  ShiftCheckInSchema,
  ShiftCheckOutSchema,
  UpsertEmployeeSchema,
} from "./dto/rrhh.dto";

type AuthReq = {
  user: { organizationId: string; userId: string; role: string };
};

@Controller(["rrhh", "api/v1/rrhh"])
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, ModulesGuard)
@RequireModule("rrhh")
@Roles(
  "vinculaciones",
  "rrhh",
  "org_admin",
  "platform_master",
  "gerente_general",
  "sub_gerente",
)
@Permissions("rrhh", "READ")
export class RrhhController {
  constructor(
    private rrhh: RrhhService,
    private fatigue: FatigueManagementService,
    private payroll: PayrollService,
  ) {}

  @Get("overview")
  overview(@Req() req: AuthReq) {
    return this.rrhh.overview(req.user.organizationId);
  }

  @Get("employees")
  listEmployees(@Req() req: AuthReq) {
    return this.rrhh.listEmployees(req.user.organizationId);
  }

  @Post("employees")
  @Permissions("personal", "CREATE")
  upsertEmployee(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = UpsertEmployeeSchema.parse(body ?? {});
    return this.rrhh.upsertEmployee(req.user.organizationId, dto);
  }

  @Patch("employees/:id")
  @Permissions("personal", "UPDATE")
  patchEmployee(
    @Req() req: AuthReq,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const dto = PatchEmployeeSchema.parse(body ?? {});
    return this.rrhh.patchEmployee(
      req.user.organizationId,
      id,
      dto,
      req.user.role,
    );
  }

  @Delete("employees/:id")
  @Roles("platform_master", "org_admin")
  @Permissions("personal", "DELETE")
  deleteEmployee(@Req() req: AuthReq, @Param("id") id: string) {
    return this.rrhh.deleteEmployee(
      req.user.organizationId,
      id,
      req.user.role,
    );
  }

  @Get("drivers")
  listDrivers(@Req() req: AuthReq) {
    return this.rrhh.listDriversForOps(req.user.organizationId);
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

  @Post("licenses/audit")
  auditLicenses(@Req() req: AuthReq) {
    return this.rrhh.auditLicenses(req.user.organizationId);
  }

  @Post("payroll/calculate")
  @Permissions("nomina", "CREATE")
  calculatePayroll(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = PayrollCalculateSchema.parse(body ?? {});
    return this.payroll.calculate(req.user.organizationId, dto);
  }

  @Get("payroll/runs")
  @Permissions("nomina", "READ")
  listPayrollRuns(
    @Req() req: AuthReq,
    @Query("take") take?: string,
  ) {
    return this.rrhh.listPayrollRuns(
      req.user.organizationId,
      take ? Number(take) : 20,
    );
  }

  @Get("trainings")
  listTrainings(@Req() req: AuthReq) {
    return this.rrhh.listTrainings(req.user.organizationId);
  }

  @Post("trainings")
  createTraining(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = CreateTrainingSchema.parse(body ?? {});
    return this.rrhh.createTraining(req.user.organizationId, dto);
  }
}
