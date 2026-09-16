import { Body, Controller, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ModulesGuard, RequireModule } from "../auth/modules.guard";
import { Roles, RolesGuard } from "../auth/roles.guard";
import { Permissions, PermissionsGuard } from "../auth/permissions.guard";
import { CommercialContractService } from "./commercial-contract.service";
import { SecopSyncService } from "./secop-sync.service";
import { CommercialRevenueService } from "./commercial-revenue.service";
import {
  CreateContractSchema,
  SecopOpportunitiesQuerySchema,
} from "./dto/comercial.dto";
import { pageMeta, parsePagination } from "../security/pagination";

type AuthReq = { user: { organizationId: string; userId: string } };

@Controller(["comercial", "api/v1/comercial"])
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, ModulesGuard)
@RequireModule("comercial")
@Roles(
  "gestor_comercial",
  "coordinador_comercial",
  "director_comercial",
  "gerente_general",
  "org_admin",
  "platform_master",
  "director_operativo",
  "comercial",
)
export class ComercialController {
  constructor(
    private contracts: CommercialContractService,
    private secop: SecopSyncService,
    private revenue: CommercialRevenueService,
  ) {}

  @Get("contracts")
  @Permissions("contratos", "READ")
  async listContracts(
    @Req() req: AuthReq,
    @Query() query: Record<string, string>,
  ) {
    const hasPaging = ["page", "limit", "skip", "take"].some(
      (k) => query[k] != null && String(query[k]).trim() !== "",
    );
    const page = hasPaging
      ? parsePagination(query, { defaultTake: 10, maxTake: 100 })
      : null;
    const { items, total, summary } = await this.contracts.list(
      req.user.organizationId,
      page,
    );
    return {
      items,
      meta: page
        ? pageMeta(total, page)
        : {
            total,
            page: 1,
            take: total || 10,
            pages: 1,
          },
      summary,
    };
  }

  @Post("contracts")
  @Permissions("contratos", "CREATE")
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
