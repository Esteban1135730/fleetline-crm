import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname, join, resolve } from "path";
import { randomUUID } from "crypto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ModulesGuard, RequireModule } from "../auth/modules.guard";
import { ModulesService } from "./modules.service";
import { ComplianceService } from "../logistics/compliance.service";

const UPLOADS_DIR = resolve(__dirname, "../../../../uploads");

@Controller()
@UseGuards(JwtAuthGuard, ModulesGuard)
export class ModulesController {
  constructor(
    private svc: ModulesService,
    private compliance: ComplianceService,
  ) {}

  // RRHH routes live in RrhhController (@Controller("rrhh"))

  // Atención
  @Get("atencion/tickets")
  @RequireModule("call_center", "atencion")
  tickets(@Req() req: { user: { organizationId: string } }) {
    return this.svc.listTickets(req.user.organizationId);
  }

  @Post("atencion/tickets")
  @RequireModule("call_center", "atencion")
  createTicket(
    @Req() req: { user: { organizationId: string } },
    @Body()
    body: {
      subject: string;
      requester: string;
      message: string;
      channel?: string;
      priority?: string;
    },
  ) {
    return this.svc.createTicket(req.user.organizationId, body);
  }

  @Patch("atencion/tickets/:id/status")
  @RequireModule("call_center", "atencion")
  ticketStatus(
    @Req() req: { user: { organizationId: string } },
    @Param("id") id: string,
    @Body() body: { status: string },
  ) {
    return this.svc.updateTicketStatus(
      req.user.organizationId,
      id,
      body.status,
    );
  }

  // Calidad
  @Get("calidad/events")
  @RequireModule("qhse", "calidad")
  quality(@Req() req: { user: { organizationId: string } }) {
    return this.svc.listQuality(req.user.organizationId);
  }

  @Get("calidad/summary")
  @RequireModule("qhse", "calidad")
  qualitySummary(@Req() req: { user: { organizationId: string } }) {
    return this.svc.qualitySummary(req.user.organizationId);
  }

  @Post("calidad/events")
  @RequireModule("qhse", "calidad")
  createQuality(
    @Req() req: { user: { organizationId: string } },
    @Body()
    body: {
      type: string;
      title: string;
      description?: string;
      score?: number;
    },
  ) {
    return this.svc.createQuality(req.user.organizationId, body);
  }

  // Jurídico
  @Get("juridico/fuec")
  @RequireModule("juridico")
  fuec(@Req() req: { user: { organizationId: string } }) {
    return this.svc.listFuec(req.user.organizationId);
  }

  @Post("juridico/fuec")
  @RequireModule("juridico")
  createFuec(
    @Req() req: { user: { organizationId: string } },
    @Body()
    body: {
      number: string;
      contractor: string;
      route: string;
      validFrom: string;
      validTo: string;
      vehicleId?: string;
    },
  ) {
    return this.svc.createFuec(req.user.organizationId, body);
  }

  // SARLAFT
  @Get("sarlaft/checks")
  @RequireModule("sarlaft")
  sarlaft(@Req() req: { user: { organizationId: string } }) {
    return this.svc.listSarlaft(req.user.organizationId);
  }

  @Post("sarlaft/checks")
  @RequireModule("sarlaft")
  createSarlaft(
    @Req() req: { user: { organizationId: string } },
    @Body()
    body: {
      subjectName: string;
      subjectDoc: string;
      risk?: string;
      notes?: string;
      customerId?: string;
    },
  ) {
    return this.svc.createSarlaft(req.user.organizationId, body);
  }

  /** Expediente de evidencias (policía, procuraduría, registraduría, antecedentes). */
  @Get("sarlaft/checks/:id/evidence")
  @RequireModule("sarlaft")
  listSarlaftEvidence(
    @Req() req: { user: { organizationId: string } },
    @Param("id") id: string,
  ) {
    return this.svc.listSarlaftEvidence(req.user.organizationId, id);
  }

