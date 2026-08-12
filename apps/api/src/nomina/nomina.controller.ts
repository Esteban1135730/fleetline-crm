import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ModulesGuard, RequireModule } from "../auth/modules.guard";
import { NominaExportService } from "./nomina-export.service";
import { NominaReportService } from "./nomina-report.service";

type AuthReq = {
  user: { organizationId: string; userId: string };
};

const LaborConfigSchema = z.object({
  baseSalary: z.coerce.number().positive().optional(),
  monthlyHoursDivisor: z.coerce.number().positive().optional(),
  weeklyOrdinaryHours: z.coerce.number().positive().optional(),
  rnFactor: z.coerce.number().nonnegative().optional(),
  hedFactor: z.coerce.number().nonnegative().optional(),
  henFactor: z.coerce.number().nonnegative().optional(),
  rodFestFactor: z.coerce.number().nonnegative().optional(),
  hedfFactor: z.coerce.number().nonnegative().optional(),
  henfFactor: z.coerce.number().nonnegative().optional(),
  rnfFactor: z.coerce.number().nonnegative().optional(),
});

const EmpleadoBaseSchema = z.object({
  baseSalary: z.coerce.number().positive().optional(),
  hourlyRate: z.coerce.number().positive().optional(),
});

/**
 * Reporte mensual nómina / horas extras + tarifario de recargos.
 * Rutas: /nomina/* y /api/v1/nomina/* (alias).
 */
@Controller(["nomina", "api/v1/nomina"])
@UseGuards(JwtAuthGuard, ModulesGuard)
@RequireModule("logistica")
export class NominaController {
  constructor(
    private reports: NominaReportService,
    private exports: NominaExportService,
  ) {}

  @Get("tarifario")
  tarifario(@Req() req: AuthReq) {
    return this.reports.getTarifario(req.user.organizationId);
  }

  @Patch("tarifario")
  updateTarifario(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = LaborConfigSchema.parse(body ?? {});
    return this.reports.updateLaborConfig(req.user.organizationId, dto);
  }

  @Patch("tarifario/empleado/:driverId")
  updateEmpleadoBase(
    @Req() req: AuthReq,
    @Param("driverId") driverId: string,
    @Body() body: unknown,
  ) {
    const dto = EmpleadoBaseSchema.parse(body ?? {});
    return this.reports.updateEmpleadoBase(
      req.user.organizationId,
      driverId,
      dto,
    );
  }

  @Get("reporte-empleado/:empleadoId")
  reporteEmpleado(
    @Req() req: AuthReq,
    @Param("empleadoId") empleadoId: string,
    @Query("mes") mes?: string,
  ) {
    return this.reports.reporteEmpleado(
      req.user.organizationId,
      empleadoId,
      mes,
    );
  }

  @Get("reporte-general")
  reporteGeneral(@Req() req: AuthReq, @Query("mes") mes?: string) {
    return this.reports.reporteGeneral(req.user.organizationId, mes);
  }

  @Get("exportar/excel")
  async excel(
    @Req() req: AuthReq,
    @Res() res: Response,
    @Query("mes") mes?: string,
    @Query("empleadoId") empleadoId?: string,
  ) {
    const { buffer, filename } = await this.exports.buildExcel(
      req.user.organizationId,
      mes,
      empleadoId ?? "ALL",
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

  @Get("exportar/pdf")
  async pdf(
    @Req() req: AuthReq,
    @Res() res: Response,
    @Query("mes") mes?: string,
    @Query("empleadoId") empleadoId?: string,
  ) {
    const id = empleadoId && empleadoId !== "ALL" ? empleadoId : null;
    const out = id
      ? await this.exports.buildPdf(req.user.organizationId, mes, id)
      : await this.exports.buildPdfGeneral(req.user.organizationId, mes);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${out.filename}"`,
    );
    res.send(out.buffer);
  }
}
