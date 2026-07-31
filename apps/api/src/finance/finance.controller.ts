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
import { FinanceService } from "./finance.service";

@Controller("finance")
@UseGuards(JwtAuthGuard, ModulesGuard)
@RequireModule("finanzas")
export class FinanceController {
  constructor(private service: FinanceService) {}

  @Get("summary")
  summary(@Req() req: { user: { organizationId: string } }) {
    return this.service.summary(req.user.organizationId);
  }

  @Get("invoices")
  invoices(
    @Req() req: { user: { organizationId: string } },
    @Query("type") type?: "RECEIVABLE" | "PAYABLE",
  ) {
    return this.service.listInvoices(req.user.organizationId, type);
  }

  @Post("invoices")
  create(
    @Req() req: { user: { organizationId: string } },
    @Body()
    body: {
      type: "RECEIVABLE" | "PAYABLE";
      amount: number;
      dueDate: string;
      customerId?: string;
      supplierName?: string;
      description?: string;
    },
  ) {
    return this.service.createInvoice(req.user.organizationId, body);
  }

  @Patch("invoices/:id")
  update(
    @Req() req: { user: { organizationId: string } },
    @Param("id") id: string,
    @Body()
    body: {
      dueDate?: string;
      description?: string;
      amount?: number;
      status?: string;
    },
  ) {
    return this.service.updateInvoice(req.user.organizationId, id, body);
  }

  @Patch("invoices/:id/approve-payment")
  approvePayment(
    @Req() req: { user: { organizationId: string; userId: string } },
    @Param("id") id: string,
  ) {
    return this.service.approvePayment(
      req.user.organizationId,
      id,
      req.user.userId,
    );
  }

  @Patch("invoices/:id/pay")
  pay(
    @Req()
    req: { user: { organizationId: string; userId: string; role: string } },
    @Param("id") id: string,
    @Body() body?: { forceDespiteSarlaft?: boolean },
  ) {
    return this.service.markPaid(req.user.organizationId, id, {
      forceDespiteSarlaft: body?.forceDespiteSarlaft,
      actorUserId: req.user.userId,
      actorRole: req.user.role,
    });
  }

  @Patch("invoices/:id/cancel")
  cancel(
    @Req() req: { user: { organizationId: string } },
    @Param("id") id: string,
  ) {
    return this.service.cancelInvoice(req.user.organizationId, id);
  }
}
