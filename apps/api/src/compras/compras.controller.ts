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
import { ComprasService } from "./compras.service";
import {
  CreateGoodsReceiptDto,
  CreatePurchaseOrderDto,
  ProcessThreeWayDto,
} from "./dto/compras.dto";

@Controller("compras")
@UseGuards(JwtAuthGuard, ModulesGuard)
@RequireModule("compras")
export class ComprasController {
  constructor(private service: ComprasService) {}

  @Get("purchase-orders")
  list(@Req() req: { user: { organizationId: string } }) {
    return this.service.listOrders(req.user.organizationId);
  }

  @Post("purchase-orders")
  createPo(
    @Req() req: { user: { organizationId: string } },
    @Body() body: CreatePurchaseOrderDto,
  ) {
    return this.service.createPurchaseOrder(req.user.organizationId, body);
  }

  @Post("goods-receipts")
  createReceipt(
    @Req() req: { user: { organizationId: string; userId: string } },
    @Body() body: CreateGoodsReceiptDto,
  ) {
    return this.service.createGoodsReceipt(
      req.user.organizationId,
      req.user.userId,
      body,
    );
  }

  @Post("invoices/process-3way")
  process3way(
    @Req() req: { user: { organizationId: string } },
    @Body() body: ProcessThreeWayDto,
  ) {
    return this.service.processThreeWay(req.user.organizationId, body);
  }
}
