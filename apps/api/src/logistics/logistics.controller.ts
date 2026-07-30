import {
  Body,
  Controller,
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
import { LogisticsService } from "./logistics.service";
import { LogisticsGateway } from "./logistics.gateway";

@Controller("logistics")
@UseGuards(JwtAuthGuard, ModulesGuard)
@RequireModule("logistica")
export class LogisticsController {
  constructor(
    private service: LogisticsService,
    private gateway: LogisticsGateway,
  ) {}

  @Get("trips")
  trips(@Req() req: { user: { organizationId: string } }) {
    return this.service.listTrips(req.user.organizationId);
  }

  @Get("my-trips")
  myTrips(
    @Req() req: { user: { organizationId: string; userId: string } },
  ) {
    return this.service.myTrips(req.user.organizationId, req.user.userId);
  }

  @Get("drivers")
  drivers(
    @Req() req: { user: { organizationId: string } },
    @Query("all") all?: string,
  ) {
    return this.service.listDrivers(req.user.organizationId, all === "1");
  }

  @Post("drivers")
  createDriver(
    @Req() req: { user: { organizationId: string } },
    @Body()
    body: {
      name: string;
      document: string;
      phone?: string;
      license?: string;
      userId?: string;
    },
  ) {
    return this.service.createDriver(req.user.organizationId, body);
  }

  @Patch("drivers/:id")
  updateDriver(
    @Req() req: { user: { organizationId: string } },
    @Param("id") id: string,
    @Body()
    body: {
      name?: string;
      phone?: string;
      license?: string;
      active?: boolean;
      userId?: string | null;
    },
  ) {
    return this.service.updateDriver(req.user.organizationId, id, body);
  }

  @Get("gps")
  gps(@Req() req: { user: { organizationId: string } }) {
    return this.service.getGps(req.user.organizationId);
  }

  @Patch("gps/:vehicleId")
  async updateGps(
    @Req() req: { user: { organizationId: string } },
    @Param("vehicleId") vehicleId: string,
    @Body() body: { lat: number; lng: number },
  ) {
    const point = await this.service.updateGps(
      req.user.organizationId,
      vehicleId,
      body,
    );
    this.gateway.emitGps(req.user.organizationId);
    return point;
  }

  @Post("trips")
  async create(
    @Req() req: { user: { organizationId: string } },
    @Body()
    body: {
      origin: string;
      destination: string;
      scheduledAt: string;
      customerId?: string;
      contractId?: string;
      vehicleId?: string;
      driverId?: string;
      fareAmount?: number;
      notes?: string;
    },
  ) {
    const trip = await this.service.createTrip(req.user.organizationId, body);
    this.gateway.emitUpdate(req.user.organizationId);
    return trip;
  }

  @Patch("trips/:id/status")
  async status(
    @Req() req: { user: { organizationId: string } },
    @Param("id") id: string,
    @Body() body: { status: string },
  ) {
    const trip = await this.service.updateStatus(
      req.user.organizationId,
      id,
      body.status,
    );
    this.gateway.emitUpdate(req.user.organizationId);
    return trip;
  }

  @Patch("trips/:id/incident")
  async incident(
    @Req() req: { user: { organizationId: string } },
    @Param("id") id: string,
    @Body() body: { notes: string },
  ) {
    const trip = await this.service.reportIncident(
      req.user.organizationId,
      id,
      body.notes,
    );
    this.gateway.emitUpdate(req.user.organizationId);
    return trip;
  }

  @Post("trips/:id/invoice")
  async invoiceFromTrip(
    @Req() req: { user: { organizationId: string } },
    @Param("id") id: string,
  ) {
    return this.service.invoiceFromTrip(req.user.organizationId, id);
  }
}
