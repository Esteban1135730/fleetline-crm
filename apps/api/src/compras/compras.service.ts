import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  InvoiceStatus,
  InvoiceType,
  PurchaseStatus,
} from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";
import { ThreeWayMatchingService } from "./three-way-matching.service";
import { SarlaftComplianceGuard } from "../sarlaft/sarlaft-compliance.guard";
import type {
  CreateGoodsReceiptDto,
  CreatePurchaseOrderDto,
  ProcessThreeWayDto,
} from "./dto/compras.dto";

@Injectable()
export class ComprasService {
  constructor(
    private prisma: PrismaService,
    private threeWay: ThreeWayMatchingService,
    private sarlaft: SarlaftComplianceGuard,
  ) {}

  listOrders(organizationId: string) {
    return this.prisma.purchaseOrder.findMany({
      where: { organizationId },
      include: {
        lines: true,
        supplier: true,
        goodsReceipts: { orderBy: { receivedAt: "desc" }, take: 5 },
        matchRecords: { orderBy: { evaluatedAt: "desc" }, take: 3 },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async createPurchaseOrder(
    organizationId: string,
    dto: CreatePurchaseOrderDto,
  ) {
    const lines = dto.lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitCost: l.unitCost,
      lineTotal: Number((l.quantity * l.unitCost).toFixed(2)),
      inventoryItemId: l.inventoryItemId,
    }));
    const totalEstimated = lines.reduce((s, l) => s + l.lineTotal, 0);

    if (dto.supplierId) {
      await this.sarlaft.assertSupplierClear(
        organizationId,
        dto.supplierId,
        "PURCHASE_ORDER",
      );
    }

    const count = await this.prisma.purchaseOrder.count({
      where: { organizationId },
    });

    return this.prisma.purchaseOrder.create({
      data: {
        code: `OC-${String(count + 1).padStart(5, "0")}`,
        description: dto.description,
        currency: dto.currency || "COP",
        totalEstimated,
        status: PurchaseStatus.ORDERED,
        supplierId: dto.supplierId,
        organizationId,
        lines: { create: lines },
      },
      include: { lines: true, supplier: true },
    });
  }

  async createGoodsReceipt(
    organizationId: string,
    userId: string,
    dto: CreateGoodsReceiptDto,
  ) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: dto.purchaseOrderId, organizationId },
      include: { lines: true },
    });
    if (!po) throw new NotFoundException("Orden de compra no encontrada");

    const quantityTotal = dto.lines.reduce((s, l) => s + l.quantity, 0);
    if (quantityTotal <= 0) {
      throw new BadRequestException("La recepción debe tener cantidad > 0");
    }

    const count = await this.prisma.goodsReceipt.count();
    const code = `REM-${String(count + 1).padStart(5, "0")}`;

    const receipt = await this.prisma.goodsReceipt.create({
      data: {
        code,
        purchaseOrderId: po.id,
        receivedById: userId,
        quantityTotal,
        notes: dto.notes,
        payload: {
          lines: dto.lines,
          scannedAt: new Date().toISOString(),
          barcodes: dto.lines.map((l) => l.barcode).filter(Boolean),
        },
      },
    });

    await this.prisma.purchaseOrder.update({
      where: { id: po.id },
      data: {
        status:
          quantityTotal >= po.lines.reduce((s, l) => s + l.quantity, 0)
            ? PurchaseStatus.RECEIVED
            : PurchaseStatus.PARTIALLY_RECEIVED,
      },
    });

    // Incrementa inventario si hay SKU/item
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
      if (item) {
        await this.prisma.inventoryItem.update({
          where: { id: item.id },
          data: { quantity: { increment: line.quantity } },
        });
      }
    }

    return receipt;
  }

  /**
   * Recibe / asocia factura proveedor y dispara 3-Way Matching.
   */
  async processThreeWay(
    organizationId: string,
    dto: ProcessThreeWayDto,
  ) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: dto.purchaseOrderId, organizationId },
      include: { supplier: true, lines: true },
    });
    if (!po) throw new NotFoundException("Orden de compra no encontrada");

    const receipt = await this.prisma.goodsReceipt.findFirst({
      where: { id: dto.goodsReceiptId, purchaseOrderId: po.id },
    });
    if (!receipt) {
      throw new NotFoundException(
        "Remisión no encontrada o no pertenece a la OC",
      );
    }

    let invoiceId = dto.invoiceId;
    if (!invoiceId) {
      if (dto.amount == null) {
        throw new BadRequestException(
          "Indique invoiceId o amount para crear la factura proveedor",
        );
      }
      const count = await this.prisma.invoice.count({
        where: { organizationId },
      });
      const number =
        dto.invoiceNumber ||
        `FP-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;

      const inv = await this.prisma.invoice.create({
        data: {
          number,
          type: InvoiceType.SUPPLIER_ELECTRONIC,
          status: InvoiceStatus.PENDING_MATCH,
          counterparty:
            dto.counterparty ||
            po.supplier?.name ||
            "Proveedor",
          amount: dto.amount,
          xmlHash: dto.xmlHash,
          dianPayload: dto.dianPayload as object | undefined,
          supplierId: po.supplierId,
          purchaseOrderId: po.id,
          organizationId,
        },
      });
      invoiceId = inv.id;
    } else {
      const existing = await this.prisma.invoice.findFirst({
        where: { id: invoiceId, organizationId },
      });
      if (!existing) throw new NotFoundException("Factura no encontrada");
      await this.prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          status: InvoiceStatus.PENDING_MATCH,
          purchaseOrderId: po.id,
          ...(dto.dianPayload
            ? { dianPayload: dto.dianPayload as object }
            : {}),
          ...(dto.xmlHash ? { xmlHash: dto.xmlHash } : {}),
        },
      });
    }

    try {
      return await this.threeWay.processMatch({
        organizationId,
        purchaseOrderId: po.id,
        goodsReceiptId: receipt.id,
        invoiceId,
      });
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("NOT_FOUND") || msg.includes("MISMATCH")) {
        throw new BadRequestException(msg);
      }
      throw e;
    }
  }
}
