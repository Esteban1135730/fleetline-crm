import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  PurchaseStatus,
  RequisitionStatus,
  RequisitionUrgency,
  Role,
} from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";
import { KafkaEventsService } from "../logistics/kafka-events.service";
import { SarlaftComplianceGuard } from "../sarlaft/sarlaft-compliance.guard";
import { ComprasService } from "./compras.service";
import type {
  EmitirOrdenDto,
  EntradaAlmacenDto,
  SmartBiddingDto,
} from "./dto/smart-procurement.dto";
import {
  bidOptimalityScore,
  buildOcPdfMarkup,
  comprasCfoThresholdCop,
  newSecureToken,
} from "./dto/smart-procurement.dto";

/**
 * Módulo 8 — Smart Procurement (Líder Compras · Javier).
 * Reposición automática, emisión OC con tope CFO, entrada de almacén.
 */
@Injectable()
export class SmartProcurementService {
  private readonly logger = new Logger(SmartProcurementService.name);

  constructor(
    private prisma: PrismaService,
    private kafka: KafkaEventsService,
    private sarlaft: SarlaftComplianceGuard,
    private compras: ComprasService,
  ) {}

  cfoThreshold() {
    return comprasCfoThresholdCop();
  }

  /**
   * Requisición por stock crítico → RFQ a proveedores homologados → cuadro comparativo.
   */
  async smartBidding(organizationId: string, dto: SmartBiddingDto) {
    let inventoryItem: {
      id: string;
      sku: string;
      name: string;
      quantity: number;
      minStock: number;
      unitCost: { toNumber?: () => number } | number;
    } | null = null;

    if (dto.inventoryItemId || dto.sku) {
      inventoryItem = await this.prisma.inventoryItem.findFirst({
        where: {
          organizationId,
          ...(dto.inventoryItemId
            ? { id: dto.inventoryItemId }
            : { sku: dto.sku }),
        },
      });
      if (!inventoryItem) {
        throw new NotFoundException("Ítem de inventario no encontrado");
      }
    }

    const urgency = (dto.urgency || "LOW_STOCK") as RequisitionUrgency;
    const quantity = dto.quantity || 1;
    const title =
      dto.title ||
      (inventoryItem
        ? `Reposición ${inventoryItem.sku} · ${inventoryItem.name}`
        : "Requisición Smart Bidding");

    const count = await this.prisma.purchaseRequisition.count({
      where: { organizationId },
    });
    const code = `REQ-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;

    const tags =
      dto.productTags?.length
        ? dto.productTags
        : inventoryItem
          ? [inventoryItem.sku.split("-")[0] || "REPUESTO"]
          : ["GENERAL"];

    const suppliers = await this.prisma.supplier.findMany({
      where: {
        organizationId,
        active: true,
        sarlaftBlocked: false,
        OR: [
          { productTags: { hasSome: tags } },
          { productTags: { isEmpty: true } },
        ],
      },
      take: 12,
      orderBy: { rating: "desc" },
    });

    if (!suppliers.length) {
      throw new BadRequestException(
        "Sin proveedores homologados activos para esta requisición",
      );
    }

    const baseUnit =
      inventoryItem != null
        ? Number(
            typeof inventoryItem.unitCost === "object" &&
              inventoryItem.unitCost &&
              "toNumber" in inventoryItem.unitCost
              ? inventoryItem.unitCost.toNumber?.()
              : inventoryItem.unitCost,
          ) || 50_000
        : 80_000;

    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

    const requisition = await this.prisma.purchaseRequisition.create({
      data: {
        organizationId,
        code,
        title,
        urgency,
        status: RequisitionStatus.BIDDING,
        quantity,
        inventoryItemId: inventoryItem?.id,
        sku: inventoryItem?.sku || dto.sku,
        notes: dto.notes,
        meta: {
          productTags: tags,
          source: inventoryItem ? "TALLER_STOCK" : "MANUAL",
          stockQty: inventoryItem?.quantity,
          minStock: inventoryItem?.minStock,
        },
        bids: {
          create: suppliers.map((s, idx) => {
            const variance = 0.92 + (idx % 5) * 0.03 + (s.rating || 4) * 0.01;
            const unitPrice = Number((baseUnit * variance).toFixed(2));
            const leadDays = 2 + (idx % 4);
            return {
              supplierId: s.id,
              unitPrice,
              leadDays,
              secureToken: newSecureToken(),
              expiresAt,
              notes: `RFQ automática · link seguro`,
            };
          }),
        },
      },
      include: {
        bids: { include: { supplier: true } },
        inventoryItem: true,
      },
    });

    const comparative = requisition.bids
      .map((b) => ({
        bidId: b.id,
        supplierId: b.supplierId,
        supplierName: b.supplier.name,
        rating: b.supplier.rating,
        unitPrice: Number(b.unitPrice),
        leadDays: b.leadDays,
        lineTotal: Number(b.unitPrice) * quantity,
        score: bidOptimalityScore(Number(b.unitPrice), b.leadDays),
        secureLink: `/api/v1/compras/bids/${b.secureToken}`,
        expiresAt: b.expiresAt,
      }))
      .sort((a, b) => a.score - b.score);

    let selected = comparative[0] || null;
    if (dto.autoSelect && selected) {
      await this.prisma.purchaseBid.update({
        where: { id: selected.bidId },
        data: { selected: true, respondedAt: new Date() },
      });
      await this.prisma.purchaseRequisition.update({
        where: { id: requisition.id },
        data: {
          status: RequisitionStatus.AWARDED,
          selectedBidId: selected.bidId,
        },
      });
    }

    await this.kafka.emit("purchase.smart.bidding", {
      organizationId,
      requisitionId: requisition.id,
      code: requisition.code,
      urgency,
      bidCount: comparative.length,
      selectedBidId: selected?.bidId,
    });

    this.logger.log(
      `Smart bidding ${code} · ${comparative.length} bids · selected=${selected?.supplierName ?? "n/a"}`,
    );

    return {
      requisition: {
        id: requisition.id,
        code: requisition.code,
        title: requisition.title,
        urgency: requisition.urgency,
        status: dto.autoSelect ? "AWARDED" : "BIDDING",
        quantity,
      },
      comparative,
      selected,
      message: selected
        ? `Óptimo: ${selected.supplierName} · $${selected.unitPrice} · ${selected.leadDays}d`
        : "Cuadro comparativo listo — seleccione bid",
    };
  }

  /**
   * Emite OC. Si total > tope del rol → PENDING_APPROVAL (Director Financiero).
   */
  async emitirOrden(
    organizationId: string,
    userId: string,
    dto: EmitirOrdenDto,
  ) {
    const threshold = this.cfoThreshold();
    let supplierId = dto.supplierId;
    let lines = dto.lines;
    let description = dto.description;
    let requisitionId = dto.requisitionId;

    if (dto.bidId || dto.requisitionId) {
      const req = await this.prisma.purchaseRequisition.findFirst({
        where: {
          organizationId,
          ...(dto.requisitionId
            ? { id: dto.requisitionId }
            : { bids: { some: { id: dto.bidId } } }),
        },
        include: {
          bids: { include: { supplier: true } },
          inventoryItem: true,
        },
      });
      if (!req) throw new NotFoundException("Requisición no encontrada");
      requisitionId = req.id;

      const bid =
        req.bids.find((b) => b.id === dto.bidId) ||
        req.bids.find((b) => b.selected) ||
        req.bids.sort(
          (a, b) =>
            bidOptimalityScore(Number(a.unitPrice), a.leadDays) -
            bidOptimalityScore(Number(b.unitPrice), b.leadDays),
        )[0];
      if (!bid) throw new BadRequestException("Sin cotización seleccionable");

      supplierId = bid.supplierId;
      description =
        description ||
        `OC desde ${req.code} · ${req.title}`;
      lines = [
        {
          description:
            req.inventoryItem?.name || req.title || "Ítem requisición",
          quantity: req.quantity,
          unitCost: Number(bid.unitPrice),
          inventoryItemId: req.inventoryItemId || undefined,
        },
      ];
    }

    if (!lines?.length) {
      throw new BadRequestException("Indique líneas o requisición/bid");
    }

    if (supplierId) {
      await this.sarlaft.assertSupplierClear(
        organizationId,
        supplierId,
        "PURCHASE_ORDER",
      );
    }

    const mapped = lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitCost: l.unitCost,
      lineTotal: Number((l.quantity * l.unitCost).toFixed(2)),
      inventoryItemId: l.inventoryItemId,
    }));
    const totalEstimated = mapped.reduce((s, l) => s + l.lineTotal, 0);
    const requiresCfo = totalEstimated > threshold;

    const supplier = supplierId
      ? await this.prisma.supplier.findFirst({
          where: { id: supplierId, organizationId },
        })
      : null;

    const count = await this.prisma.purchaseOrder.count({
      where: { organizationId },
    });
    const code = `OC-${String(count + 1).padStart(5, "0")}`;

    const pdfMarkup = buildOcPdfMarkup({
      code,
      supplierName: supplier?.name || "Por asignar",
      total: totalEstimated,
      currency: dto.currency || "COP",
      lines: mapped,
      requiresCfoApproval: requiresCfo,
    });

    const status = requiresCfo
      ? PurchaseStatus.PENDING_APPROVAL
      : PurchaseStatus.ORDERED;

    const order = await this.prisma.purchaseOrder.create({
      data: {
        code,
        description,
        currency: dto.currency || "COP",
        totalEstimated,
        status,
        supplierId,
        organizationId,
        approvedById: requiresCfo ? null : userId,
        meta: {
          issuedById: userId,
          cfoThreshold: threshold,
          requiresCfoApproval: requiresCfo,
          escalatedTo: requiresCfo ? "DIRECTOR_FINANCIERO" : null,
          requisitionId,
          bidId: dto.bidId,
          insuranceRenewal: dto.insuranceRenewal || null,
          pdfMarkup,
          pdfBase64: Buffer.from(pdfMarkup, "utf8").toString("base64"),
          kanban: requiresCfo ? "OC_EMITIDA" : "OC_EMITIDA",
        },
        lines: { create: mapped },
      },
      include: { lines: true, supplier: true },
    });

    if (requisitionId) {
      await this.prisma.purchaseRequisition.update({
        where: { id: requisitionId },
        data: {
          status: RequisitionStatus.ORDERED,
          purchaseOrderId: order.id,
        },
      });
    }

    if (requiresCfo) {
      await this.kafka.emit("purchase.order.escalated", {
        organizationId,
        purchaseOrderId: order.id,
        code: order.code,
        totalEstimated,
        threshold,
        role: "DIRECTOR_FINANCIERO",
      });
    } else {
      await this.kafka.emit("purchase.order.issued", {
        organizationId,
        purchaseOrderId: order.id,
        code: order.code,
        totalEstimated,
      });
    }

    return {
      order,
      requiresCfoApproval: requiresCfo,
      cfoThreshold: threshold,
      message: requiresCfo
        ? `OC ${code} supera tope $${threshold.toLocaleString("es-CO")} — escalada a Director Financiero`
        : `OC ${code} emitida · PDF generado`,
      pdf: {
        format: "PDF_MARKUP",
        contentBase64: Buffer.from(pdfMarkup, "utf8").toString("base64"),
        filename: `${code}.pdf`,
      },
    };
  }

  /**
   * Entrada de almacén: cantidades vs OC → inventario Taller + aviso 3-Way.
   */
  async entradaAlmacen(
    organizationId: string,
    userId: string,
    dto: EntradaAlmacenDto,
  ) {
    const beforeQty = new Map<string, number>();
    for (const line of dto.lines) {
      if (!line.inventoryItemId && !line.sku && !line.barcode) continue;
      const item = line.inventoryItemId
        ? await this.prisma.inventoryItem.findFirst({
            where: { id: line.inventoryItemId, organizationId },
          })
        : await this.prisma.inventoryItem.findFirst({
            where: {
              organizationId,
              OR: [
                line.sku ? { sku: line.sku } : undefined,
                line.barcode ? { qrCode: line.barcode } : undefined,
              ].filter(Boolean) as object[],
            },
          });
      if (item) beforeQty.set(item.id, item.quantity);
    }

    const receipt = await this.compras.createGoodsReceipt(
      organizationId,
      userId,
      {
        purchaseOrderId: dto.purchaseOrderId,
        notes: dto.notes,
        lines: dto.lines,
      },
    );

    const inventoryUpdates: Array<{
      id: string;
      sku: string;
      previousQty: number;
      newQty: number;
      delta: number;
    }> = [];

    for (const [id, prev] of beforeQty) {
      const item = await this.prisma.inventoryItem.findUnique({
        where: { id },
      });
      if (!item) continue;
      inventoryUpdates.push({
        id: item.id,
        sku: item.sku,
        previousQty: prev,
        newQty: item.quantity,
        delta: item.quantity - prev,
      });
    }

    await this.prisma.purchaseOrder.update({
      where: { id: dto.purchaseOrderId },
      data: {
        meta: {
          lastReceiptId: receipt.id,
          lastReceiptAt: new Date().toISOString(),
          kanban: "RECIBIDO",
        },
      },
    }).catch(() => undefined);

    // Si aún no está RECEIVED, marcar IN_TRANSIT → PARTIALLY/RECEIVED lo hace createGoodsReceipt
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: dto.purchaseOrderId, organizationId },
    });

    let notifiedAuxiliar = false;
    if (dto.notifyAuxiliarContable !== false) {
      const auxiliares = await this.prisma.user.findMany({
        where: {
          organizationId,
          role: {
            in: [Role.AUXILIAR_CONTABLE, Role.GESTOR_CONTABLE],
          },
        },
        select: { id: true, email: true },
        take: 5,
      });

      await this.kafka.emit("purchase.goods.received", {
        organizationId,
        purchaseOrderId: dto.purchaseOrderId,
        goodsReceiptId: receipt.id,
        code: receipt.code,
        notifyUserIds: auxiliares.map((u) => u.id),
        notifyEmails: auxiliares.map((u) => u.email),
        purpose: "THREE_WAY_MATCH",
      });
      notifiedAuxiliar = auxiliares.length > 0;
    }

    return {
      receipt,
      purchaseOrder: po,
      inventoryUpdates,
      threeWay: {
        notifiedAuxiliarContable: notifiedAuxiliar,
        nextStep: "Auxiliar Contable debe procesar 3-Way Match",
      },
    };
  }

  async dashboard(organizationId: string) {
    const [requisitions, orders, suppliers, lowStock] = await Promise.all([
      this.prisma.purchaseRequisition.findMany({
        where: {
          organizationId,
          status: { in: ["OPEN", "BIDDING", "AWARDED"] },
        },
        orderBy: [{ urgency: "asc" }, { createdAt: "desc" }],
        take: 40,
        include: {
          inventoryItem: { select: { sku: true, name: true, quantity: true } },
          bids: { where: { selected: true }, take: 1 },
        },
      }),
      this.prisma.purchaseOrder.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        take: 60,
        include: {
          supplier: { select: { name: true, rating: true } },
          lines: true,
        },
      }),
      this.prisma.supplier.findMany({
        where: { organizationId, active: true },
        orderBy: { rating: "desc" },
        take: 15,
        select: {
          id: true,
          name: true,
          nit: true,
          rating: true,
          totalSavings: true,
          productTags: true,
        },
      }),
      this.prisma.inventoryItem.findMany({
        where: { organizationId },
        take: 100,
      }),
    ]);

    const urgencyRank: Record<string, number> = {
      CRITICAL: 0,
      LOW_STOCK: 1,
      ADMIN: 2,
    };
    const inbox = [...requisitions].sort(
      (a, b) =>
        (urgencyRank[a.urgency] ?? 9) - (urgencyRank[b.urgency] ?? 9),
    );

    const kanban = {
      cotizando: orders.filter((o) =>
        ["DRAFT", "REQUESTED"].includes(o.status),
      ),
      ocEmitida: orders.filter((o) =>
        ["PENDING_APPROVAL", "APPROVED", "ORDERED"].includes(o.status),
      ),
      enTransito: orders.filter((o) =>
        ["IN_TRANSIT", "PARTIALLY_RECEIVED"].includes(o.status),
      ),
      recibido: orders.filter((o) =>
        ["RECEIVED", "MATCHED"].includes(o.status),
      ),
    };

    // Requisiciones en bidding también en Cotizando (virtual cards)
    const biddingReqs = requisitions.filter((r) =>
      ["BIDDING", "OPEN", "AWARDED"].includes(r.status),
    );

    const criticalStock = lowStock.filter((i) => i.quantity <= i.minStock);
    const totalSavings = suppliers.reduce(
      (s, p) => s + Number(p.totalSavings || 0),
      0,
    );

    return {
      inbox: inbox.map((r) => ({
        id: r.id,
        code: r.code,
        title: r.title,
        urgency: r.urgency,
        status: r.status,
        quantity: r.quantity,
        sku: r.sku || r.inventoryItem?.sku,
        signal:
          r.urgency === "CRITICAL"
            ? "ROJO"
            : r.urgency === "LOW_STOCK"
              ? "AMARILLO"
              : "VERDE",
        label:
          r.urgency === "CRITICAL"
            ? "Bus Varado"
            : r.urgency === "LOW_STOCK"
              ? "Stock Bajo"
              : "Administrativo",
      })),
      kanban: {
        ...kanban,
        cotizandoExtra: biddingReqs.map((r) => ({
          id: r.id,
          code: r.code,
          title: r.title,
          kind: "REQUISITION",
        })),
      },
      savings: {
        totalSavings,
        suppliers: suppliers.map((s) => ({
          id: s.id,
          name: s.name,
          nit: s.nit,
          rating: s.rating,
          totalSavings: Number(s.totalSavings),
          tags: s.productTags,
        })),
        criticalStockCount: criticalStock.length,
        cfoThreshold: this.cfoThreshold(),
      },
    };
  }
}
