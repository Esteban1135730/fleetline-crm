import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { QuoteStatus } from "@fsg/db";
import { mkdir, writeFile } from "fs/promises";
import { join, resolve } from "path";
import PDFDocument from "pdfkit";
import { PrismaService } from "../prisma/prisma.service";

const UPLOADS_DIR = resolve(__dirname, "../../../../uploads/quotes");

export type QuotePdfPayload = {
  code: string;
  accountName: string;
  nit?: string | null;
  zone?: string | null;
  vehicleType?: string | null;
  distanceKm?: number | null;
  ratePerKm?: number | null;
  amount?: number | null;
  marginPct?: number | null;
  discountPct?: number | null;
  currency?: string;
  notes?: string | null;
  issuedAt?: Date;
};

/**
 * SCRUM-43 — PDF real de oferta comercial (pdfkit + disco).
 * Sustituye el stub `pdfRef` sin archivo físico.
 */
@Injectable()
export class QuotePdfService {
  private readonly logger = new Logger(QuotePdfService.name);

  constructor(private prisma: PrismaService) {}

  async renderAndStore(
    filenameBase: string,
    payload: QuotePdfPayload,
  ): Promise<{ pdfRef: string; buffer: Buffer }> {
    const buffer = await this.renderPdf(payload);
    await mkdir(UPLOADS_DIR, { recursive: true });
    const safe = filenameBase.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filename = `${safe}.pdf`;
    await writeFile(join(UPLOADS_DIR, filename), buffer);
    const pdfRef = `quotes/${filename}`;
    this.logger.log(`PDF oferta generado · ${pdfRef}`);
    return { pdfRef, buffer };
  }

  async generateIntelligentQuotePdf(
    organizationId: string,
    quoteId: string,
  ): Promise<{ pdfRef: string; buffer: Buffer }> {
    const quote = await this.prisma.commercialIntelligentQuote.findFirst({
      where: { id: quoteId, organizationId },
      include: {
        deal: {
          include: {
            customer: { select: { name: true, nit: true } },
          },
        },
      },
    });
    if (!quote) throw new NotFoundException("Cotización inteligente no encontrada");

    const calc = (quote.calcJson ?? {}) as {
      zone?: string;
      vehicleType?: string;
      distanceKm?: number;
    };

    const rate = Number(quote.proposedRatePerKm);
    const km = calc.distanceKm ?? quote.deal.distanceKm ?? null;
    const amount =
      km != null && Number.isFinite(rate) ? Number((rate * km).toFixed(0)) : null;

    const { pdfRef, buffer } = await this.renderAndStore(
      `${quote.deal.code}-${quote.id.slice(-6)}`,
      {
        code: quote.deal.code,
        accountName: quote.deal.customer?.name ?? quote.deal.accountName,
        nit: quote.deal.customer?.nit,
        zone: calc.zone ?? quote.deal.zone,
        vehicleType: calc.vehicleType ?? quote.deal.vehicleType,
        distanceKm: km,
        ratePerKm: rate,
        amount,
        marginPct: quote.marginPct,
        discountPct: quote.discountPct,
        issuedAt: quote.sentAt ?? quote.createdAt,
      },
    );

    await this.prisma.commercialIntelligentQuote.update({
      where: { id: quote.id },
      data: { pdfRef },
    });

    return { pdfRef, buffer };
  }

