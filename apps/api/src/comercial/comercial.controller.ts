import { Body, Controller, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ModulesGuard, RequireModule } from "../auth/modules.guard";
import { CommercialContractService } from "./commercial-contract.service";
import { SecopSyncService } from "./secop-sync.service";
import { CommercialRevenueService } from "./commercial-revenue.service";
import {
  CreateContractSchema,
  SecopOpportunitiesQuerySchema,
} from "./dto/comercial.dto";

type AuthReq = { user: { organizationId: string; userId: string } };

@Controller("comercial")
@UseGuards(JwtAuthGuard, ModulesGuard)
@RequireModule("comercial")
export class ComercialController {
  constructor(
    private contracts: CommercialContractService,
    private secop: SecopSyncService,
    private revenue: CommercialRevenueService,
  ) {}

  @Get("contracts")
  listContracts(@Req() req: AuthReq) {
    return this.contracts.list(req.user.organizationId);
  }

  @Post("contracts")
  createContract(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = CreateContractSchema.parse(body ?? {});
    return this.contracts.create(req.user.organizationId, dto);
  }

  @Get("secop/opportunities")
  secopOpportunities(
    @Req() req: AuthReq,
    @Query() query: Record<string, string>,
  ) {
    const parsed = SecopOpportunitiesQuerySchema.parse(query ?? {});
    return this.secop.listOpportunities(req.user.organizationId, parsed);
  }

  @Post("revenue/price-trip")
  priceTrip(
    @Req() req: AuthReq,
    @Body() body: { tripId: string },
  ) {
    return this.revenue.priceTripById(req.user.organizationId, body.tripId);
  }
}
