import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ModulesGuard, RequireModule } from "../auth/modules.guard";
import { FleetService } from "./fleet.service";

@Controller("fleet")
@UseGuards(JwtAuthGuard, ModulesGuard)
@RequireModule("taller", "logistica", "tramites")
export class FleetController {
  constructor(private service: FleetService) {}

  @Get("vehicles")
  vehicles(@Req() req: { user: { organizationId: string } }) {
    return this.service.listVehicles(req.user.organizationId);
  }

  @Post("vehicles")
  createVehicle(
    @Req() req: { user: { organizationId: string } },
    @Body()
    body: {
      plate: string;
      brand: string;
      model: string;
      year: number;
      capacity?: number;
      lat?: number;
      lng?: number;
    },
  ) {
    return this.service.createVehicle(req.user.organizationId, body);
  }

  @Patch("vehicles/:id")
  updateVehicle(
    @Req() req: { user: { organizationId: string } },
    @Param("id") id: string,
    @Body()
    body: {
      brand?: string;
      model?: string;
      year?: number;
      capacity?: number;
      status?: string;
      lat?: number;
      lng?: number;
    },
  ) {
    return this.service.updateVehicle(req.user.organizationId, id, body);
  }

  @Get("work-orders")
  workOrders(@Req() req: { user: { organizationId: string } }) {
    return this.service.listWorkOrders(req.user.organizationId);
  }

  @Post("work-orders")
  createWo(
    @Req() req: { user: { organizationId: string } },
    @Body() body: { vehicleId: string; description: string; cost?: number },
  ) {
    return this.service.createWorkOrder(req.user.organizationId, body);
  }

  @Patch("work-orders/:id")
  updateWo(
    @Req() req: { user: { organizationId: string } },
    @Param("id") id: string,
    @Body() body: { status?: string; description?: string; cost?: number },
  ) {
    return this.service.updateWorkOrder(req.user.organizationId, id, body);
  }
}
