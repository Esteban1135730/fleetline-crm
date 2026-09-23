import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  InvoiceStatus,
  InvoiceType,
  PaymentScheduleStatus,
  PurchaseStatus,
} from "@fsg/db";
import { HARD_RULES } from "@fsg/shared";
import { PrismaService } from "../prisma/prisma.service";
import { ThreeWayMatchingService } from "./three-way-matching.service";
import { SarlaftComplianceGuard } from "../sarlaft/sarlaft-compliance.guard";
import { SarlaftScreeningService } from "../sarlaft/sarlaft-screening.service";
import type {
  CreateGoodsReceiptDto,
  CreatePurchaseOrderDto,
  CreateSupplierDto,
  ProcessThreeWayDto,
} from "./dto/compras.dto";

@Injectable()
export class ComprasService {
  constructor(
    private prisma: PrismaService,
    private threeWay: ThreeWayMatchingService,
    private sarlaft: SarlaftComplianceGuard,
    private screening: SarlaftScreeningService,
  ) {}

  /**
   * Cupo mensual Compras por área/categoría (SCRUM-76).
   */
  async getMonthlyBudget(organizationId: string, category?: string) {
    const areaKey = (category || "GENERAL").trim().toUpperCase() || "GENERAL";
    let areaBudgets: Record<string, number> = {
      ...HARD_RULES.COMPRAS_AREA_BUDGETS_COP,
    };
    const areaJson = process.env.COMPRAS_AREA_BUDGETS_JSON;
    if (areaJson) {
      try {
        const parsed = JSON.parse(areaJson) as Record<string, number>;
        areaBudgets = { ...areaBudgets, ...parsed };
      } catch {
        /* ignore */
      }
    }

    const envGlobal = process.env.COMPRAS_MONTHLY_BUDGET_COP;
    const globalLimit =
      envGlobal && Number.isFinite(Number(envGlobal)) && Number(envGlobal) > 0
        ? Number(envGlobal)
        : HARD_RULES.COMPRAS_MONTHLY_BUDGET_COP;

    const monthlyLimit =
      areaBudgets[areaKey] ?? areaBudgets.GENERAL ?? globalLimit;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const orders = await this.prisma.purchaseOrder.findMany({
      where: {
        organizationId,
        createdAt: { gte: monthStart, lt: monthEnd },
        status: { not: PurchaseStatus.CANCELLED },
      },
      select: { totalEstimated: true, meta: true, description: true },
    });
    const spentThisMonth = orders.reduce((s, o) => {
      const meta =
        o.meta && typeof o.meta === "object" && !Array.isArray(o.meta)
          ? (o.meta as { category?: string })
          : {};
      const cat = String(meta.category || "GENERAL").toUpperCase();
      if (cat !== areaKey) return s;
      return s + Number(o.totalEstimated);
    }, 0);
    const available = Math.max(0, monthlyLimit - spentThisMonth);

    return {
      monthlyLimit,
      spentThisMonth,
      available,
      currency: "COP",
      category: areaKey,
      source: areaBudgets[areaKey] ? "HARD_RULES_AREA" : "HARD_RULES",
      period: {
        from: monthStart.toISOString(),
        to: monthEnd.toISOString(),
      },
    };
  }

  private async assertWithinBudget(
    organizationId: string,
    amount: number,
    category?: string,
  ) {
    const budget = await this.getMonthlyBudget(organizationId, category);
    if (amount > budget.available) {
      throw new UnprocessableEntityException({
        error: "COMPRAS_BUDGET_EXCEEDED",
        message: `Cupo área ${budget.category} insuficiente — disponible ${budget.available} COP de ${budget.monthlyLimit}`,
        budget,
        requested: amount,
      });
    }
    return budget;
  }

