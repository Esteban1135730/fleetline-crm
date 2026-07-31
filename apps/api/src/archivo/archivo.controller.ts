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
import { diskStorage } from "multer";
import { extname, join, resolve } from "path";
import { randomUUID } from "crypto";
import { existsSync, mkdirSync } from "fs";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ModulesGuard, RequireModule } from "../auth/modules.guard";
import { DataRoomService } from "./data-room.service";
import { OcrIngestionService } from "./ocr-ingestion.service";
import {
  ListDocumentsSchema,
  OcrProcessSchema,
  UploadArchiveSchema,
} from "./dto/archivo.dto";
import { ArchiveDocType } from "@fsg/db";

const UPLOADS_DIR = resolve(__dirname, "../../../../uploads");
if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });

type AuthReq = { user: { organizationId: string; userId: string } };

@Controller("archivo")
@UseGuards(JwtAuthGuard, ModulesGuard)
@RequireModule("archivo")
export class ArchivoController {
  constructor(
    private dataRoom: DataRoomService,
    private ocr: OcrIngestionService,
  ) {}

  @Post("upload")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: UPLOADS_DIR,
        filename: (_req, file, cb) => {
          const safe = extname(file.originalname).toLowerCase().slice(0, 10);
          cb(null, `${randomUUID()}${safe}`);
        },
      }),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
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
  list(@Req() req: AuthReq, @Query() query: Record<string, string>) {
    const parsed = ListDocumentsSchema.parse(query ?? {});
    return this.dataRoom.listDocuments(req.user.organizationId, parsed);
  }

  @Post("ocr/process")
  ocrProcess(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = OcrProcessSchema.parse(body ?? {});
    return this.ocr.processDocument(req.user.organizationId, dto.documentId, {
      rawText: dto.rawText,
      docType: dto.docType as ArchiveDocType | undefined,
      actorUserId: req.user.userId,
    });
  }

  @Get("data-room/:entityType/:entityId")
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
