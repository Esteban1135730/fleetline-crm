import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ModulesGuard, RequireModule } from "../auth/modules.guard";
import { Roles, RolesGuard } from "../auth/roles.guard";
import { Permissions, PermissionsGuard } from "../auth/permissions.guard";
import { ComprasService } from "./compras.service";
import { SmartProcurementService } from "./smart-procurement.service";
import {
  CreateGoodsReceiptDto,
  CreatePurchaseOrderDto,
  ProcessThreeWayDto,
} from "./dto/compras.dto";
import {
  EmitirOrdenSchema,
  EntradaAlmacenSchema,
  SmartBiddingSchema,
} from "./dto/smart-procurement.dto";

type AuthReq = {
  user: { organizationId: string; userId: string; role: string };
};

const COMPRAS_ROLES = [
  "lider_compras",
  "LIDER_COMPRAS",
  "compras",
  "COMPRAS",
  "org_admin",
  "platform_master",
  "superadmin",
  "gerente_general",
  "director_financiero",
] as const;

/**
 * Módulo 8 — Compras & Smart Procurement (Líder Compras · Javier).
 * Prefijos: /compras · /api/v1/compras
 */
@Controller(["compras", "api/v1/compras"])
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, ModulesGuard)
@RequireModule("compras")
@Roles(...COMPRAS_ROLES)
export class ComprasController {
  constructor(
    private service: ComprasService,
    private smart: SmartProcurementService,
  ) {}

  @Get("dashboard")
  @Permissions("compras_oc", "READ")
  dashboard(@Req() req: AuthReq) {
    return this.smart.dashboard(req.user.organizationId);
  }

  @Get("purchase-orders")
  @Permissions("compras_oc", "READ")
  list(@Req() req: AuthReq) {
    return this.service.listOrders(req.user.organizationId);
  }

  @Post("purchase-orders")
  @Permissions("compras_oc", "CREATE")
  createPo(@Req() req: AuthReq, @Body() body: CreatePurchaseOrderDto) {
    return this.service.createPurchaseOrder(req.user.organizationId, body);
  }

  /** POST /api/v1/compras/requisiciones/smart-bidding */
  @Post("requisiciones/smart-bidding")
  @Permissions("compras_oc", "CREATE")
  smartBidding(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = SmartBiddingSchema.parse(body ?? {});
    return this.smart.smartBidding(req.user.organizationId, dto);
  }

  /** POST /api/v1/compras/ordenes/emitir */
  @Post("ordenes/emitir")
  @Permissions("compras_oc", "CREATE")
  emitir(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = EmitirOrdenSchema.parse(body ?? {});
    return this.smart.emitirOrden(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  /** POST /api/v1/compras/almacen/entrada */
  @Post("almacen/entrada")
  @Permissions("compras_oc", "CREATE")
  entrada(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = EntradaAlmacenSchema.parse(body ?? {});
    return this.smart.entradaAlmacen(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  @Post("goods-receipts")
  @Permissions("compras_oc", "CREATE")
  createReceipt(@Req() req: AuthReq, @Body() body: CreateGoodsReceiptDto) {
    return this.service.createGoodsReceipt(
      req.user.organizationId,
      req.user.userId,
      body,
    );
  }

  @Post("invoices/process-3way")
  @Permissions("compras_oc", "UPDATE")
  process3way(@Req() req: AuthReq, @Body() body: ProcessThreeWayDto) {
    return this.service.processThreeWay(req.user.organizationId, body);
  }
}
