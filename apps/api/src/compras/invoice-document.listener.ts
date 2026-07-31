import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Facturas OCR → anota metadatos en PurchaseOrder / Supplier (Compras 08).
 */
@Injectable()
export class InvoiceDocumentListener {
  private readonly logger = new Logger(InvoiceDocumentListener.name);

  constructor(private prisma: PrismaService) {}

  @OnEvent("document.processed")
  async onDocumentProcessed(payload: {
    organizationId: string;
    archiveDocumentId: string;
    docType: string;
    purchaseOrderId?: string | null;
    supplierId?: string | null;
    taxIdOrDocument?: string | null;
    amount?: number | null;
    issuer?: string | null;
  }) {
    if (String(payload.docType).toUpperCase() !== "FACTURA") return null;

    if (payload.purchaseOrderId) {
      await this.prisma.purchaseOrder.update({
        where: { id: payload.purchaseOrderId },
        data: {
          matchNotes: `Factura OCR ${payload.archiveDocumentId} — ${payload.issuer || "sin emisor"} $${payload.amount ?? 0}`,
        },
      });
      this.logger.log(
        `[DOC] Factura vinculada a OC ${payload.purchaseOrderId}`,
      );
    }

    return { handled: true, archiveDocumentId: payload.archiveDocumentId };
  }
}
