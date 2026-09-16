import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { resolve } from "path";
import type { Response } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ModulesGuard, RequireModule } from "../auth/modules.guard";
import { FinanceService } from "./finance.service";
import { uploadMulterOptions } from "../security/upload-security";
import { streamStoredUpload } from "../security/stream-stored-upload";

const UPLOADS_DIR = resolve(__dirname, "../../../../uploads");

@Controller("finance")
@UseGuards(JwtAuthGuard, ModulesGuard)
@RequireModule("tesoreria", "finanzas")
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

  @Post("invoices/:id/support")
  @UseInterceptors(
    FileInterceptor(
      "file",
      uploadMulterOptions(UPLOADS_DIR, { maxBytes: 5 * 1024 * 1024 }),
    ),
  )
  uploadSupport(
    @Req() req: { user: { organizationId: string } },
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException("Adjunte el comprobante (PDF o imagen)");
    }
    return this.service.attachInvoiceSupport(req.user.organizationId, id, {
      storedName: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
    });
  }

  @Get("invoices/:id/support")
  async streamSupport(
    @Req() req: { user: { organizationId: string } },
    @Param("id") id: string,
    @Query("download") download: string | undefined,
    @Res() res: Response,
  ) {
    const meta = await this.service.getInvoiceSupportMeta(
      req.user.organizationId,
      id,
    );
    if (!meta.supportFileRef) {
      throw new BadRequestException("Esta factura no tiene comprobante adjunto");
    }
    streamStoredUpload(res, {
      fileRef: meta.supportFileRef,
      mimeType: meta.supportMimeType,
      originalName: meta.supportOriginalName,
      asAttachment: download === "1" || download === "true",
    });
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
    @Body() body?: { pin?: string },
  ) {
    return this.service.approvePayment(
      req.user.organizationId,
      id,
      req.user.userId,
      body?.pin,
    );
  }

  @Patch("invoices/:id/pay")
  pay(
    @Req()
    req: { user: { organizationId: string; userId: string; role: string } },
    @Param("id") id: string,
    @Body()
    body?: {
      forceDespiteSarlaft?: boolean;
      pin?: string;
      bankRef?: string;
      evidenceRef?: string;
      receivedByName?: string;
      confirmCollection?: boolean;
    },
  ) {
    return this.service.markPaid(req.user.organizationId, id, {
      forceDespiteSarlaft: body?.forceDespiteSarlaft,
      actorUserId: req.user.userId,
      actorRole: req.user.role,
      pin: body?.pin,
      evidenceRef: body?.evidenceRef,
      receivedByName: body?.receivedByName,
      confirmCollection: body?.confirmCollection,
      bankRef: body?.bankRef,
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
