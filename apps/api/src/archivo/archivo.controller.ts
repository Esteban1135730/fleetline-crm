import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { join, resolve } from "path";
import { existsSync, mkdirSync } from "fs";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ModulesGuard, RequireModule } from "../auth/modules.guard";
import { Roles, RolesGuard } from "../auth/roles.guard";
import { Permissions, PermissionsGuard } from "../auth/permissions.guard";
import { DataRoomService } from "./data-room.service";
import { OcrIngestionService } from "./ocr-ingestion.service";
import { ArchivoOpsService } from "./archivo-ops.service";
import {
  CustodiaFisicaSchema,
  DespacharSuministroSchema,
  ListDocumentsSchema,
  OcrProcessSchema,
  PrestamoCheckOutSchema,
  UploadArchiveSchema,
} from "./dto/archivo.dto";
import { ArchiveDocType } from "@fsg/db";
import { uploadMulterOptions } from "../security/upload-security";

const UPLOADS_DIR = resolve(__dirname, "../../../../uploads");
if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });

type AuthReq = {
  user: { organizationId: string; userId: string; role: string };
};

const ARCHIVO_ROLES = [
  "gestor_documental",
  "archivo",
  "GESTOR_DOCUMENTAL",
  "ARCHIVO",
  "org_admin",
  "platform_master",
  "gerente_general",
] as const;

@Controller(["archivo", "api/v1/archivo"])
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, ModulesGuard)
@RequireModule("archivo")
@Roles(...ARCHIVO_ROLES)
export class ArchivoController {
  constructor(
    private dataRoom: DataRoomService,
    private ocr: OcrIngestionService,
    private ops: ArchivoOpsService,
  ) {}

  /** POST /api/v1/archivo/custodia-fisica */
  @Post("custodia-fisica")
  @Permissions("custodia_fisica", "CREATE")
  custodiaFisica(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = CustodiaFisicaSchema.parse(body ?? {});
    return this.ops.assignCustodiaFisica(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  /** POST /api/v1/archivo/suministros/despachar */
  @Post("suministros/despachar")
  @Permissions("inventario_papeleria", "UPDATE")
  despacharSuministro(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = DespacharSuministroSchema.parse(body ?? {});
    return this.ops.despacharSuministro(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  /** POST /api/v1/archivo/prestamos/check-out */
  @Post("prestamos/check-out")
  @Permissions("custodia_fisica", "UPDATE")
  checkOutPrestamo(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = PrestamoCheckOutSchema.parse(body ?? {});
    return this.ops.checkOutPrestamo(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  @Get("search")
  @Permissions("archivo_digital", "READ")
  search(@Req() req: AuthReq, @Query("q") q?: string) {
    return this.ops.searchUniversal(req.user.organizationId, q || "");
  }

  @Get("dashboard")
  @Permissions("archivo_digital", "READ")
  dashboard(@Req() req: AuthReq) {
    return this.ops.dashboard(req.user.organizationId);
  }

  @Post("upload")
  @Permissions("archivo_digital", "CREATE")
  @UseInterceptors(
    FileInterceptor(
      "file",
      uploadMulterOptions(UPLOADS_DIR, { maxBytes: 5 * 1024 * 1024 }),
    ),
  )
  upload(
    @Req() req: AuthReq,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: Record<string, unknown>,
  ) {
    if (!file) throw new BadRequestException("Archivo requerido (campo file)");
    const dto = UploadArchiveSchema.parse(body ?? {});
    return this.dataRoom.upload(
      req.user.organizationId,
      {
        ...dto,
        storedName: file.filename,
        originalName: file.originalname,
        absolutePath: join(UPLOADS_DIR, file.filename),
        byteSize: file.size,
        mimeType: file.mimetype,
      },
      req.user.userId,
    );
  }

  @Get("documents")
  @Permissions("archivo_digital", "READ")
  list(@Req() req: AuthReq, @Query() query: Record<string, string>) {
    const parsed = ListDocumentsSchema.parse(query ?? {});
    return this.dataRoom.listDocuments(req.user.organizationId, parsed);
  }

  @Post("ocr/process")
  @Permissions("archivo_digital", "UPDATE")
  ocrProcess(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = OcrProcessSchema.parse(body ?? {});
    return this.ocr.processDocument(req.user.organizationId, dto.documentId, {
      rawText: dto.rawText,
      docType: dto.docType as ArchiveDocType | undefined,
      actorUserId: req.user.userId,
    });
  }

  @Get("data-room/:entityType/:entityId")
  @Permissions("archivo_digital", "READ")
  dataRoomEndpoint(
    @Req() req: AuthReq,
    @Param("entityType") entityType: string,
    @Param("entityId") entityId: string,
  ) {
    return this.dataRoom.dataRoom(
      req.user.organizationId,
      entityType,
      entityId,
    );
  }
}