  /**
   * Al RECEIVED: factura PAYABLE + PaymentSchedule QUEUED (CxP Tesorería).
   */
  async ensurePayableOnReceived(
    organizationId: string,
    purchaseOrderId: string,
    opts?: { goodsReceiptId?: string; source?: string },
  ) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: purchaseOrderId, organizationId },
      include: { supplier: { select: { id: true, name: true } } },
    });
    if (!po) return null;
    if (po.status !== PurchaseStatus.RECEIVED) return null;

    let invoice = await this.prisma.invoice.findFirst({
      where: {
        organizationId,
        purchaseOrderId: po.id,
        type: { in: [InvoiceType.PAYABLE, InvoiceType.SUPPLIER_ELECTRONIC] },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!invoice) {
      const byCode = await this.prisma.invoice.findFirst({
        where: {
          organizationId,
          type: InvoiceType.PAYABLE,
          number: { contains: po.code },
        },
      });
      invoice = byCode;
    }

    const amount = Number(po.totalEstimated);
    const counterparty =
      po.supplier?.name ||
      (typeof po.meta === "object" &&
      po.meta &&
      "supplierName" in po.meta &&
      typeof (po.meta as { supplierName?: unknown }).supplierName === "string"
        ? (po.meta as { supplierName: string }).supplierName
        : "Proveedor");

    if (!invoice) {
      const count = await this.prisma.invoice.count({
        where: { organizationId },
      });
      const year = new Date().getFullYear();
      const due = new Date();
      due.setDate(due.getDate() + 30);
      invoice = await this.prisma.invoice.create({
        data: {
          number: `CXP-${year}-${String(count + 1).padStart(4, "0")}`,
          type: InvoiceType.PAYABLE,
          status: InvoiceStatus.CLEARED_FOR_PAYMENT,
          amount,
          dueDate: due,
          counterparty,
          organizationId,
          supplierId: po.supplierId,
          purchaseOrderId: po.id,
          prefacturaAnnex: {
            description: `Compra ${po.code}: ${po.description}`,
            source: opts?.source || "purchase.received",
            goodsReceiptId: opts?.goodsReceiptId ?? null,
          },
        },
      });
    } else if (!invoice.purchaseOrderId) {
      invoice = await this.prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          purchaseOrderId: po.id,
          supplierId: invoice.supplierId ?? po.supplierId,
          status:
            invoice.status === InvoiceStatus.DRAFT
              ? InvoiceStatus.CLEARED_FOR_PAYMENT
              : invoice.status,
        },
      });
    }

    const existingSchedule = await this.prisma.paymentSchedule.findUnique({
      where: { invoiceId: invoice.id },
    });
    if (existingSchedule) {
      return { invoice, schedule: existingSchedule, created: false };
    }

    const due = invoice.dueDate ?? new Date(Date.now() + 7 * 86_400_000);
    const schedule = await this.prisma.paymentSchedule.create({
      data: {
        organizationId,
        invoiceId: invoice.id,
        purchaseOrderId: po.id,
        amount: Number(invoice.amount),
        counterparty: invoice.counterparty,
        status: PaymentScheduleStatus.QUEUED,
        dueDate: due,
        meta: {
          source: opts?.source || "purchase.received",
          goodsReceiptId: opts?.goodsReceiptId ?? null,
          purchaseOrderCode: po.code,
        },
      },
    });

    if (
      invoice.status !== InvoiceStatus.CLEARED_FOR_PAYMENT &&
      invoice.status !== InvoiceStatus.PAID
    ) {
      await this.prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: InvoiceStatus.CLEARED_FOR_PAYMENT },
      });
    }

    return { invoice, schedule, created: true };
  }

  listSuppliers(organizationId: string) {
    return this.prisma.supplier.findMany({
      where: { organizationId },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        nit: true,
        email: true,
        phone: true,
        active: true,
        rating: true,
        productTags: true,
        sarlaftBlocked: true,
        paymentHardBlocked: true,
        totalSavings: true,
        createdAt: true,
      },
    });
  }

  async createSupplier(organizationId: string, dto: CreateSupplierDto) {
    const nit = dto.nit.replace(/\s/g, "");
    const existing = await this.prisma.supplier.findFirst({
      where: { organizationId, nit },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException("Ya existe un proveedor con ese NIT");
    }

    const email = dto.email?.trim() || null;
    const phone = dto.phone?.trim() || null;
    const bankName = dto.bankName?.trim() || null;
    const bankAccountNumber = dto.bankAccountNumber?.trim() || null;

    const created = await this.prisma.supplier.create({
      data: {
        organizationId,
        name: dto.name.trim(),
        nit,
        email,
        phone,
        productTags: dto.productTags ?? [],
        rating: dto.rating ?? 4,
        bankName,
        bankAccountNumber,
        active: true,
        sarlaftBlocked: false,
      },
      select: {
        id: true,
        name: true,
        nit: true,
        email: true,
        phone: true,
        active: true,
        rating: true,
        productTags: true,
        sarlaftBlocked: true,
        paymentHardBlocked: true,
        totalSavings: true,
        createdAt: true,
      },
    });

    // SCRUM-77: screening al alta — setea sarlaftBlocked si riesgo alto
    try {
      await this.screening.screenEntity(
        organizationId,
        "SUPPLIER",
        created.id,
        nit,
        { subjectName: dto.name.trim() },
      );
      const refreshed = await this.prisma.supplier.findFirst({
        where: { id: created.id },
        select: { sarlaftBlocked: true },
      });
      if (refreshed) created.sarlaftBlocked = refreshed.sarlaftBlocked;
    } catch {
      // Screening fallido no tumba el alta; queda para reintento
    }

    return created;
  }

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

    await this.assertWithinBudget(organizationId, totalEstimated);

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
        } as object,
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

    const updatedPo = await this.prisma.purchaseOrder.findFirst({
      where: { id: po.id },
      select: { status: true },
    });
    let cxp: Awaited<ReturnType<ComprasService["ensurePayableOnReceived"]>> =
      null;
    if (updatedPo?.status === PurchaseStatus.RECEIVED) {
      cxp = await this.ensurePayableOnReceived(organizationId, po.id, {
        goodsReceiptId: receipt.id,
        source: "goods.receipt.received",
      });
    }

    return { ...receipt, cxp };
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
