import { Injectable, Logger, NotFoundException } from "@nestjs/common";
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
  issuerName?: string | null;
  issuerNit?: string | null;
  stops?: string[];
  departAt?: string | null;
  returnAt?: string | null;
  payment?: string | null;
  comment?: string | null;
  estimated?: boolean;
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

    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, nit: true },
    });

    const calc = (quote.calcJson ?? {}) as {
      origen?: string;
      destino?: string;
      tipoVehiculoLabel?: string;
      distanciaKm?: number;
      paradas?: string[];
      salida?: string;
      regreso?: string;
      formaPago?: string;
      comentario?: string;
      estimado?: boolean;
      pdfRef?: string;
    };

    const { pdfRef, buffer } = await this.renderAndStore(quote.code, {
      code: quote.code,
      accountName: quote.customer.name,
      nit: quote.customer.nit,
      issuerName: org?.name,
      issuerNit: org?.nit,
      zone: calc.origen && calc.destino ? `${calc.origen} → ${calc.destino}` : null,
      vehicleType: calc.tipoVehiculoLabel,
      distanceKm: calc.distanciaKm,
      amount: Number(quote.amount),
      currency: quote.currency,
      notes: quote.notes,
      issuedAt: quote.createdAt,
      stops: calc.paradas,
      departAt: calc.salida,
      returnAt: calc.regreso,
      payment: calc.formaPago,
      comment: calc.comentario,
      estimated: calc.estimado !== false,
    });

    await this.prisma.quote.update({
      where: { id: quote.id },
      data: {
        calcJson: {
          ...calc,
          pdfRef,
          pdfGeneratedAt: new Date().toISOString(),
        },
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

      doc.rect(0, 0, 612, 72).fill("#050B14");
      doc
        .font("Helvetica-Bold")
        .fontSize(16)
        .fillColor("#00E5FF")
        .text(payload.issuerName?.trim() || "Oferta comercial", 48, 22, {
          align: "left",
        });
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#8B9BB4")
        .text(
          [
            payload.issuerNit ? `NIT ${payload.issuerNit}` : null,
            `Oferta ${payload.code}`,
          ]
            .filter(Boolean)
            .join("  ·  "),
          48,
          44,
        );
      doc.fillColor("#050B14");
      doc.y = 88;
      doc.moveDown(0.4);

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
      if (payload.stops?.length) {
        rows.push(["Paradas", payload.stops.join(" · ")]);
      }
      if (payload.departAt) rows.push(["Salida", payload.departAt]);
      if (payload.returnAt) rows.push(["Regreso", payload.returnAt]);
      if (payload.payment) rows.push(["Forma de pago", payload.payment]);
      const issued = payload.issuedAt ?? new Date();
      const validUntil = new Date(issued.getTime() + 30 * 24 * 60 * 60 * 1000);
      rows.push([
        "Vigencia",
        `30 días · hasta ${validUntil.toLocaleDateString("es-CO")}`,
      ]);

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

      if (payload.comment || payload.notes) {
        doc.moveDown(0.5);
        doc.font("Helvetica-Bold").fontSize(9).fillColor("#8B9BB4").text("Comentario");
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor("#050B14")
          .text(payload.comment || payload.notes || "");
      }
      if (payload.estimated) {
        doc.moveDown(0.6);
        doc
          .font("Helvetica")
          .fontSize(8)
          .fillColor("#8B9BB4")
          .text("Distancias y peajes estimados. Confirmar antes de cerrar.");
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
