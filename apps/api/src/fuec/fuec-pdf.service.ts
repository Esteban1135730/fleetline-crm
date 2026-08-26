import { Injectable } from "@nestjs/common";
import { createHash } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import { join, resolve } from "path";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import type { FuecPayload } from "./fuec.types";

const UPLOADS_DIR = resolve(__dirname, "../../../../uploads/fuec");

@Injectable()
export class FuecPdfService {
  async renderAndStore(
    id: string,
    payload: FuecPayload,
  ): Promise<{ pdfUrl: string; cryptoHash: string; qrPayload: string; buffer: Buffer }> {
    const qrPayload = `FUEC:${payload.extractNumber}|${payload.organizationNit}|${payload.validTo}`;
    const buffer = await this.renderPdf(payload, qrPayload);
    const cryptoHash = createHash("sha256")
      .update(JSON.stringify(payload) + payload.extractNumber)
      .digest("hex");

    await mkdir(UPLOADS_DIR, { recursive: true });
    const filename = `${id}.pdf`;
    const abs = join(UPLOADS_DIR, filename);
    await writeFile(abs, buffer);
    const pdfUrl = `/uploads/fuec/${filename}`;

    return { pdfUrl, cryptoHash, qrPayload, buffer };
  }

  async renderPdf(payload: FuecPayload, qrPayload: string): Promise<Buffer> {
    const qrPng = await QRCode.toBuffer(qrPayload, {
      type: "png",
      width: 110,
      margin: 1,
      errorCorrectionLevel: "M",
    });

    return new Promise((resolveBuf, reject) => {
      const doc = new PDFDocument({
        size: "LETTER",
        margins: { top: 28, bottom: 28, left: 32, right: 32 },
        compress: false,
      });
      const chunks: Buffer[] = [];
      doc.on("data", (c) => chunks.push(c as Buffer));
      doc.on("end", () => resolveBuf(Buffer.concat(chunks)));
      doc.on("error", reject);

      const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      let y = doc.page.margins.top;

      // Header logos
      doc.rect(doc.page.margins.left, y, pageW * 0.55, 42).stroke("#000");
      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor("#000")
        .text("MINISTERIO DE TRANSPORTE", doc.page.margins.left + 6, y + 8, {
          width: pageW * 0.55 - 12,
        });
      doc
        .font("Helvetica")
        .fontSize(7)
        .text("República de Colombia", doc.page.margins.left + 6, y + 22, {
          width: pageW * 0.55 - 12,
        });

      doc
        .rect(doc.page.margins.left + pageW * 0.55, y, pageW * 0.45, 42)
        .stroke("#000");
      doc
        .font("Helvetica")
        .fontSize(8)
        .text("LOGO EMPRESA", doc.page.margins.left + pageW * 0.55 + 6, y + 16, {
          width: pageW * 0.45 - 12,
          align: "center",
        });
      y += 42;

      // Title
      doc.rect(doc.page.margins.left, y, pageW, 36).stroke("#000");
      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor("#000")
        .text(
          "FORMATO UNICO DE EXTRACTO DEL CONTRATO DEL SERVICIO PUBLICO DE TRANSPORTE TERRESTRE AUTOMOTOR ESPECIAL",
          doc.page.margins.left + 4,
          y + 6,
          { width: pageW - 8, align: "center" },
        );
      y += 36;

      // Number
      doc.rect(doc.page.margins.left, y, pageW, 18).stroke("#000");
      doc
        .font("Helvetica-Bold")
        .fontSize(11)
        .fillColor("#CC0000")
        .text(payload.extractNumber, doc.page.margins.left, y + 4, {
          width: pageW,
          align: "center",
        });
      y += 18;

      const row = (
        cells: Array<{ label: string; value: string; w: number }>,
        h = 20,
      ) => {
        let x = doc.page.margins.left;
        for (const c of cells) {
          const cw = pageW * c.w;
          doc.rect(x, y, cw, h).stroke("#000");
          doc
            .font("Helvetica-Bold")
            .fontSize(7)
            .fillColor("#000")
            .text(`${c.label}: `, x + 3, y + 5, { continued: true, width: cw - 6 });
          doc.font("Helvetica").text(c.value || "—", { width: cw - 6 });
          x += cw;
        }
        y += h;
      };

      const section = (title: string) => {
        doc.rect(doc.page.margins.left, y, pageW, 16).stroke("#000");
        doc
          .font("Helvetica-Bold")
          .fontSize(8)
          .fillColor("#000")
          .text(title, doc.page.margins.left, y + 4, {
            width: pageW,
            align: "center",
          });
        y += 16;
      };

      row([
        { label: "RAZON SOCIAL", value: payload.organizationName, w: 0.65 },
        { label: "NIT", value: payload.organizationNit, w: 0.35 },
      ]);
      row([{ label: "CONTRATO NUMERO", value: payload.contractNumber, w: 1 }]);
      row([
        { label: "CONTRATANTE", value: payload.contractorName, w: 0.65 },
        { label: "NIT/CC", value: payload.contractorNit, w: 0.35 },
      ]);
      row([{ label: "OBJETO CONTRATO", value: payload.contractObject, w: 1 }], 28);
      row([
        { label: "ORIGEN", value: payload.origin, w: 0.5 },
        { label: "DESTINO", value: payload.destination, w: 0.5 },
      ]);
      row(
        [{ label: "DESCRIPCION DEL RECORRIDO", value: payload.routeDescription, w: 1 }],
        32,
      );
      row([
        {
          label: "CONVENIO/CONSORCIO/UNION TEMPORAL CON",
          value: payload.consortium || "N/A",
          w: 1,
        },
      ]);

      section("VIGENCIA DEL CONTRATO");
      row([
        { label: "FECHA INICIAL", value: payload.validFrom.slice(0, 10), w: 0.5 },
        {
          label: "FECHA VENCIMIENTO",
          value: payload.validTo.slice(0, 10),
          w: 0.5,
        },
      ]);

      section("CARACTERISTICAS DEL VEHICULO");
      const v = payload.vehicle;
      row([
        { label: "PLACA", value: v.plate, w: 0.5 },
        { label: "MODELO", value: v.model, w: 0.5 },
      ]);
      row([
        { label: "MARCA", value: v.brand, w: 0.5 },
        { label: "CLASE", value: v.vehicleClass, w: 0.5 },
      ]);
      row([
        { label: "NUMERO INTERNO", value: v.internalNumber, w: 0.5 },
        { label: "NUMERO TARJETA DE OPERACION", value: v.operationCard, w: 0.5 },
      ]);

      section("DATOS DE LOS CONDUCTORES");
      // header
      const headers = [
        { t: "N°", w: 0.08 },
        { t: "NOMBRES Y APELLIDOS", w: 0.32 },
        { t: "NUMERO CEDULA", w: 0.2 },
        { t: "NUMERO LICENCIA", w: 0.22 },
        { t: "VIGENCIA", w: 0.18 },
      ];
      let x = doc.page.margins.left;
      for (const h of headers) {
        const cw = pageW * h.w;
        doc.rect(x, y, cw, 14).stroke("#000");
        doc
          .font("Helvetica-Bold")
          .fontSize(6.5)
          .text(h.t, x + 2, y + 3, { width: cw - 4 });
        x += cw;
      }
      y += 14;

      const drivers =
        payload.drivers.length > 0
          ? payload.drivers
          : [
              {
                index: 1,
                name: "",
                document: "",
                licenseNumber: "",
                licenseExpiresAt: null,
              },
            ];
      for (const d of drivers.slice(0, 3)) {
        const vals = [
          String(d.index),
          d.name,
          d.document,
          d.licenseNumber || "",
          d.licenseExpiresAt?.slice(0, 10) || "",
        ];
        x = doc.page.margins.left;
        vals.forEach((val, i) => {
          const cw = pageW * headers[i].w;
          doc.rect(x, y, cw, 16).stroke("#000");
          doc
            .font("Helvetica")
            .fontSize(7)
            .fillColor("#000")
            .text(val || "—", x + 2, y + 4, { width: cw - 4 });
          x += cw;
        });
        y += 16;
      }

      section("RESPONSABLE DEL CONTRATANTE");
      const rh = [
        { t: "NOMBRES Y APELLIDOS", w: 0.35 },
        { t: "NUMERO CEDULA", w: 0.2 },
        { t: "TELEFONO", w: 0.2 },
        { t: "DIRECCION", w: 0.25 },
      ];
      x = doc.page.margins.left;
      for (const h of rh) {
        const cw = pageW * h.w;
        doc.rect(x, y, cw, 14).stroke("#000");
        doc
          .font("Helvetica-Bold")
          .fontSize(6.5)
          .text(h.t, x + 2, y + 3, { width: cw - 4 });
        x += cw;
      }
      y += 14;
      const rv = [
        payload.responsibleName,
        payload.responsibleDocument,
        payload.responsiblePhone,
        payload.responsibleAddress,
      ];
      x = doc.page.margins.left;
      rv.forEach((val, i) => {
        const cw = pageW * rh[i].w;
        doc.rect(x, y, cw, 18).stroke("#000");
        doc
          .font("Helvetica")
          .fontSize(7)
          .text(val || "—", x + 2, y + 5, { width: cw - 4 });
        x += cw;
      });
      y += 18;

      // Legal + signature
      const legalH = 56;
      doc.rect(doc.page.margins.left, y, pageW * 0.62, legalH).stroke("#000");
      doc
        .font("Helvetica")
        .fontSize(6.5)
        .fillColor("#000")
        .text(
          "Este documento cuenta con plena validez jurídica, conforme a lo dispuesto en el Decreto 2150 de 1995 y demás normas aplicables al servicio público de transporte terrestre automotor especial. Expedido digitalmente por INRETRANS OS.",
          doc.page.margins.left + 4,
          y + 6,
          { width: pageW * 0.62 - 8, align: "justify" },
        );

      doc
        .rect(doc.page.margins.left + pageW * 0.62, y, pageW * 0.38, legalH)
        .stroke("#000");
      doc
        .font("Helvetica")
        .fontSize(8)
        .text(
          `Fecha: ${payload.issuedAt.slice(0, 10)}`,
          doc.page.margins.left + pageW * 0.62 + 6,
          y + 10,
        );
      doc.text(
        "Firma: ________________",
        doc.page.margins.left + pageW * 0.62 + 6,
        y + 30,
      );
      y += legalH + 6;

      doc
        .font("Helvetica")
        .fontSize(6)
        .fillColor("#000")
        .text(
          "Nota: De acuerdo con la normativa vigente, este extracto no requiere sellos físicos. Según Resolución 3060 de 2014, no es obligatorio relacionar los nombres de los pasajeros transportados en el FUEC.",
          doc.page.margins.left,
          y,
          { width: pageW, align: "justify" },
        );
      y += 28;

      // QR
      doc.image(qrPng, doc.page.margins.left, y, { width: 72, height: 72 });
      doc
        .font("Helvetica")
        .fontSize(7)
        .text(
          "Para verificar este documento, lea el código QR con la cámara de su dispositivo y la aplicación correspondiente.",
          doc.page.margins.left + 84,
          y + 20,
          { width: pageW - 90 },
        );

      doc.end();
    });
  }
}