  @Post("sarlaft/checks/:id/evidence")
  @RequireModule("sarlaft")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: UPLOADS_DIR,
        filename: (_req, file, cb) => {
          const safe = extname(file.originalname).toLowerCase().slice(0, 10);
          cb(null, `${randomUUID()}${safe}`);
        },
      }),
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  uploadSarlaftEvidence(
    @Req() req: { user: { organizationId: string; userId: string } },
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { source?: string; title?: string },
  ) {
    if (!file) {
      throw new BadRequestException("Adjunte el PDF o imagen de la consulta");
    }
    return this.svc.createSarlaftEvidence(
      req.user.organizationId,
      id,
      {
        source: body.source || "OTHER",
        title: body.title || file.originalname,
        storedName: file.filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        absolutePath: join(UPLOADS_DIR, file.filename),
        byteSize: file.size,
      },
      req.user.userId,
    );
  }

  // Archivo
  @Get("archivo/documents")
  @RequireModule("archivo")
  archive(
    @Req() req: { user: { organizationId: string } },
    @Query("category") category?: string,
    @Query("q") q?: string,
  ) {
    return this.svc.listArchive(req.user.organizationId, { category, q });
  }

  @Get("archivo/audit")
  @RequireModule("archivo")
  archiveAudit(
    @Req() req: { user: { organizationId: string } },
    @Query("take") take?: string,
  ) {
    return this.svc.listArchiveAudit(
      req.user.organizationId,
      take ? Number(take) : 50,
    );
  }

  @Post("archivo/documents")
  @RequireModule("archivo")
  createArchive(
    @Req() req: { user: { organizationId: string; userId: string } },
    @Body()
    body: {
      title: string;
      category?: string;
      fileRef?: string;
      tags?: string;
    },
  ) {
    return this.svc.createArchive(
      req.user.organizationId,
      body,
      req.user.userId,
    );
  }

  @Post("archivo/upload")
  @RequireModule("archivo")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: UPLOADS_DIR,
        filename: (_req, file, cb) => {
          const safe = extname(file.originalname).toLowerCase().slice(0, 10);
          cb(null, `${randomUUID()}${safe}`);
        },
      }),
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  uploadArchive(
    @Req() req: { user: { organizationId: string; userId: string } },
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { title?: string; category?: string; tags?: string },
  ) {
    return this.svc.createArchiveWithFile(
      req.user.organizationId,
      {
        title: body.title || file.originalname,
        category: body.category,
        tags: body.tags,
        storedName: file.filename,
        originalName: file.originalname,
        absolutePath: join(UPLOADS_DIR, file.filename),
        byteSize: file.size,
      },
      req.user.userId,
    );
  }

  // Recepción
  @Get("recepcion/visitors")
  @RequireModule("call_center", "recepcion")
  visitors(@Req() req: { user: { organizationId: string } }) {
    return this.svc.listVisitors(req.user.organizationId);
  }

  @Post("recepcion/visitors")
  @RequireModule("call_center", "recepcion")
  createVisitor(
    @Req() req: { user: { organizationId: string } },
    @Body()
    body: {
      name: string;
      document: string;
      purpose: string;
      hostName: string;
      company?: string;
    },
  ) {
    return this.svc.createVisitor(req.user.organizationId, body);
  }

  @Patch("recepcion/visitors/:id/checkout")
  @RequireModule("call_center", "recepcion")
  checkout(
    @Req() req: { user: { organizationId: string } },
    @Param("id") id: string,
  ) {
    return this.svc.checkoutVisitor(req.user.organizationId, id);
  }

  // Sistemas
  @Get("sistemas/alerts")
  @RequireModule("tecnologia_ti", "sistemas")
  alerts(@Req() req: { user: { organizationId: string } }) {
    return this.svc.listAlerts(req.user.organizationId);
  }

  @Get("sistemas/health")
  @RequireModule("tecnologia_ti", "sistemas")
  health(@Req() req: { user: { organizationId: string } }) {
    return this.svc.systemsHealth(req.user.organizationId);
  }

  @Patch("sistemas/alerts/:id/resolve")
  @RequireModule("tecnologia_ti", "sistemas")
  resolveAlert(
    @Req() req: { user: { organizationId: string } },
    @Param("id") id: string,
  ) {
    return this.svc.resolveAlert(req.user.organizationId, id);
  }

  // Revisoría
  @Get("revisoria/findings")
  @RequireModule("revisoria_fiscal", "revisoria")
  forensic(@Req() req: { user: { organizationId: string } }) {
    return this.svc.listForensic(req.user.organizationId);
  }

  @Post("revisoria/findings")
  @RequireModule("revisoria_fiscal", "revisoria")
  createForensic(
    @Req() req: { user: { organizationId: string } },
    @Body()
    body: {
      title: string;
      detail: string;
      severity?: string;
      amount?: number;
    },
  ) {
    return this.svc.createForensic(req.user.organizationId, body);
  }

  // Apps
  @Get("apps/overview")
  @RequireModule("apps")
  apps(@Req() req: { user: { organizationId: string } }) {
    return this.svc.appsOverview(req.user.organizationId);
  }

  // Compras
  @Get("compras/orders")
  @RequireModule("compras")
  purchases(@Req() req: { user: { organizationId: string } }) {
    return this.svc.listPurchases(req.user.organizationId);
  }

  @Post("compras/orders")
  @RequireModule("compras")
  createPurchase(
    @Req() req: { user: { organizationId: string } },
    @Body()
    body: {
      description: string;
      supplier: string;
      amount: number;
      category?: string;
      requestedBy?: string;
      quantity?: number;
    },
  ) {
    return this.svc.createPurchase(req.user.organizationId, body);
  }

  @Patch("compras/orders/:id/status")
  @RequireModule("compras")
  purchaseStatus(
    @Req() req: { user: { organizationId: string } },
    @Param("id") id: string,
    @Body() body: { status: string },
  ) {
    return this.svc.updatePurchaseStatus(
      req.user.organizationId,
      id,
      body.status,
    );
  }

  // Trámites
  @Get("tramites/fleet-matrix")
  @RequireModule("tramites")
  fleetMatrix(@Req() req: { user: { organizationId: string } }) {
    return this.compliance.fleetMatrix(req.user.organizationId);
  }

  @Get("tramites/procedures")
  @RequireModule("tramites")
  procedures(@Req() req: { user: { organizationId: string } }) {
    return this.svc.listProcedures(req.user.organizationId);
  }

  @Post("tramites/procedures")
  @RequireModule("tramites")
  createProcedure(
    @Req() req: { user: { organizationId: string } },
    @Body()
    body: {
      vehicleId: string;
      type: string;
      reference?: string;
      validFrom?: string;
      validTo: string;
      notes?: string;
    },
  ) {
    return this.svc.createProcedure(req.user.organizationId, body);
  }

  // Parqueadero
  @Get("parqueadero/logs")
  @RequireModule("parqueadero")
  parking(@Req() req: { user: { organizationId: string } }) {
    return this.svc.listParking(req.user.organizationId);
  }

  @Get("parqueadero/summary")
  @RequireModule("parqueadero")
  parkingSummary(@Req() req: { user: { organizationId: string } }) {
    return this.svc.parkingSummary(req.user.organizationId);
  }

  @Post("parqueadero/checkin")
  @RequireModule("parqueadero")
  parkingCheckIn(
    @Req() req: { user: { organizationId: string } },
    @Body()
    body: {
      plate: string;
      driverName?: string;
      guardName: string;
      vehicleId?: string;
    },
  ) {
    return this.svc.checkInParking(req.user.organizationId, body);
  }

  @Patch("parqueadero/checkout/:id")
  @RequireModule("parqueadero")
  parkingCheckOut(
    @Req() req: { user: { organizationId: string } },
    @Param("id") id: string,
  ) {
    return this.svc.checkOutParking(req.user.organizationId, id);
  }

  // parking routes above — RRHH PATCH moved to RrhhController

  @Patch("atencion/tickets/:id")
  @RequireModule("call_center", "atencion")
  updateTicket(
    @Req() req: { user: { organizationId: string } },
    @Param("id") id: string,
    @Body()
    body: { priority?: string; status?: string; assigneeId?: string | null },
  ) {
    return this.svc.updateTicket(req.user.organizationId, id, body);
  }

  @Patch("calidad/events/:id")
  @RequireModule("qhse", "calidad")
  updateQuality(
    @Req() req: { user: { organizationId: string } },
    @Param("id") id: string,
    @Body()
    body: {
      status?: string;
      title?: string;
      score?: number;
      description?: string;
    },
  ) {
    return this.svc.updateQuality(req.user.organizationId, id, body);
  }

  @Patch("juridico/fuec/:id")
  @RequireModule("juridico")
  updateFuec(
    @Req() req: { user: { organizationId: string } },
    @Param("id") id: string,
    @Body() body: { status?: string; route?: string; validTo?: string },
  ) {
    return this.svc.updateFuec(req.user.organizationId, id, body);
  }

  @Patch("sarlaft/checks/:id")
  @RequireModule("sarlaft")
  updateSarlaft(
    @Req() req: { user: { organizationId: string } },
    @Param("id") id: string,
    @Body() body: { risk?: string; notes?: string; customerId?: string },
  ) {
    return this.svc.updateSarlaft(req.user.organizationId, id, body);
  }

  @Patch("archivo/documents/:id")
  @RequireModule("archivo")
  updateArchive(
    @Req() req: { user: { organizationId: string } },
    @Param("id") id: string,
    @Body() body: { title?: string; category?: string; tags?: string },
  ) {
    return this.svc.updateArchive(req.user.organizationId, id, body);
  }

  @Post("archivo/documents/:id/delete")
  @RequireModule("archivo")
  deleteArchive(
    @Req() req: { user: { organizationId: string; userId: string } },
    @Param("id") id: string,
  ) {
    return this.svc.deleteArchive(
      req.user.organizationId,
      id,
      req.user.userId,
    );
  }

  @Patch("compras/orders/:id")
  @RequireModule("compras")
  updatePurchase(
    @Req() req: { user: { organizationId: string } },
    @Param("id") id: string,
    @Body()
    body: {
      description?: string;
      supplier?: string;
      amount?: number;
      status?: string;
    },
  ) {
    return this.svc.updatePurchase(req.user.organizationId, id, body);
  }

  @Patch("tramites/procedures/:id")
  @RequireModule("tramites")
  updateProcedure(
    @Req() req: { user: { organizationId: string } },
    @Param("id") id: string,
    @Body()
    body: {
      validTo?: string;
      reference?: string;
      status?: string;
      notes?: string;
    },
  ) {
    return this.svc.updateProcedure(req.user.organizationId, id, body);
  }

  @Patch("revisoria/findings/:id")
  @RequireModule("revisoria_fiscal", "revisoria")
  updateForensic(
    @Req() req: { user: { organizationId: string } },
    @Param("id") id: string,
    @Body() body: { status?: string; detail?: string; severity?: string },
  ) {
    return this.svc.updateForensic(req.user.organizationId, id, body);
  }

  @Post("sistemas/alerts")
  @RequireModule("tecnologia_ti", "sistemas")
  createAlert(
    @Req() req: { user: { organizationId: string } },
    @Body() body: { severity?: string; source: string; message: string },
  ) {
    return this.svc.createAlert(req.user.organizationId, body);
  }

  @Patch("recepcion/visitors/:id")
  @RequireModule("call_center", "recepcion")
  updateVisitor(
    @Req() req: { user: { organizationId: string } },
    @Param("id") id: string,
    @Body() body: { purpose?: string; hostName?: string; company?: string },
  ) {
    return this.svc.updateVisitor(req.user.organizationId, id, body);
  }
}
