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
import { CustomersService } from "./customers.service";

@Controller("comercial")
@UseGuards(JwtAuthGuard, ModulesGuard)
@RequireModule("comercial", "logistica", "finanzas")
export class CustomersController {
  constructor(private service: CustomersService) {}

  @Get("customers")
  list(@Req() req: { user: { organizationId: string } }) {
    return this.service.listCustomers(req.user.organizationId);
  }

  @Post("customers")
  create(
    @Req() req: { user: { organizationId: string } },
    @Body()
    body: {
      name: string;
      nit: string;
      email?: string;
      phone?: string;
      segment?: "B2B" | "ESCOLAR" | "TURISMO";
    },
  ) {
    return this.service.createCustomer(req.user.organizationId, body);
  }

  @Patch("customers/:id")
  updateCustomer(
    @Req() req: { user: { organizationId: string } },
    @Param("id") id: string,
    @Body()
    body: {
      name?: string;
      email?: string;
      phone?: string;
      segment?: "B2B" | "ESCOLAR" | "TURISMO";
    },
  ) {
    return this.service.updateCustomer(req.user.organizationId, id, body);
  }

  @Get("quotes")
  quotes(@Req() req: { user: { organizationId: string } }) {
    return this.service.listQuotes(req.user.organizationId);
  }

  @Post("quotes")
  createQuote(
    @Req() req: { user: { organizationId: string } },
    @Body()
    body: { customerId: string; amount: number; notes?: string },
  ) {
    return this.service.createQuote(req.user.organizationId, body);
  }

  @Patch("quotes/:id/status")
  quoteStatus(
    @Req() req: { user: { organizationId: string } },
    @Param("id") id: string,
    @Body() body: { status: string },
  ) {
    return this.service.updateQuoteStatus(
      req.user.organizationId,
      id,
      body.status,
    );
  }

  @Post("quotes/:id/to-contract")
  quoteToContract(
    @Req() req: { user: { organizationId: string } },
    @Param("id") id: string,
    @Body()
    body: {
      name?: string;
      route?: string;
      startDate?: string;
      endDate?: string;
    },
  ) {
    return this.service.quoteToContract(req.user.organizationId, id, body);
  }

  @Get("contracts")
  contracts(@Req() req: { user: { organizationId: string } }) {
    return this.service.listContracts(req.user.organizationId);
  }

  @Post("contracts")
  createContract(
    @Req() req: { user: { organizationId: string } },
    @Body()
    body: {
      name: string;
      customerId: string;
      channel?: "PRIVATE" | "PUBLIC_TENDER";
      route?: string;
      startDate: string;
      endDate: string;
      monthlyValue?: number;
    },
  ) {
    return this.service.createContract(req.user.organizationId, body);
  }

  @Patch("contracts/:id")
  updateContract(
    @Req() req: { user: { organizationId: string } },
    @Param("id") id: string,
    @Body()
    body: {
      name?: string;
      route?: string;
      status?: string;
      monthlyValue?: number;
      endDate?: string;
    },
  ) {
    return this.service.updateContract(req.user.organizationId, id, body);
  }
}