  async generateSimpleQuotePdf(
    organizationId: string,
    quoteId: string,
  ): Promise<{ pdfRef: string; buffer: Buffer }> {
    const quote = await this.prisma.quote.findFirst({
      where: { id: quoteId, customer: { organizationId } },
      include: { customer: true },
    });
    if (!quote) throw new NotFoundException("Cotización no encontrada");

    const calc = (quote.calcJson ?? {}) as {
      origen?: string;
      destino?: string;
      tipoVehiculoLabel?: string;
      distanciaKm?: number;
      pdfRef?: string;
    };

    const { pdfRef, buffer } = await this.renderAndStore(quote.code, {
      code: quote.code,
      accountName: quote.customer.name,
      nit: quote.customer.nit,
      zone: calc.origen && calc.destino ? `${calc.origen} → ${calc.destino}` : null,
      vehicleType: calc.tipoVehiculoLabel,
      distanceKm: calc.distanciaKm,
      amount: Number(quote.amount),
      currency: quote.currency,
      notes: quote.notes,
      issuedAt: quote.createdAt,
    });

    await this.prisma.quote.update({
      where: { id: quote.id },
      data: {
        calcJson: {
          ...calc,
          pdfRef,
          pdfGeneratedAt: new Date().toISOString(),
        },
        status: quote.status === QuoteStatus.DRAFT ? QuoteStatus.SENT : quote.status,
      },
    });

    return { pdfRef, buffer };
  }

  private renderPdf(payload: QuotePdfPayload): Promise<Buffer> {
    return new Promise((resolveBuf, reject) => {
      const doc = new PDFDocument({
        size: "LETTER",
        margins: { top: 40, bottom: 40, left: 48, right: 48 },
      });
      const chunks: Buffer[] = [];
      doc.on("data", (c) => chunks.push(c as Buffer));
      doc.on("end", () => resolveBuf(Buffer.concat(chunks)));
      doc.on("error", reject);

      const money = (n: number | null | undefined) =>
        n == null || Number.isNaN(n)
          ? "—"
          : new Intl.NumberFormat("es-CO", {
              style: "currency",
              currency: payload.currency ?? "COP",
              maximumFractionDigits: 0,
            }).format(n);

      doc
        .font("Helvetica-Bold")
        .fontSize(16)
        .fillColor("#0B1325")
        .text("NEXA · Oferta comercial", { align: "left" });
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#8B9BB4")
        .text(`Referencia ${payload.code}`, { align: "left" });
      doc.moveDown(0.6);

      doc
        .strokeColor("#1C3A5E")
        .lineWidth(1)
        .moveTo(48, doc.y)
        .lineTo(564, doc.y)
        .stroke();
      doc.moveDown(1);

      doc.font("Helvetica-Bold").fontSize(11).fillColor("#0B1325").text("Cliente");
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#050B14")
        .text(payload.accountName);
      if (payload.nit) {
        doc.fontSize(9).fillColor("#8B9BB4").text(`NIT ${payload.nit}`);
      }
      doc.moveDown(0.8);

      const rows: Array<[string, string]> = [
        ["Zona / ruta", payload.zone ?? "—"],
        ["Vehículo", payload.vehicleType ?? "—"],
        [
          "Distancia",
          payload.distanceKm != null ? `${payload.distanceKm} km` : "—",
        ],
        [
          "Tarifa $/km",
          payload.ratePerKm != null ? money(payload.ratePerKm) : "—",
        ],
        ["Valor oferta", money(payload.amount ?? null)],
      ];
      if (payload.marginPct != null) {
        rows.push(["Margen", `${payload.marginPct.toFixed(1)}%`]);
      }
      if (payload.discountPct != null && payload.discountPct > 0) {
        rows.push(["Descuento", `${payload.discountPct}%`]);
      }

      for (const [label, value] of rows) {
        doc
          .font("Helvetica-Bold")
          .fontSize(9)
          .fillColor("#8B9BB4")
          .text(label, { continued: false, width: 140 });
        doc
          .font("Helvetica")
          .fontSize(10)
          .fillColor("#050B14")
          .text(value, { indent: 0 });
        doc.moveDown(0.25);
      }

      if (payload.notes) {
        doc.moveDown(0.5);
        doc.font("Helvetica-Bold").fontSize(9).fillColor("#8B9BB4").text("Notas");
        doc.font("Helvetica").fontSize(9).fillColor("#050B14").text(payload.notes);
      }

      doc.moveDown(1.5);
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor("#8B9BB4")
        .text(
          `Emitido ${ (payload.issuedAt ?? new Date()).toLocaleString("es-CO") } · Documento operativo NEXA OS`,
        );

      doc.end();
    });
  }
}
