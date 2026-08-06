import { Injectable } from "@nestjs/common";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import {
  NominaReportService,
  type EmpleadoReporte,
  type ReporteGeneral,
} from "./nomina-report.service";

function money(n: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

function hours(n: number) {
  return Number(n).toFixed(2);
}

@Injectable()
export class NominaExportService {
  constructor(private reports: NominaReportService) {}

  async buildExcel(
    organizationId: string,
    mes: string | undefined,
    empleadoId: string | undefined,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const general = await this.reports.reporteGeneral(organizationId, mes);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "INRETRANS OS";
    workbook.created = new Date();

    const resumen = workbook.addWorksheet("Resumen General");
    resumen.columns = [
      { header: "Documento", key: "document", width: 16 },
      { header: "Empleado", key: "name", width: 28 },
      { header: "Días trab.", key: "days", width: 12 },
      { header: "H. Ord.", key: "ord", width: 10 },
      { header: "HED", key: "hed", width: 10 },
      { header: "HEN", key: "hen", width: 10 },
      { header: "RN", key: "rn", width: 10 },
      { header: "HEDF", key: "hedf", width: 10 },
      { header: "HENF", key: "henf", width: 10 },
      { header: "Novedades", key: "nov", width: 12 },
      { header: "Total $ Extras", key: "extras", width: 16 },
      { header: "Salario base", key: "base", width: 14 },
      { header: "Total a pagar", key: "pay", width: 16 },
    ];
    this.styleHeader(resumen);

    const rows =
      empleadoId && empleadoId !== "ALL"
        ? general.rows.filter((r) => r.empleadoId === empleadoId)
        : general.rows;

    for (const r of rows) {
      resumen.addRow({
        document: r.document,
        name: r.name,
        days: r.daysWorked,
        ord: r.ordinaryHours,
        hed: r.hedHours,
        hen: r.henHours,
        rn: r.rnHours,
        hedf: r.hedfHours,
        henf: r.henfHours,
        nov: r.noveltyCount,
        extras: r.totalExtrasAmount,
        base: r.baseSalary,
        pay: r.totalPay,
      });
    }

    const moneyCols = [11, 12, 13];
    resumen.eachRow((row, idx) => {
      if (idx === 1) return;
      for (const c of moneyCols) {
        row.getCell(c).numFmt = '"$"#,##0';
      }
    });

    const detalle = workbook.addWorksheet("Detalle Día a Día");
    detalle.columns = [
      { header: "Documento", key: "document", width: 14 },
      { header: "Empleado", key: "name", width: 24 },
      { header: "Fecha", key: "date", width: 12 },
      { header: "H. Ord.", key: "ord", width: 10 },
      { header: "HED", key: "hed", width: 10 },
      { header: "HEN", key: "hen", width: 10 },
      { header: "RN", key: "rn", width: 10 },
      { header: "HEDF", key: "hedf", width: 10 },
      { header: "HENF", key: "henf", width: 10 },
      { header: "$ Extras día", key: "extras", width: 14 },
      { header: "Servicios", key: "services", width: 36 },
      { header: "Novedades", key: "nov", width: 24 },
    ];
    this.styleHeader(detalle);

    for (const r of rows) {
      for (const d of r.daily) {
        detalle.addRow({
          document: r.document,
          name: r.name,
          date: d.date,
          ord: d.ordinaryHours,
          hed: d.hedHours,
          hen: d.henHours,
          rn: d.rnHours,
          hedf: d.hedfHours,
          henf: d.henfHours,
          extras: d.extrasAmount,
          services: d.services.map((s) => s.code).join(", "),
          nov: d.novelties.map((n) => n.kind).join(", "),
        });
      }
    }
    detalle.eachRow((row, idx) => {
      if (idx === 1) return;
      row.getCell(10).numFmt = '"$"#,##0';
    });

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    return {
      buffer,
      filename: `nomina-extras-${general.period.label}.xlsx`,
    };
  }

  async buildPdf(
    organizationId: string,
    mes: string | undefined,
    empleadoId: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const { period, employee } = await this.reports.reporteEmpleado(
      organizationId,
      empleadoId,
      mes,
    );

    const buffer = await this.renderEmployeePdf(period.label, employee);
    return {
      buffer,
      filename: `desprendible-${employee.document}-${period.label}.pdf`,
    };
  }

  async buildPdfGeneral(
    organizationId: string,
    mes: string | undefined,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const general = await this.reports.reporteGeneral(organizationId, mes);
    const buffer = await this.renderGeneralPdf(general);
    return {
      buffer,
      filename: `nomina-consolidado-${general.period.label}.pdf`,
    };
  }

  private styleHeader(ws: ExcelJS.Worksheet) {
    const row = ws.getRow(1);
    row.font = { bold: true, color: { argb: "FFF8FAFC" } };
    row.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0D9488" },
    };
    row.alignment = { vertical: "middle", horizontal: "center" };
    row.height = 22;
  }

  private renderEmployeePdf(periodLabel: string, e: EmpleadoReporte) {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 48, size: "LETTER" });
      const chunks: Buffer[] = [];
      doc.on("data", (c) => chunks.push(c as Buffer));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      doc
        .fillColor("#0F172A")
        .fontSize(16)
        .text("INRETRANS OS — Desprendible mensual", { align: "left" });
      doc
        .moveDown(0.3)
        .fontSize(10)
        .fillColor("#64748B")
        .text(`Período ${periodLabel} · Nómina de horas extras`);
      doc.moveDown();
      doc.fillColor("#0F172A").fontSize(12).text(e.name);
      doc
        .fontSize(10)
        .fillColor("#64748B")
        .text(`Documento: ${e.document}`);
      doc.moveDown();

      const lines: Array<[string, string]> = [
        ["Salario base", money(e.baseSalary)],
        ["Tarifa hora", money(e.hourlyRate)],
        ["Días trabajados", String(e.daysWorked)],
        ["Horas ordinarias", hours(e.ordinaryHours)],
        ["HED", hours(e.hedHours)],
        ["HEN", hours(e.henHours)],
        ["RN", hours(e.rnHours)],
        ["HEDF", hours(e.hedfHours)],
        ["HENF", hours(e.henfHours)],
        ["Novedades", String(e.noveltyCount)],
        ["Total extras", money(e.totalExtrasAmount)],
        ["Total a pagar", money(e.totalPay)],
      ];

      for (const [label, value] of lines) {
        doc
          .fillColor("#64748B")
          .fontSize(9)
          .text(label, { continued: true, width: 200 })
          .fillColor("#0F172A")
          .font("Helvetica-Bold")
          .text(`  ${value}`, { align: "left" })
          .font("Helvetica");
      }

      doc.moveDown();
      doc
        .fontSize(11)
        .fillColor("#0F172A")
        .text("Detalle día a día");
      doc.moveDown(0.4);

      for (const d of e.daily) {
        if (doc.y > 700) doc.addPage();
        doc
          .fontSize(9)
          .fillColor("#0D9488")
          .text(d.date, { continued: false });
        doc
          .fillColor("#0F172A")
          .text(
            `Ord ${hours(d.ordinaryHours)} · HED ${hours(d.hedHours)} · HEN ${hours(d.henHours)} · RN ${hours(d.rnHours)} · HEDF ${hours(d.hedfHours)} · HENF ${hours(d.henfHours)} · ${money(d.extrasAmount)}`,
          );
        if (d.services.length) {
          doc
            .fillColor("#64748B")
            .text(
              `Servicios: ${d.services.map((s) => s.code).join(", ")}`,
            );
        }
        if (d.novelties.length) {
          doc
            .fillColor("#DC2626")
            .text(
              `Novedades: ${d.novelties.map((n) => n.kind).join(", ")}`,
            );
        }
        doc.moveDown(0.35);
      }

      doc.moveDown(2);
      doc
        .fillColor("#64748B")
        .fontSize(9)
        .text("Firma empleado: ________________________     Firma RRHH: ________________________");
      doc
        .moveDown(0.5)
        .text("Documento generado por INRETRANS OS — listo para firmar / archivar.");

      doc.end();
    });
  }

  private renderGeneralPdf(g: ReporteGeneral) {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        margin: 36,
        size: "LETTER",
        layout: "landscape",
      });
      const chunks: Buffer[] = [];
      doc.on("data", (c) => chunks.push(c as Buffer));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      doc
        .fontSize(14)
        .fillColor("#0F172A")
        .text(`INRETRANS OS — Consolidado nómina extras ${g.period.label}`);
      doc
        .fontSize(9)
        .fillColor("#64748B")
        .text(
          `Extras ${money(g.metrics.totalExtrasAmount)} · Horas ${hours(g.metrics.totalExtrasHours)} · Novedades ${g.metrics.totalNovelties}`,
        );
      doc.moveDown();

      const header =
        "Documento | Empleado | Días | HED | HEN | RN | HEDF | HENF | Nov | $ Extras | Total pagar";
      doc.fontSize(8).fillColor("#0D9488").text(header);
      doc.moveDown(0.3);

      for (const r of g.rows) {
        if (doc.y > 540) {
          doc.addPage();
          doc.fontSize(8).fillColor("#0D9488").text(header);
          doc.moveDown(0.3);
        }
        doc
          .fillColor("#0F172A")
          .text(
            `${r.document} | ${r.name} | ${r.daysWorked} | ${hours(r.hedHours)} | ${hours(r.henHours)} | ${hours(r.rnHours)} | ${hours(r.hedfHours)} | ${hours(r.henfHours)} | ${r.noveltyCount} | ${money(r.totalExtrasAmount)} | ${money(r.totalPay)}`,
          );
      }

      doc.end();
    });
  }
}
