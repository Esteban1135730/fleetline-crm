import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ArchiveCategory,
  ArchiveDocType,
  ArchiveEntityType,
  ArchiveValidationStatus,
  ArchiveVisibility,
  FleetModule,
  Role,
} from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";
import { OcrIngestionService } from "./ocr-ingestion.service";
import type {
  ListDocumentsDto,
  UploadArchiveDto,
} from "./dto/archivo.dto";

function parseTags(
  tags?: string | string[],
): string[] {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.map(String);
  return String(tags)
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

const CONFIDENTIAL_ROLES = new Set<string>([
  Role.GESTOR_DOCUMENTAL,
  Role.ARCHIVO,
  Role.ORG_ADMIN,
  Role.PLATFORM_MASTER,
  Role.SUPERADMIN,
  Role.GERENTE_GENERAL,
  Role.PRESIDENCIA,
  Role.PRESIDENTE,
  Role.JURIDICO,
  Role.DIRECTOR_JURIDICO,
  Role.REVISOR_FISCAL,
  Role.REVISORIA,
  Role.CONTROL_INTERNO,
  Role.AUDITOR_CONTROL_INTERNO,
]);

const RESTRICTED_ROLES = new Set<string>([
  ...CONFIDENTIAL_ROLES,
  Role.SUB_GERENTE,
  Role.DIRECTOR_FINANCIERO,
  Role.DIRECTOR_OPERATIVO,
  Role.DIRECTOR_COMERCIAL,
  Role.LIDER_QHSE,
  Role.LIDER_COMPRAS,
  Role.LIDER_TI,
  Role.GESTOR_CONTABLE,
  Role.TESORERIA,
  Role.QHSE,
  Role.COMPRAS,
  Role.RRHH,
  Role.VINCULACIONES,
]);

@Injectable()
export class DataRoomService {
  constructor(
    private prisma: PrismaService,
    private ocr: OcrIngestionService,
  ) {}

  visibilityFilter(role: string): ArchiveVisibility[] {
    const normalized = String(role || "").toUpperCase();
    if (CONFIDENTIAL_ROLES.has(normalized as Role)) {
      return [
        ArchiveVisibility.PUBLIC,
        ArchiveVisibility.RESTRICTED,
        ArchiveVisibility.CONFIDENTIAL,
      ];
    }
    if (RESTRICTED_ROLES.has(normalized as Role)) {
      return [ArchiveVisibility.PUBLIC, ArchiveVisibility.RESTRICTED];
    }
    return [ArchiveVisibility.PUBLIC];
  }

  assertCanAccessVisibility(role: string, visibility: ArchiveVisibility) {
    const allowed = this.visibilityFilter(role);
    if (!allowed.includes(visibility)) {
      throw new ForbiddenException(
        `Visibilidad ${visibility} no autorizada para el rol`,
      );
    }
  }

  async upload(
    organizationId: string,
    meta: UploadArchiveDto & {
      storedName: string;
      originalName: string;
      absolutePath: string;
      byteSize?: number;
      mimeType?: string;
    },
    actorUserId?: string,
  ) {
    const contentHash = await this.ocr.hashFile(meta.absolutePath);
    const tags = parseTags(meta.tags);
    const docType = (meta.docType as ArchiveDocType) || ArchiveDocType.OTHER;
    const category =
      (meta.category as ArchiveCategory) ||
      (docType === ArchiveDocType.FACTURA
        ? ArchiveCategory.INVOICE
        : docType === ArchiveDocType.OTHER
          ? ArchiveCategory.OTHER
          : ArchiveCategory.COMPLIANCE);
    const visibility =
      (meta.visibility as ArchiveVisibility) || ArchiveVisibility.RESTRICTED;

    const entityType = meta.entityType as ArchiveEntityType | undefined;
    const links = await this.resolveEntityLinks(organizationId, {
      entityType,
      entityId: meta.entityId,
      vehicleId: meta.vehicleId,
      driverId: meta.driverId,
      supplierId: meta.supplierId,
      purchaseOrderId: meta.purchaseOrderId,
    });

    const doc = await this.prisma.archiveDocument.create({
      data: {
        organizationId,
        title: meta.title || meta.originalName,
        category,
        docType,
        visibility,
        tags,
        fileRef: `/uploads/${meta.storedName}`,
        originalName: meta.originalName,
        mimeType: meta.mimeType,
        byteSize: meta.byteSize ?? null,
        contentHash,
        validationStatus: ArchiveValidationStatus.PENDING,
        entityType: links.entityType,
        entityId: links.entityId,
        vehicleId: links.vehicleId,
        driverId: links.driverId,
        supplierId: links.supplierId,
        purchaseOrderId: links.purchaseOrderId,
        uploadedById: actorUserId,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId,
        action: "ARCHIVE_UPLOAD",
        entity: "ArchiveDocument",
        entityId: doc.id,
        module: FleetModule.ARCHIVO,
        userId: actorUserId,
        meta: {
          title: doc.title,
          docType: doc.docType,
          visibility: doc.visibility,
          entityType: doc.entityType,
          entityId: doc.entityId,
          contentHash,
        },
      },
    });

    if (meta.autoOcr) {
      const processed = await this.ocr.processDocument(
        organizationId,
        doc.id,
        {
          rawText: meta.ocrHintText,
          docType: meta.docType as ArchiveDocType | undefined,
          actorUserId,
        },
      );
      return processed;
    }

    return { document: doc, extracted: null, event: null };
  }

  listDocuments(
    organizationId: string,
    query: ListDocumentsDto,
    role: string,
  ) {
    const allowed = this.visibilityFilter(role);
    const tagList = [
      ...(query.tag ? [query.tag] : []),
      ...parseTags(query.tags),
    ];
    return this.prisma.archiveDocument.findMany({
      where: {
        organizationId,
        deletedAt: null,
        visibility: {
          in: query.visibility
            ? allowed.includes(query.visibility as ArchiveVisibility)
              ? [query.visibility as ArchiveVisibility]
              : []
            : allowed,
        },
        ...(query.entityType
          ? { entityType: query.entityType as ArchiveEntityType }
          : {}),
        ...(query.entityId ? { entityId: query.entityId } : {}),
        ...(query.vehicleId ? { vehicleId: query.vehicleId } : {}),
        ...(query.driverId ? { driverId: query.driverId } : {}),
        ...(query.supplierId ? { supplierId: query.supplierId } : {}),
        ...(query.purchaseOrderId
          ? { purchaseOrderId: query.purchaseOrderId }
          : {}),
        ...(query.docType ? { docType: query.docType as ArchiveDocType } : {}),
        ...(query.category
          ? { category: query.category as ArchiveCategory }
          : {}),
        ...(query.validationStatus
          ? {
              validationStatus:
                query.validationStatus as ArchiveValidationStatus,
            }
          : {}),
        ...(tagList.length ? { tags: { hasSome: tagList } } : {}),
        ...(query.q
          ? {
              OR: [
                { title: { contains: query.q, mode: "insensitive" } },
                { plate: { contains: query.q, mode: "insensitive" } },
                { taxIdOrDocument: { contains: query.q, mode: "insensitive" } },
                { issuer: { contains: query.q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: {
        uploadedBy: { select: { id: true, name: true, email: true } },
        vehicle: { select: { id: true, plate: true } },
        driver: { select: { id: true, name: true, document: true } },
        supplier: { select: { id: true, name: true, nit: true } },
        purchaseOrder: { select: { id: true, code: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  async getDocumentForDownload(
    organizationId: string,
    documentId: string,
    role: string,
    actorUserId?: string,
  ) {
    const doc = await this.prisma.archiveDocument.findFirst({
      where: { id: documentId, organizationId, deletedAt: null },
      include: {
        uploadedBy: { select: { id: true, name: true, email: true } },
      },
    });
    if (!doc) throw new NotFoundException("Documento no encontrado");
    this.assertCanAccessVisibility(role, doc.visibility);
    if (!doc.fileRef) {
      throw new BadRequestException("Documento sin archivo digital");
    }

    await this.prisma.auditLog.create({
      data: {
        organizationId,
        action: "ARCHIVE_DOWNLOAD",
        entity: "ArchiveDocument",
        entityId: doc.id,
        module: FleetModule.ARCHIVO,
        userId: actorUserId,
        meta: {
          title: doc.title,
          visibility: doc.visibility,
          contentHash: doc.contentHash,
          fileRef: doc.fileRef,
        },
      },
    });

    return doc;
  }

  async documentHistory(
    organizationId: string,
    documentId: string,
    role: string,
  ) {
    const doc = await this.prisma.archiveDocument.findFirst({
      where: { id: documentId, organizationId, deletedAt: null },
      include: {
        uploadedBy: { select: { id: true, name: true, email: true } },
      },
    });
    if (!doc) throw new NotFoundException("Documento no encontrado");
    this.assertCanAccessVisibility(role, doc.visibility);

    const [events, loans] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: {
          organizationId,
          entity: "ArchiveDocument",
          entityId: documentId,
        },
        orderBy: { createdAt: "desc" },
        take: 100,
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
      this.prisma.documentLoan.findMany({
        where: { organizationId, documentId },
        orderBy: { checkedOutAt: "desc" },
        take: 50,
      }),
    ]);

    return {
      document: {
        id: doc.id,
        title: doc.title,
        visibility: doc.visibility,
        uploadedBy: doc.uploadedBy,
        createdAt: doc.createdAt.toISOString(),
      },
      events: events.map((e) => ({
        id: e.id,
        action: e.action,
        userName: e.user?.name ?? "sistema",
        userId: e.userId,
        createdAt: e.createdAt.toISOString(),
        meta: e.meta,
      })),
      loans: loans.map((l) => ({
        loanId: l.id,
        status: l.status,
        borrowerName: l.borrowerName,
        borrowerUserId: l.borrowerUserId,
        checkedOutById: l.checkedOutById,
        checkedOutAt: l.checkedOutAt.toISOString(),
        returnedAt: l.returnedAt?.toISOString() ?? null,
        dueAt: l.dueAt?.toISOString() ?? null,
      })),
    };
  }

  async dataRoom(
    organizationId: string,
    entityTypeRaw: string,
    entityId: string,
    role: string,
  ) {
    const entityType = String(entityTypeRaw).toUpperCase() as ArchiveEntityType;
    if (!Object.values(ArchiveEntityType).includes(entityType)) {
      throw new BadRequestException("entityType inválido");
    }

    const entity = await this.loadEntityCard(
      organizationId,
      entityType,
      entityId,
    );

    const documents = await this.prisma.archiveDocument.findMany({
      where: {
        organizationId,
        deletedAt: null,
        visibility: { in: this.visibilityFilter(role) },
        OR: [
          { entityType, entityId },
          ...(entityType === ArchiveEntityType.VEHICLE
            ? [{ vehicleId: entityId }]
            : []),
          ...(entityType === ArchiveEntityType.DRIVER
            ? [{ driverId: entityId }]
            : []),
          ...(entityType === ArchiveEntityType.SUPPLIER
            ? [{ supplierId: entityId }]
            : []),
          ...(entityType === ArchiveEntityType.PURCHASE_ORDER
            ? [{ purchaseOrderId: entityId }]
            : []),
        ],
      },
      orderBy: [{ docType: "asc" }, { createdAt: "desc" }],
    });

    const byType: Record<string, typeof documents> = {};
    for (const d of documents) {
      const key = d.docType;
      if (!byType[key]) byType[key] = [];
      byType[key].push(d);
    }

    return {
      dataRoom: true,
      entityType,
      entityId,
      entity,
      count: documents.length,
      byType,
      documents,
    };
  }

  private async loadEntityCard(
    organizationId: string,
    entityType: ArchiveEntityType,
    entityId: string,
  ) {
    if (entityType === ArchiveEntityType.VEHICLE) {
      const v = await this.prisma.vehicle.findFirst({
        where: { id: entityId, organizationId },
        select: {
          id: true,
          plate: true,
          brand: true,
          model: true,
          status: true,
          complianceBlocked: true,
        },
      });
      if (!v) throw new NotFoundException("Vehículo no encontrado");
      return v;
    }
    if (entityType === ArchiveEntityType.DRIVER) {
      const d = await this.prisma.driver.findFirst({
        where: { id: entityId, organizationId },
        select: {
          id: true,
          name: true,
          document: true,
          licenseExpiresAt: true,
          dispatchBlocked: true,
        },
      });
      if (!d) throw new NotFoundException("Conductor no encontrado");
      return d;
    }
    if (entityType === ArchiveEntityType.SUPPLIER) {
      const s = await this.prisma.supplier.findFirst({
        where: { id: entityId, organizationId },
        select: { id: true, name: true, nit: true, sarlaftBlocked: true },
      });
      if (!s) throw new NotFoundException("Proveedor no encontrado");
      return s;
    }
    if (entityType === ArchiveEntityType.PURCHASE_ORDER) {
      const po = await this.prisma.purchaseOrder.findFirst({
        where: { id: entityId, organizationId },
        select: { id: true, code: true, status: true, totalEstimated: true },
      });
      if (!po) throw new NotFoundException("OC no encontrada");
      return po;
    }
    return { id: entityId, entityType };
  }

  private async resolveEntityLinks(
    organizationId: string,
    input: {
      entityType?: ArchiveEntityType;
      entityId?: string;
      vehicleId?: string;
      driverId?: string;
      supplierId?: string;
      purchaseOrderId?: string;
    },
  ) {
    let vehicleId = input.vehicleId;
    let driverId = input.driverId;
    let supplierId = input.supplierId;
    let purchaseOrderId = input.purchaseOrderId;
    let entityType = input.entityType;
    let entityId = input.entityId;

    if (input.entityType === ArchiveEntityType.VEHICLE && input.entityId) {
      vehicleId = input.entityId;
    }
    if (input.entityType === ArchiveEntityType.DRIVER && input.entityId) {
      driverId = input.entityId;
    }
    if (input.entityType === ArchiveEntityType.SUPPLIER && input.entityId) {
      supplierId = input.entityId;
    }
    if (
      input.entityType === ArchiveEntityType.PURCHASE_ORDER &&
      input.entityId
    ) {
      purchaseOrderId = input.entityId;
    }

    if (vehicleId) {
      const v = await this.prisma.vehicle.findFirst({
        where: { id: vehicleId, organizationId },
      });
      if (!v) throw new NotFoundException("Vehículo no encontrado");
      entityType = entityType || ArchiveEntityType.VEHICLE;
      entityId = entityId || vehicleId;
    }
    if (driverId) {
      const d = await this.prisma.driver.findFirst({
        where: { id: driverId, organizationId },
      });
      if (!d) throw new NotFoundException("Conductor no encontrado");
      entityType = entityType || ArchiveEntityType.DRIVER;
      entityId = entityId || driverId;
    }
    if (supplierId) {
      const s = await this.prisma.supplier.findFirst({
        where: { id: supplierId, organizationId },
      });
      if (!s) throw new NotFoundException("Proveedor no encontrado");
      entityType = entityType || ArchiveEntityType.SUPPLIER;
      entityId = entityId || supplierId;
    }
    if (purchaseOrderId) {
      const po = await this.prisma.purchaseOrder.findFirst({
        where: { id: purchaseOrderId, organizationId },
      });
      if (!po) throw new NotFoundException("OC no encontrada");
      entityType = entityType || ArchiveEntityType.PURCHASE_ORDER;
      entityId = entityId || purchaseOrderId;
    }

    return {
      entityType: entityType || ArchiveEntityType.GENERAL,
      entityId: entityId || null,
      vehicleId: vehicleId || null,
      driverId: driverId || null,
      supplierId: supplierId || null,
      purchaseOrderId: purchaseOrderId || null,
    };
  }
}
