import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ModulesGuard, RequireModule } from "../auth/modules.guard";
import { FuecService } from "./fuec.service";
import type { CreateFuecBody } from "./fuec.types";

type AuthReq = {
  user: { organizationId: string; userId: string; role?: string };
};

@Controller()
@UseGuards(JwtAuthGuard, ModulesGuard)
export class FuecController {
  constructor(private svc: FuecService) {}

  @Get("juridico/fuec")
  @RequireModule("juridico", "logistica", "tramites")
  list(@Req() req: AuthReq) {
    return this.svc.list(req.user.organizationId);
  }

  @Get("juridico/fuec/options")
  @RequireModule("juridico", "logistica", "tramites")
  options(@Req() req: AuthReq) {
    return this.svc.getFormOptions(req.user.organizationId);
  }

  @Get("juridico/fuec/vehicle-context/:vehicleId")
  @RequireModule("juridico", "logistica", "tramites")
  vehicleContext(@Req() req: AuthReq, @Param("vehicleId") vehicleId: string) {
    return this.svc.vehicleContext(req.user.organizationId, vehicleId);
  }

  @Post("juridico/fuec")
  @RequireModule("juridico", "logistica", "tramites")
  create(@Req() req: AuthReq, @Body() body: CreateFuecBody) {
    return this.svc.create(req.user.organizationId, body);
  }

  @Patch("juridico/fuec/:id")
  @RequireModule("juridico", "logistica", "tramites")
  update(
    @Req() req: AuthReq,
    @Param("id") id: string,
    @Body() body: { status?: string; route?: string; routeLabel?: string; validTo?: string },
  ) {
    return this.svc.update(req.user.organizationId, id, body);
  }

  @Get("juridico/fuec/:id/pdf")
  @RequireModule("juridico", "logistica", "tramites")
  async pdf(
    @Req() req: AuthReq,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.svc.getPdfBuffer(
      req.user.organizationId,
      id,
    );
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`,
    );
    res.send(buffer);
  }

  @Get("conductor/my-fuec")
  @RequireModule("logistica", "juridico", "operaciones")
  myFuec(@Req() req: AuthReq) {
    return this.svc.myFuec(req.user.organizationId, req.user.userId);
  }
}