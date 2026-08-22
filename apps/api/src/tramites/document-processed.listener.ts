import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import {
  ComplianceDocType,
  DocStatus,
} from "@fsg/db";
import { docStatusFromExpiryDate } from "@fsg/shared";
import { PrismaService } from "../prisma/prisma.service";
import { RuntSyncService } from "./runt-sync.service";

type DocumentProcessedPayload = {
  organizationId: string;
  archiveDocumentId: string;
  docType: string;
  vehicleId?: string | null;
  driverId?: string | null;
  plate?: string | null;
  taxIdOrDocument?: string | null;
  issuer?: string | null;
  issuedAt?: string | null;
  expiresAt?: string | null;
  contentHash?: string | null;
  fileRef?: string | null;
};

/**
 * Consume document.processed (Archivo OCR) → actualiza ComplianceDocument.
 */
@Injectable()
export class DocumentProcessedListener {
  private readonly logger = new Logger(DocumentProcessedListener.name);

  constructor(
    private prisma: PrismaService,
    private runtSync: RuntSyncService,
  ) {}

  @OnEvent("document.processed")
  async onDocumentProcessed(payload: DocumentProcessedPayload) {
    const type = this.mapDocType(payload.docType);
    if (!type) {
      this.logger.log(
        `[DOC] document.processed ignorado para tipo ${payload.docType}`,
      );
      return null;
    }

    if (!payload.vehicleId && !payload.driverId) {
      this.logger.warn(
        `[DOC] Sin vehicleId/driverId — archive=${payload.archiveDocumentId}`,
      );
      return null;
    }

    const expiresAt = payload.expiresAt ? new Date(payload.expiresAt) : null;
    const issuedAt = payload.issuedAt ? new Date(payload.issuedAt) : null;
    const status = this.statusFromExpiry(expiresAt);

    const existing = await this.prisma.complianceDocument.findFirst({
      where: {
        organizationId: payload.organizationId,
        type,
        ...(payload.vehicleId
          ? { vehicleId: payload.vehicleId }
          : { driverId: payload.driverId! }),
      },
      orderBy: { updatedAt: "desc" },
    });

    const data = {
      status,
      reference: payload.issuer || payload.archiveDocumentId,
      issuedAt,
      expiresAt,
      contentHash: payload.contentHash,
      fileRef: payload.fileRef,
      ocrPayload: {
        source: "document.processed",
        archiveDocumentId: payload.archiveDocumentId,
        plate: payload.plate,
        taxIdOrDocument: payload.taxIdOrDocument,
      },
    };

    let doc;
    if (existing) {
      doc = await this.prisma.complianceDocument.update({
        where: { id: existing.id },
        data,
      });
    } else {
      doc = await this.prisma.complianceDocument.create({
        data: {
          organizationId: payload.organizationId,
          type,
          vehicleId: payload.vehicleId || undefined,
          driverId: payload.driverId || undefined,
          ...data,
        },
      });
    }

    if (payload.vehicleId) {
      await this.runtSync.applyVehicleKillSwitch(payload.vehicleId, "manual");
    }

    if (
      payload.driverId &&
      type === ComplianceDocType.LICENCIA_CONDUCCION &&
      expiresAt
    ) {
      await this.prisma.driver.update({
        where: { id: payload.driverId },
        data: {
          licenseExpiresAt: expiresAt,
          ...(status === DocStatus.EXPIRED
            ? {
                dispatchBlocked: true,
                blockReason: "LICENSE_EXPIRED",
              }
            : {}),
        },
      });
    }

    this.logger.log(
      `[DOC] Compliance ${type} upserted ${doc.id} status=${status}`,
    );
    return doc;
  }

  private mapDocType(docType: string): ComplianceDocType | null {
    switch (String(docType).toUpperCase()) {
      case "SOAT":
        return ComplianceDocType.SOAT;
      case "TECNOMECANICA":
        return ComplianceDocType.TECNOMECANICA;
      case "LICENCIA":
        return ComplianceDocType.LICENCIA_CONDUCCION;
      case "FUEC":
        return ComplianceDocType.FUEC;
      default:
        return null;
    }
  }

  private statusFromExpiry(expiresAt: Date | null): DocStatus {
    return docStatusFromExpiryDate(expiresAt) as DocStatus;
  }
}
