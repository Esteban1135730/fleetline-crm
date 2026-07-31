import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ModulesGuard, RequireModule } from "../auth/modules.guard";
import { TallerService } from "./work-order.service";
import { PartDispatchService } from "./part-dispatch.service";
import { TelemetryIngestService } from "./telemetry-ingest.service";
import {
  CloseWorkOrderDto,
  CreateWorkOrderDto,
  DispatchPartDto,
  TelemetryIngestDto,
} from "./dto/taller.dto";

@Controller("taller")
@UseGuards(JwtAuthGuard, ModulesGuard)
@RequireModule("taller")
export class TallerController {
  constructor(
    private taller: TallerService,
    private parts: PartDispatchService,
    private telemetry: TelemetryIngestService,
  ) {}

  @Get("vehicles")
  vehicles(@Req() req: { user: { organizationId: string } }) {
    return this.taller.listVehicles(req.user.organizationId);
  }

  @Get("work-orders")
  listWo(@Req() req: { user: { organizationId: string } }) {
    return this.taller.listWorkOrders(req.user.organizationId);
  }

  @Post("work-orders")
  createWo(
    @Req() req: { user: { organizationId: string } },
    @Body() body: CreateWorkOrderDto,
  ) {
    return this.taller.createWorkOrder(req.user.organizationId, body);
  }

  @Post("work-orders/:id/close")
  closeWo(
    @Req() req: { user: { organizationId: string } },
    @Param("id") id: string,
    @Body() body: CloseWorkOrderDto,
  ) {
    return this.taller.closeWorkOrder(req.user.organizationId, id, body);
  }

  @Post("work-orders/:id/dispatch-part")
  dispatchPart(
    @Req() req: { user: { organizationId: string; userId: string } },
    @Param("id") id: string,
    @Body() body: DispatchPartDto,
  ) {
    return this.parts.dispatchPart(
      req.user.organizationId,
      req.user.userId,
      id,
      body,
    );
  }

  @Post("telemetry/ingest")
  ingestTelemetry(
    @Req() req: { user: { organizationId: string } },
    @Body() body: TelemetryIngestDto,
  ) {
    return this.telemetry.ingest(req.user.organizationId, body);
  }
}
