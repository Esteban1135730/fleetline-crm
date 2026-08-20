import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";
import { KafkaEventsService } from "../logistics/kafka-events.service";
import type {
  CustodiaFisicaDto,
  DespacharSuministroDto,
  PrestamoCheckOutDto,
} from "./dto/archivo.dto";

export const INVENTORY_REORDER_EVENT = "inventory.reorder_level_reached";

@Injectable()
export class ArchivoOpsService {
  constructor(
    private prisma: PrismaService,
    private kafka: KafkaEventsService,
  ) {}

  /** Asigna metadata + ubicación física [Pasillo-Estante-Caja] */
  async assignCustodiaFisica(
    organizationId: string,
    actorUserId: string,
    dto: CustodiaFisicaDto,
  ) {
    const doc = await this.prisma.archiveDocument.findFirst({
      where: { id: dto.documentId, organizationId, deletedAt: null },
    });
    if (!doc) throw new NotFoundException("Documento no encontrado");

    const aisle = dto.aisle.trim();
    const shelf = dto.shelf.trim();
    const box = dto.box.trim();
    const locationLabel = `Pasillo ${aisle} - Estante ${shelf} - Caja ${box}`;

    const updated = await this.prisma.archiveDocument.update({
      where: { id: doc.id },
      data: {
        aisle,
        shelf,
        box,
        title: dto.title?.trim() || doc.title,
        tags: dto.tags?.length
          ? dto.tags
          : doc.tags,
        plate: dto.plate?.trim().toUpperCase() || doc.plate,
        taxIdOrDocument: dto.documentNumber?.trim() || doc.taxIdOrDocument,
        vehicleId: dto.vehicleId || doc.vehicleId,
        driverId: dto.driverId || doc.driverId,
        entityType: dto.entityType
          ? (dto.entityType as never)
          : doc.entityType,
        entityId: dto.entityId || doc.entityId,
        pendingDigitization:
          dto.pendingDigitization ?? doc.pendingDigitization,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId,
        action: "CUSTODIA_FISICA_ASSIGNED",
        entity: "ArchiveDocument",
        entityId: updated.id,
        userId: actorUserId,
        meta: {
          locationLabel,
          aisle,
          shelf,
          box,
        } as Prisma.InputJsonValue,
      },
    }).catch(() => undefined);

    return {
      id: updated.id,
      title: updated.title,
      locationLabel,
      aisle: updated.aisle,
      shelf: updated.shelf,
      box: updated.box,
      plate: updated.plate,
      taxIdOrDocument: updated.taxIdOrDocument,
      pendingDigitization: updated.pendingDigitization,
      custodyStatus: updated.custodyStatus,
    };
  }

  /** Despacho de papelería con descuento de stock + alerta Kafka */
  async despacharSuministro(
    organizationId: string,
    dispatchedById: string,
    dto: DespacharSuministroDto,
  ) {
    if (dto.quantity < 1) {
      throw new BadRequestException("Cantidad inválida");
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const item = await tx.stationeryItem.findFirst({
        where: {
          organizationId,
          active: true,
          OR: [
            ...(dto.itemId ? [{ id: dto.itemId }] : []),
            ...(dto.sku ? [{ sku: dto.sku }] : []),
          ],
        },
      });
      if (!item) throw new NotFoundException("Ítem de papelería no encontrado");
      if (item.quantity < dto.quantity) {
        throw new BadRequestException(
          `Stock insuficiente — disponible ${item.quantity} ${item.unit}`,
        );
      }

      const updated = await tx.stationeryItem.update({
        where: { id: item.id },
        data: { quantity: { decrement: dto.quantity } },
      });

      const dispatch = await tx.stationeryDispatch.create({
        data: {
          organizationId,
          itemId: item.id,
          quantity: dto.quantity,
          ticketRef: dto.ticketRef?.trim() || null,
          notes: dto.notes?.trim() || null,
          requestedById: dto.requestedById || null,
          dispatchedById,
        },
      });

      return { item: updated, dispatch, prevQty: item.quantity };
    });

    const reorderReached = result.item.quantity <= result.item.minStock;
    let kafkaEvent: string | null = null;

    if (reorderReached) {
      const payload = {
        organizationId,
        itemId: result.item.id,
        sku: result.item.sku,
        name: result.item.name,
        quantity: result.item.quantity,
        minStock: result.item.minStock,
        unit: result.item.unit,
        directedTo: "compras",
        dispatchId: result.dispatch.id,
      };
      await this.kafka.emit(INVENTORY_REORDER_EVENT, payload);
      kafkaEvent = INVENTORY_REORDER_EVENT;
    }

