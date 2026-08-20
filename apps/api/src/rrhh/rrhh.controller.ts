import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import type { Response } from "express";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname, join, resolve } from "path";
import { randomUUID } from "crypto";
import { existsSync, mkdirSync } from "fs";
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
  ProvisionEmployeeSchema,
  ShiftCheckInSchema,
  ShiftCheckOutSchema,
  TerminateEmployeeSchema,
  UpsertEmployeeSchema,
} from "./dto/rrhh.dto";

const UPLOADS_DIR = resolve(__dirname, "../../../../uploads");
if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });

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

  @Get("employees/export/excel")
  async exportEmployeesExcel(
    @Req() req: AuthReq,
    @Res() res: Response,
    @Query("columns") columns?: string | string[],
  ) {
    const keys = Array.isArray(columns)
      ? columns
      : columns
        ? String(columns)
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;
    const { buffer, filename } = await this.rrhh.exportEmployeesExcel(
      req.user.organizationId,
      keys,
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`,
    );
    res.send(buffer);
  }

  @Get("employees/export/template")
  async exportEmployeesTemplate(
    @Res() res: Response,
    @Query("columns") columns?: string | string[],
  ) {
    const keys = Array.isArray(columns)
      ? columns
      : columns
        ? String(columns)
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;
    const { buffer, filename } =
      await this.rrhh.buildEmployeesExcelTemplate(keys);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`,
    );
    res.send(buffer);
  }

  @Post("employees/import/excel")
  @Permissions("personal", "CREATE")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = join(UPLOADS_DIR, "rrhh-import");
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          cb(null, `${randomUUID()}${extname(file.originalname) || ".xlsx"}`);
        },
      }),
      limits: { fileSize: 8 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ok =
          /\.(xlsx|xls)$/i.test(file.originalname) ||
          file.mimetype.includes("sheet") ||
          file.mimetype.includes("excel");
        cb(
          ok ? null : new BadRequestException("Solo archivos Excel (.xlsx)"),
          ok,
        );
      },
    }),
  )
  async importEmployeesExcel(
    @Req() req: AuthReq,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file?.path) {
      throw new BadRequestException("Adjunte un archivo Excel");
    }
    const { readFileSync, unlinkSync } = await import("fs");
    try {
      const buffer = readFileSync(file.path);
      return await this.rrhh.importEmployeesExcel(
        req.user.organizationId,
        req.user,
        buffer,
      );
    } finally {
      try {
        unlinkSync(file.path);
      } catch {
        /* ignore */
      }
    }
  }

  @Post("employees/provision")
  @Permissions("personal", "CREATE")
  provisionEmployee(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = ProvisionEmployeeSchema.parse(body ?? {});
    return this.rrhh.provisionEmployee(req.user.organizationId, req.user, dto);
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
  @Roles(
    "platform_master",
    "org_admin",
    "rrhh",
    "vinculaciones",
  )
  @Permissions("personal", "DELETE")
  deleteEmployee(@Req() req: AuthReq, @Param("id") id: string) {
    return this.rrhh.deleteEmployee(
      req.user.organizationId,
      id,
      req.user.role,
    );
  }

  @Post("employees/:id/access/suspend")
  @Permissions("personal", "UPDATE")
  suspendAccess(@Req() req: AuthReq, @Param("id") id: string) {
    return this.rrhh.suspendAccess(req.user.organizationId, id);
  }

  @Post("employees/:id/access/restore")
  @Permissions("personal", "UPDATE")
  restoreAccess(@Req() req: AuthReq, @Param("id") id: string) {
    return this.rrhh.restoreAccess(req.user.organizationId, id);
  }

  @Post("employees/:id/terminate")
  @Permissions("personal", "UPDATE")
  terminateEmployee(
    @Req() req: AuthReq,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const dto = TerminateEmployeeSchema.parse(body ?? {});
    return this.rrhh.terminateEmployee(req.user.organizationId, id, dto);
  }

  @Post("employees/:id/reset-password")
  @Roles("platform_master", "org_admin", "rrhh", "vinculaciones")
  @Permissions("personal", "UPDATE")
  resetPassword(@Req() req: AuthReq, @Param("id") id: string) {
    return this.rrhh.resetUserPassword(
      req.user.organizationId,
      id,
      req.user,
    );
  }

  @Get("employees/:id/documents")
  @Permissions("personal", "READ")
  employeeDocuments(@Req() req: AuthReq, @Param("id") id: string) {
    return this.rrhh.getEmployeeDocuments(req.user.organizationId, id);
  }

  @Post("employees/:id/documents")
  @Permissions("personal", "UPDATE")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: UPLOADS_DIR,
        filename: (_req, file, cb) => {
          const safe = extname(file.originalname).toLowerCase().slice(0, 10);
          cb(null, `${randomUUID()}${safe}`);
        },
      }),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  uploadEmployeeDocument(
    @Req() req: AuthReq,
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body()
    body: {
      slotKey?: string;
      title?: string;
      licenseNumber?: string;
      licenseCategory?: string;
      licenseExpiresAt?: string;
    },
  ) {
    if (!file) throw new BadRequestException("Archivo requerido (campo file)");
    const slotKey = String(body?.slotKey || "").trim();
    if (!slotKey) throw new BadRequestException("slotKey requerido");
    return this.rrhh.uploadEmployeeDocument(
      req.user.organizationId,
      id,
      req.user.userId,
      {
        storedName: file.filename,
        originalName: file.originalname,
        absolutePath: join(UPLOADS_DIR, file.filename),
        byteSize: file.size,
        mimeType: file.mimetype,
      },
      {
        slotKey,
        title: body?.title,
        licenseNumber: body?.licenseNumber,
        licenseCategory: body?.licenseCategory,
        licenseExpiresAt: body?.licenseExpiresAt,
      },
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
