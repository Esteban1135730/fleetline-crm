import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ModulesGuard, RequireModule } from "../auth/modules.guard";
import { CustomersService } from "./customers.service";
import { QuotePdfService } from "../comercial/quote-pdf.service";

@Controller("comercial")
@UseGuards(JwtAuthGuard, ModulesGuard)
@RequireModule("comercial", "logistica", "finanzas")
export class CustomersController {
  constructor(
    private service: CustomersService,
    private readonly quotesPdf: QuotePdfService,
  ) {}

  @Get("customers")
  list(@Req() req: { user: { organizationId: string } }) {
    return this.service.listCustomers(req.user.organizationId);
  }

  @Post("customers")
  create(
    @Req()
    req: { user: { organizationId: string; userId: string; role: string } },
    @Body()
    body: {
      name: string;
      nit: string;
      email?: string;
      phone?: string;
      segment?: "B2B" | "ESCOLAR" | "TURISMO";
      contactName?: string;
      creditKind?: string;
      serviceFrequency?: string;
      servicesPerMonth?: string;
      preferredVehicle?: string;
      logisticsOwner?: string;
      commercialNote?: string;
      branch?: string;
      forceDespiteSarlaft?: boolean;
    },
  ) {
    return this.service.createCustomer(req.user.organizationId, body, {
      userId: req.user.userId,
      role: req.user.role,
    });
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
      contactName?: string;
      creditKind?: string;
      serviceFrequency?: string;
      servicesPerMonth?: string;
      preferredVehicle?: string;
      logisticsOwner?: string;
      commercialNote?: string;
      branch?: string;
    },
  ) {
    return this.service.updateCustomer(req.user.organizationId, id, body);
  }

  @Get("quotes")
  quotes(@Req() req: { user: { organizationId: string } }) {
    return this.service.listQuotes(req.user.organizationId);
  }

  @Post("quotes/calculate")
  calculateQuote(@Body() body: unknown) {
    return this.service.calculateQuote(body);
  }

  @Post("quotes")
  createQuote(
    @Req() req: { user: { organizationId: string } },
    @Body()
    body: {
      customerId: string;
      amount?: number;
      notes?: string;
      calc?: unknown;
    },
  ) {
    return this.service.createQuote(req.user.organizationId, body);
  }

  @Get("quotes/:id/pdf")
  @Header("Content-Type", "application/pdf")
  async downloadQuotePdf(
    @Req() req: { user: { organizationId: string } },
    @Param("id") id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, pdfRef } = await this.quotesPdf.generateSimpleQuotePdf(
      req.user.organizationId,
      id,
    );
    const filename = pdfRef.split("/").pop() ?? "oferta.pdf";
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    return new StreamableFile(buffer);
  }

  @Patch("quotes/:id/stage")
  moveQuoteStage(
    @Req() req: { user: { organizationId: string } },
    @Param("id") id: string,
    @Body()
    body: {
      stage: string;
      nextAction?: string;
      followUpAt?: string | null;
      lossReason?: string;
      fitScore?: number | null;
      urgencyScore?: number | null;
      budgetScore?: number | null;
      docStatus?: string;
    },
  ) {
    return this.service.moveQuoteStage(req.user.organizationId, id, body);
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