    return {
      dispatchId: result.dispatch.id,
      itemId: result.item.id,
      sku: result.item.sku,
      name: result.item.name,
      quantityDispatched: dto.quantity,
      quantityRemaining: result.item.quantity,
      minStock: result.item.minStock,
      reorderAlert: reorderReached,
      kafkaEvent,
    };
  }

  /** Check-out de carpeta física → EN PRÉSTAMO */
  async checkOutPrestamo(
    organizationId: string,
    checkedOutById: string,
    dto: PrestamoCheckOutDto,
  ) {
    const doc = await this.prisma.archiveDocument.findFirst({
      where: { id: dto.documentId, organizationId, deletedAt: null },
    });
    if (!doc) throw new NotFoundException("Documento no encontrado");
    if (doc.custodyStatus === "ON_LOAN") {
      throw new BadRequestException("Documento ya está en préstamo");
    }

    const borrower = await this.prisma.user.findFirst({
      where: { id: dto.borrowerUserId, organizationId },
      select: { id: true, name: true, email: true },
    });
    if (!borrower) throw new NotFoundException("Usuario solicitante no encontrado");

    const dueAt = new Date(
      Date.now() + (dto.dueDays ?? 5) * 24 * 60 * 60 * 1000,
    );

    const [loan] = await this.prisma.$transaction([
      this.prisma.documentLoan.create({
        data: {
          organizationId,
          documentId: doc.id,
          borrowerUserId: borrower.id,
          borrowerName: borrower.name,
          purpose: dto.purpose?.trim() || null,
          status: "ON_LOAN",
          dueAt,
          checkedOutById,
          notes: dto.notes?.trim() || null,
        },
      }),
      this.prisma.archiveDocument.update({
        where: { id: doc.id },
        data: { custodyStatus: "ON_LOAN" },
      }),
    ]);

    return {
      loanId: loan.id,
      documentId: doc.id,
      title: doc.title,
      status: "ON_LOAN",
      borrower: { id: borrower.id, name: borrower.name, email: borrower.email },
      checkedOutAt: loan.checkedOutAt.toISOString(),
      dueAt: dueAt.toISOString(),
      locationLabel: this.formatLocation(doc.aisle, doc.shelf, doc.box),
    };
  }

  async searchUniversal(organizationId: string, q: string) {
    const term = q.trim();
    if (term.length < 2) return [];

    const digits = term.replace(/\D+/g, "");
    const plateKey = term.replace(/[\s-]/g, "").toUpperCase();
    const nameTerm = term;

    const [docs, vehicles, drivers, employees, customers] = await Promise.all([
      this.prisma.archiveDocument.findMany({
        where: {
          organizationId,
          deletedAt: null,
          OR: [
            { plate: { contains: term, mode: "insensitive" } },
            { taxIdOrDocument: { contains: term, mode: "insensitive" } },
            ...(digits.length >= 4
              ? [
                  {
                    taxIdOrDocument: {
                      contains: digits,
                      mode: "insensitive" as const,
                    },
                  },
                ]
              : []),
            { title: { contains: term, mode: "insensitive" } },
            { tags: { has: term } },
            { entityId: { contains: term, mode: "insensitive" } },
          ],
        },
        orderBy: { updatedAt: "desc" },
        take: 20,
        select: {
          id: true,
          title: true,
          plate: true,
          taxIdOrDocument: true,
          fileRef: true,
          contentHash: true,
          aisle: true,
          shelf: true,
          box: true,
          custodyStatus: true,
          pendingDigitization: true,
          docType: true,
          category: true,
          vehicleId: true,
          driverId: true,
          entityType: true,
          entityId: true,
          updatedAt: true,
        },
      }),
      this.prisma.vehicle.findMany({
        where: {
          organizationId,
          OR: [
            { plate: { contains: term, mode: "insensitive" } },
            { plate: { contains: plateKey, mode: "insensitive" } },
            { brand: { contains: nameTerm, mode: "insensitive" } },
            { model: { contains: nameTerm, mode: "insensitive" } },
          ],
        },
        orderBy: { plate: "asc" },
        take: 12,
        select: {
          id: true,
          plate: true,
          brand: true,
          model: true,
          status: true,
        },
      }),
      this.prisma.driver.findMany({
        where: {
          organizationId,
          OR: [
            { document: { contains: term } },
            ...(digits.length >= 4 ? [{ document: { contains: digits } }] : []),
            { name: { contains: nameTerm, mode: "insensitive" } },
          ],
        },
        orderBy: { name: "asc" },
        take: 12,
        select: { id: true, name: true, document: true, active: true },
      }),
      this.prisma.employee.findMany({
        where: {
          organizationId,
          OR: [
            { document: { contains: term } },
            ...(digits.length >= 4 ? [{ document: { contains: digits } }] : []),
            { name: { contains: nameTerm, mode: "insensitive" } },
          ],
        },
        orderBy: { name: "asc" },
        take: 12,
        select: {
          id: true,
          name: true,
          document: true,
          title: true,
          area: true,
          driverId: true,
        },
      }),
      this.prisma.customer.findMany({
        where: {
          organizationId,
          OR: [
            { nit: { contains: term, mode: "insensitive" } },
            ...(digits.length >= 4
              ? [{ nit: { contains: digits, mode: "insensitive" as const } }]
              : []),
            { name: { contains: nameTerm, mode: "insensitive" } },
          ],
        },
        orderBy: { name: "asc" },
        take: 8,
        select: { id: true, name: true, nit: true, segment: true },
      }),
    ]);

    const linkedDriverIds = new Set(
      employees.map((e) => e.driverId).filter((id): id is string => Boolean(id)),
    );

    type Hit = {
      kind: "document" | "vehicle" | "driver" | "employee" | "customer";
      id: string;
      title: string;
      plate: string | null;
      documentNumber: string | null;
      digitalPdf: string | null;
      contentHash: string | null;
      locationLabel: string | null;
      custodyStatus: string;
      pendingDigitization: boolean;
      docType: string;
      category?: string | null;
      vehicleId: string | null;
      driverId: string | null;
      entityType: string | null;
      entityId: string | null;
      updatedAt?: string;
    };

    const hits: Hit[] = [];

    for (const v of vehicles) {
      hits.push({
        kind: "vehicle",
        id: v.id,
        title: `${v.plate} — ${v.brand} ${v.model}`.trim(),
        plate: v.plate,
        documentNumber: null,
        digitalPdf: null,
        contentHash: null,
        locationLabel: v.status,
        custodyStatus: "AVAILABLE",
        pendingDigitization: false,
        docType: "UNIDAD",
        vehicleId: v.id,
        driverId: null,
        entityType: "VEHICLE",
        entityId: v.id,
      });
    }

    for (const d of drivers) {
      hits.push({
        kind: "driver",
        id: d.id,
        title: d.name,
        plate: null,
        documentNumber: d.document,
        digitalPdf: null,
        contentHash: null,
        locationLabel: d.active ? "Activo" : "Inactivo",
        custodyStatus: "AVAILABLE",
        pendingDigitization: false,
        docType: "CONDUCTOR",
        vehicleId: null,
        driverId: d.id,
        entityType: "DRIVER",
        entityId: d.id,
      });
    }

    for (const e of employees) {
      if (e.driverId && linkedDriverIds.has(e.driverId)) {
        if (drivers.some((d) => d.id === e.driverId)) continue;
      }
      hits.push({
        kind: "employee",
        id: e.id,
        title: e.name,
        plate: null,
        documentNumber: e.document,
        digitalPdf: null,
        contentHash: null,
        locationLabel: [e.title, e.area].filter(Boolean).join(" · ") || null,
        custodyStatus: "AVAILABLE",
        pendingDigitization: false,
        docType: "PERSONAL",
        vehicleId: null,
        driverId: e.driverId,
        entityType: "EMPLOYEE",
        entityId: e.id,
      });
    }

    for (const c of customers) {
      hits.push({
        kind: "customer",
        id: c.id,
        title: c.name,
        plate: null,
        documentNumber: c.nit,
        digitalPdf: null,
        contentHash: null,
        locationLabel: c.segment,
        custodyStatus: "AVAILABLE",
        pendingDigitization: false,
        docType: "CLIENTE",
        vehicleId: null,
        driverId: null,
        entityType: "CUSTOMER",
        entityId: c.id,
      });
    }

    for (const d of docs) {
      hits.push({
        kind: "document",
        id: d.id,
        title: d.title,
        plate: d.plate,
        documentNumber: d.taxIdOrDocument,
        digitalPdf: d.fileRef,
        contentHash: d.contentHash,
        locationLabel: this.formatLocation(d.aisle, d.shelf, d.box),
        custodyStatus: d.custodyStatus,
        pendingDigitization: d.pendingDigitization,
        docType: d.docType,
        category: d.category,
        vehicleId: d.vehicleId,
        driverId: d.driverId,
        entityType: d.entityType,
        entityId: d.entityId,
        updatedAt: d.updatedAt.toISOString(),
      });
    }

    return hits.slice(0, 40);
  }

  async dashboard(organizationId: string) {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);

    const [
      pending,
      loans,
      inventory,
      ocrValidated,
      ocrTotal,
      shreddedToday,
      totalDocs,
      storageAgg,
      ingestionDocs,
      accessRows,
      inactiveDrivers,
    ] = await Promise.all([
      this.prisma.archiveDocument.findMany({
        where: {
          organizationId,
          deletedAt: null,
          pendingDigitization: true,
        },
        orderBy: { updatedAt: "desc" },
        take: 50,
        select: {
          id: true,
          title: true,
          plate: true,
          taxIdOrDocument: true,
          aisle: true,
          shelf: true,
          box: true,
          updatedAt: true,
        },
      }),
      this.prisma.documentLoan.findMany({
        where: { organizationId, status: "ON_LOAN" },
        orderBy: { checkedOutAt: "asc" },
        take: 50,
        include: {
          document: {
            select: {
              id: true,
              title: true,
              aisle: true,
              shelf: true,
              box: true,
            },
          },
        },
      }),
      this.prisma.stationeryItem.findMany({
        where: { organizationId, active: true },
        orderBy: { quantity: "asc" },
        take: 100,
      }),
      this.prisma.archiveDocument.count({
        where: {
          organizationId,
          validationStatus: "VALIDATED",
          ocrProcessedAt: { not: null },
        },
      }),
      this.prisma.archiveDocument.count({
        where: { organizationId, deletedAt: null, ocrProcessedAt: { not: null } },
      }),
      this.prisma.auditLog.count({
        where: {
          organizationId,
          action: "ARCHIVE_DELETE",
          createdAt: { gte: dayStart },
        },
      }),
      this.prisma.archiveDocument.count({
        where: { organizationId, deletedAt: null },
      }),
      this.prisma.archiveDocument.aggregate({
        where: { organizationId, deletedAt: null },
        _sum: { byteSize: true },
      }),
      this.prisma.archiveDocument.findMany({
        where: {
          organizationId,
          deletedAt: null,
          OR: [
            { validationStatus: { in: ["PENDING", "OCR_PROCESSING"] } },
            { ocrProcessedAt: { gte: new Date(Date.now() - 7 * 86400000) } },
          ],
        },
        orderBy: { updatedAt: "desc" },
        take: 12,
        select: {
          id: true,
          title: true,
          docType: true,
          validationStatus: true,
          contentHash: true,
          ocrPayload: true,
          ocrProcessedAt: true,
          updatedAt: true,
          vehicleId: true,
          driverId: true,
        },
      }),
      this.prisma.auditLog.findMany({
        where: {
          organizationId,
          OR: [
            { entity: "ArchiveDocument" },
            { action: { startsWith: "ARCHIVE_" } },
            { action: "CUSTODIA_FISICA_ASSIGNED" },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { user: { select: { name: true, email: true } } },
      }),
      this.prisma.driver.findMany({
        where: { organizationId, active: false },
        select: { id: true, name: true, document: true },
        take: 20,
      }),
    ]);

    const ocrPrecisionPct =
      ocrTotal > 0 ? Math.round((ocrValidated / ocrTotal) * 1000) / 10 : 99.2;
    const operationalAssets = inventory.reduce((s, i) => s + i.quantity, 0);

    const assetAlerts: Array<{
      employeeId: string;
      name: string;
      role: string;
      pendingAssets: string[];
      liquidationBlocked: boolean;
      detectedAt: string;
    }> = [];

    for (const driver of inactiveDrivers) {
      const driverLoans = loans.filter(
        (l) =>
          l.borrowerName?.toLowerCase().includes(driver.name.toLowerCase()) ||
          l.borrowerName?.includes(driver.document),
      );
      const pendingAssets: string[] = driverLoans.map(
        (l) => `Carpeta: ${l.document.title}`,
      );
      if (driverLoans.length > 0) {
        pendingAssets.push("Dotación operativa (tablet / RFID)");
      }
      if (pendingAssets.length > 0) {
        assetAlerts.push({
          employeeId: driver.id,
          name: driver.name,
          role: "Conductor",
          pendingAssets,
          liquidationBlocked: true,
          detectedAt: new Date().toISOString(),
        });
      }
    }

    const overdueBorrowers = loans.filter((l) => {
      const daysOut = Math.floor(
        (Date.now() - l.checkedOutAt.getTime()) / (24 * 60 * 60 * 1000),
      );
      return daysOut > 5;
    });

    return {
      vaultMetrics: {
        ocrPrecisionPct,
        habeasShreddedToday: shreddedToday,
        operationalAssets,
        liquidationBlocks: assetAlerts.filter((a) => a.liquidationBlocked).length,
        totalDocuments: totalDocs,
        storageMb: Math.round((storageAgg._sum.byteSize ?? 0) / (1024 * 1024)),
      },
      ingestionQueue: ingestionDocs.map((d) => {
        const payload = d.ocrPayload as { confidence?: number } | null;
        const status =
          d.validationStatus === "OCR_PROCESSING"
            ? "processing"
            : d.validationStatus === "VALIDATED"
              ? "validated"
              : "pending";
        let routedTo: string | undefined;
        if (d.vehicleId) routedTo = "Flota / Trámites";
        else if (d.driverId) routedTo = "RRHH / Conductor";
        return {
          id: d.id,
          title: d.title,
          docType: d.docType,
          status,
          confidence: payload?.confidence,
          contentHash: d.contentHash,
          routedTo,
          updatedAt: d.updatedAt.toISOString(),
        };
      }),
      assetAlerts,
      accessLog: accessRows.map((a) => ({
        id: a.id,
        action: a.action,
        title:
          a.meta && typeof a.meta === "object" && "title" in a.meta
            ? String((a.meta as { title?: string }).title)
            : undefined,
        contentHash:
          a.meta && typeof a.meta === "object" && "contentHash" in a.meta
            ? String((a.meta as { contentHash?: string }).contentHash)
            : undefined,
        userName: a.user?.name ?? "sistema",
        createdAt: a.createdAt.toISOString(),
      })),
      pendingDigitization: pending.map((p) => ({
        id: p.id,
        title: p.title,
        plate: p.plate,
        documentNumber: p.taxIdOrDocument,
        locationLabel: this.formatLocation(p.aisle, p.shelf, p.box),
        updatedAt: p.updatedAt.toISOString(),
      })),
      loansOnHand: loans.map((l) => {
        const daysOut = Math.floor(
          (Date.now() - l.checkedOutAt.getTime()) / (24 * 60 * 60 * 1000),
        );
        return {
          loanId: l.id,
          documentId: l.documentId,
          title: l.document.title,
          borrowerName: l.borrowerName,
          borrowerUserId: l.borrowerUserId,
          checkedOutAt: l.checkedOutAt.toISOString(),
          dueAt: l.dueAt?.toISOString() ?? null,
          daysOut,
          overdue: daysOut > 5,
          locationLabel: this.formatLocation(
            l.document.aisle,
            l.document.shelf,
            l.document.box,
          ),
        };
      }),
      inventory: inventory.map((i) => ({
        id: i.id,
        sku: i.sku,
        name: i.name,
        unit: i.unit,
        quantity: i.quantity,
        minStock: i.minStock,
        critical: i.quantity <= i.minStock,
      })),
      overdueLoanCount: overdueBorrowers.length,
    };
  }

  /** Recordatorio diario — préstamos > 5 días */
  async remindOverdueLoans(now = new Date()) {
    const cutoff = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
    const overdue = await this.prisma.documentLoan.findMany({
      where: {
        status: "ON_LOAN",
        checkedOutAt: { lte: cutoff },
        OR: [
          { reminderSentAt: null },
          {
            reminderSentAt: {
              lte: new Date(now.getTime() - 24 * 60 * 60 * 1000),
            },
          },
        ],
      },
      include: {
        document: { select: { id: true, title: true } },
      },
      take: 200,
    });

    let reminded = 0;
    for (const loan of overdue) {
      await this.kafka.emit("document.loan.overdue_reminder", {
        organizationId: loan.organizationId,
        loanId: loan.id,
        documentId: loan.documentId,
        title: loan.document.title,
        borrowerUserId: loan.borrowerUserId,
        borrowerName: loan.borrowerName,
        checkedOutAt: loan.checkedOutAt.toISOString(),
        daysOut: Math.floor(
          (now.getTime() - loan.checkedOutAt.getTime()) / (24 * 60 * 60 * 1000),
        ),
      });
      await this.prisma.documentLoan.update({
        where: { id: loan.id },
        data: { reminderSentAt: now },
      });
      reminded += 1;
    }
    return { reminded, scanned: overdue.length };
  }

  private formatLocation(
    aisle?: string | null,
    shelf?: string | null,
    box?: string | null,
  ) {
    if (!aisle && !shelf && !box) return null;
    return `Pasillo ${aisle || "—"} - Estante ${shelf || "—"} - Caja ${box || "—"}`;
  }
}
