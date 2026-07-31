import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import {
  ArchiveCategory,
  ArchiveDocType,
  ArchiveEntityType,
  ArchiveValidationStatus,
  FleetModule,
} from "@fsg/db";
import { createHash } from "crypto";
import { readFile } from "fs/promises";
import { PrismaService } from "../prisma/prisma.service";
import { KafkaEventsService } from "../logistics/kafka-events.service";
import { extractDocumentMetadata } from "./ocr-extract";

@Injectable()
export class OcrIngestionService {
  constructor(
    private prisma: PrismaService,
    private kafka: KafkaEventsService,
  ) {}

  /**
   * Procesa OCR/Document AI sobre un ArchiveDocument y emite document.processed.
   */
  async processDocument(
    organizationId: string,
    documentId: string,
    opts?: {
      rawText?: string;
      docType?: ArchiveDocType;
      actorUserId?: string;
    },
  ) {
    const doc = await this.prisma.archiveDocument.findFirst({
      where: { id: documentId, organizationId, deletedAt: null },
    });
    if (!doc) throw new NotFoundException("Documento no encontrado");

    await this.prisma.archiveDocument.update({
      where: { id: doc.id },
      data: { validationStatus: ArchiveValidationStatus.OCR_PROCESSING },
    });

    let fileHint = "";
    if (doc.fileRef) {
      try {
        const abs = doc.fileRef.replace(/^\/uploads\//, "");
        // No leemos binario como texto; usamos nombre + hint
        fileHint = abs;
      } catch {
        /* noop */
      }
    }

    const extracted = extractDocumentMetadata({
      rawText: opts?.rawText,
      title: doc.title,
      fileName: doc.originalName || fileHint,
      docTypeHint: opts?.docType || doc.docType,
    });

    const expiresAt = extracted.expiresAt
      ? new Date(extracted.expiresAt)
      : null;
    const issuedAt = extracted.issuedAt ? new Date(extracted.issuedAt) : null;

    // Resolver vehículo por placa si aplica
    let vehicleId = doc.vehicleId;
    if (!vehicleId && extracted.plate) {
      const v = await this.prisma.vehicle.findFirst({
        where: {
          organizationId,
          plate: extracted.plate.replace(/\s+/g, ""),
        },
      });
      vehicleId = v?.id ?? vehicleId;
    }

    let driverId = doc.driverId;
    if (
      !driverId &&
      extracted.docType === ArchiveDocType.LICENCIA &&
      extracted.taxIdOrDocument
    ) {
      const d = await this.prisma.driver.findFirst({
        where: {
          organizationId,
          document: extracted.taxIdOrDocument.replace(/-/g, ""),
        },
      });
      driverId = d?.id ?? driverId;
    }

    const category =
      extracted.docType === ArchiveDocType.FACTURA
        ? ArchiveCategory.INVOICE
        : extracted.docType === ArchiveDocType.CONTRACT
          ? ArchiveCategory.CONTRACT
          : extracted.docType === ArchiveDocType.FUEC
            ? ArchiveCategory.FUEC
            : ArchiveCategory.COMPLIANCE;

    const entityType =
      doc.entityType ||
      (vehicleId
        ? ArchiveEntityType.VEHICLE
        : driverId
          ? ArchiveEntityType.DRIVER
          : doc.supplierId
            ? ArchiveEntityType.SUPPLIER
            : doc.purchaseOrderId
              ? ArchiveEntityType.PURCHASE_ORDER
              : ArchiveEntityType.GENERAL);

    const updated = await this.prisma.archiveDocument.update({
      where: { id: doc.id },
      data: {
        docType: extracted.docType,
        category,
        validationStatus: ArchiveValidationStatus.VALIDATED,
        plate: extracted.plate,
        taxIdOrDocument: extracted.taxIdOrDocument,
        issuer: extracted.issuer,
        amount: extracted.amount,
        issuedAt,
        expiresAt,
        vehicleId,
        driverId,
        entityType,
        entityId:
          doc.entityId ||
          vehicleId ||
          driverId ||
          doc.supplierId ||
          doc.purchaseOrderId,
        ocrPayload: extracted as object,
        ocrProcessedAt: new Date(),
      },
    });

    await this.kafka.emitDocumentProcessed({
      organizationId,
      archiveDocumentId: updated.id,
      docType: extracted.docType,
      vehicleId: updated.vehicleId,
      driverId: updated.driverId,
      supplierId: updated.supplierId,
      purchaseOrderId: updated.purchaseOrderId,
      plate: updated.plate,
      taxIdOrDocument: updated.taxIdOrDocument,
      issuer: updated.issuer,
      amount: extracted.amount,
      issuedAt: issuedAt?.toISOString() ?? null,
      expiresAt: expiresAt?.toISOString() ?? null,
      contentHash: updated.contentHash,
      fileRef: updated.fileRef,
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId,
        action: "ARCHIVE_OCR_PROCESSED",
        entity: "ArchiveDocument",
        entityId: updated.id,
        module: FleetModule.ARCHIVO,
        userId: opts?.actorUserId,
        meta: {
          docType: extracted.docType,
          expiresAt: extracted.expiresAt,
          plate: extracted.plate,
          confidence: extracted.confidence,
        },
      },
    });

    return {
      document: updated,
      extracted,
      event: "document.processed",
    };
  }

  async hashFile(absolutePath: string): Promise<string> {
    try {
      const buf = await readFile(absolutePath);
      return createHash("sha256").update(buf).digest("hex");
    } catch {
      throw new BadRequestException(
        "Fallo de sellado criptográfico — reintentar uplink",
      );
    }
  }
}
