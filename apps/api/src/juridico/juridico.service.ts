import {
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomBytes } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import PDFDocument from "pdfkit";
import {
  EvidentiaryPackageStatus,
  LegalScanStatus,
  SarlaftAlertStatus,
  SarlaftRisk,
} from "@fsg/db";
import { HARD_RULES } from "@fsg/shared";
import { PrismaService } from "../prisma/prisma.service";
import { RestrictiveListsClient } from "../sarlaft/restrictive-lists.client";
import type {
  ContractCommentDto,
  DisciplinaryMemoDto,
  SarlaftConsultaListasDto,
  SmartScanDto,
} from "./dto/juridico.dto";

type FlaggedClause = {
  excerpt: string;
  penaltyPct: number;
  severity: "OVER_POLICY" | "BORDERLINE";
  policyMaxPct: number;
};

const PENALTY_PATTERNS: RegExp[] = [
  /penalidad(?:\s+del|\s+de)?\s+(\d{1,2}(?:[.,]\d+)?)\s*%/gi,
  /cl[aá]usula\s+penal(?:idad)?[^.]{0,80}?(\d{1,2}(?:[.,]\d+)?)\s*%/gi,
  /multa(?:\s+del|\s+de)?\s+(\d{1,2}(?:[.,]\d+)?)\s*%/gi,
  /(\d{1,2}(?:[.,]\d+)?)\s*%\s+(?:de\s+)?(?:penalidad|multa|indemnizaci[oó]n)/gi,
];

/**
 * Módulo 17 — Jurídico / Legal Hub 4.0 (Sofía · DIRECTOR_JURIDICO).
 */
@Injectable()
export class JuridicoService {
  private readonly logger = new Logger(JuridicoService.name);

  constructor(
    private prisma: PrismaService,
    private lists: RestrictiveListsClient,
  ) {}

  async dashboard(organizationId: string) {
    const [scans, calendar, packages, sarlaft, memos] = await Promise.all([
      this.prisma.legalContractScan.findMany({
        where: { organizationId },
        orderBy: { updatedAt: "desc" },
        take: 20,
      }),
      this.prisma.judicialCalendarEvent.findMany({
        where: { organizationId },
        orderBy: { dueAt: "asc" },
        take: 30,
      }),
      this.prisma.evidentiaryPackage.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      this.prisma.sarlaftCheck.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        take: 25,
        include: {
          customer: { select: { id: true, name: true, nit: true } },
        },
      }),
      this.prisma.disciplinaryMemo.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

    const now = Date.now();
    const judicialAlerts = calendar.map((e) => {
      const ms = e.dueAt.getTime() - now;
      const daysLeft = Math.ceil(ms / 86_400_000);
      return {
        id: e.id,
        title: e.title,
        kind: e.kind,
        dueAt: e.dueAt.toISOString(),
        immutable: e.immutable,
        alertRed: e.alertRed || daysLeft <= 7,
        caseRef: e.caseRef,
        daysLeft,
        notes: e.notes,
      };
    });

    const sarlaftLights = sarlaft.map((s) => ({
      id: s.id,
      subjectName: s.subjectName,
      document: s.document,
      risk: s.risk,
      riskScore: s.riskScore,
      listsMatched: s.listsMatched,
      status: s.status,
      customerName: s.customer?.name ?? null,
      light:
        s.riskScore >= 80 || s.risk === SarlaftRisk.HIGH
          ? "RED"
          : s.riskScore >= 50 || s.risk === SarlaftRisk.MEDIUM
            ? "AMBER"
            : "GREEN",
    }));

    return {
      role: "DIRECTOR_JURIDICO",
      hub: "Legal Hub 4.0",
      contracts: scans.map((s) => ({
        id: s.id,
        code: s.code,
        title: s.contractTitle,
        kind: s.contractKind,
        status: s.status,
        fileRef: s.fileRef,
        flaggedClauses: s.flaggedClauses,
        maxPenaltyPctFound: s.maxPenaltyPctFound,
        policyMaxPenaltyPct: s.policyMaxPenaltyPct,
        commentsThread: s.commentsThread,
        createdAt: s.createdAt.toISOString(),
      })),
      judicialCalendar: judicialAlerts,
      evidentiaryPackages: packages.map((p) => ({
        id: p.id,
        code: p.code,
        plate: p.plate,
        contentHash: p.contentHash,
        pdfRef: p.pdfRef,
        status: p.status,
        preopCount: p.preopCount,
        gpsPointCount: p.gpsPointCount,
        workOrderCount: p.workOrderCount,
        sealedAt: p.sealedAt?.toISOString() ?? null,
      })),
      sarlaftLights,
      disciplinaryMemos: memos.map((m) => ({
        id: m.id,
        code: m.code,
        subjectName: m.subjectName,
        plate: m.plate,
        charge: m.charge,
        status: m.status,
        createdAt: m.createdAt.toISOString(),
      })),
      policy: {
        maxPenaltyClausePct: HARD_RULES.LEGAL_MAX_PENALTY_CLAUSE_PCT,
      },
    };
  }

  /** Smart Legal Scan — cláusulas de penalidad vs política FSG */
  async smartScan(
    organizationId: string,
    actorId: string,
    dto: SmartScanDto,
  ) {
    const policyMax = HARD_RULES.LEGAL_MAX_PENALTY_CLAUSE_PCT;
    const flagged = this.extractPenaltyClauses(dto.contractText, policyMax);
    const maxFound = flagged.length
      ? Math.max(...flagged.map((f) => f.penaltyPct))
      : null;
    const status =
      flagged.some((f) => f.severity === "OVER_POLICY")
        ? LegalScanStatus.FLAGGED
        : LegalScanStatus.CLEARED;

    const code = `LS-${Date.now().toString(36).toUpperCase()}-${randomBytes(2).toString("hex").toUpperCase()}`;
    const commentsThread = (dto.comments ?? []).map((c) => ({
      author: c.author,
      body: c.body,
      at: c.at ?? new Date().toISOString(),
    }));

    const scan = await this.prisma.legalContractScan.create({
      data: {
        organizationId,
        code,
        contractTitle: dto.contractTitle,
        contractKind: dto.contractKind,
        fileRef: dto.fileRef,
        status,
        flaggedClauses: flagged,
        maxPenaltyPctFound: maxFound ?? undefined,
        policyMaxPenaltyPct: policyMax,
        commentsThread,
        scannedById: actorId,
        sealedAt: status === LegalScanStatus.CLEARED ? new Date() : undefined,
        meta: {
          textLength: dto.contractText.length,
          excerpt: dto.contractText.slice(0, 400),
        },
      },
    });

    this.logger.log(
      `Smart scan ${code}: ${flagged.length} cláusulas · status=${status}`,
    );

    return {
      id: scan.id,
      code: scan.code,
      status: scan.status,
      policyMaxPenaltyPct: policyMax,
      maxPenaltyPctFound: maxFound,
      flaggedClauses: flagged,
      commentsThread,
      message:
        status === LegalScanStatus.FLAGGED
          ? `Señal crítica — penalidad ${maxFound}% supera tope FSG ${policyMax}%`
          : "Contrato dentro de política FSG",
    };
  }

  extractPenaltyClauses(
    text: string,
    policyMaxPct: number,
  ): FlaggedClause[] {
    const found: FlaggedClause[] = [];
    const seen = new Set<string>();

    for (const re of PENALTY_PATTERNS) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const raw = (m[1] || "").replace(",", ".");
        const pct = Number.parseFloat(raw);
        if (!Number.isFinite(pct) || pct <= 0 || pct > 100) continue;
        const start = Math.max(0, m.index - 40);
        const excerpt = text.slice(start, m.index + m[0].length + 40).trim();
        const key = `${pct}|${excerpt.slice(0, 60)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (pct > policyMaxPct) {
          found.push({
            excerpt,
            penaltyPct: pct,
            severity: "OVER_POLICY",
            policyMaxPct,
          });
        } else if (pct >= policyMaxPct * 0.9) {
          found.push({
            excerpt,
            penaltyPct: pct,
            severity: "BORDERLINE",
            policyMaxPct,
          });
        }
      }
    }
    return found;
  }

  async addContractComment(
    organizationId: string,
    dto: ContractCommentDto,
  ) {
    const scan = await this.prisma.legalContractScan.findFirst({
      where: { id: dto.scanId, organizationId },
    });
    if (!scan) throw new NotFoundException("Escaneo contractual no encontrado");

    const prev = Array.isArray(scan.commentsThread)
      ? (scan.commentsThread as Array<{
          author: string;
          body: string;
          at: string;
        }>)
      : [];
    const next = [
      ...prev,
      { author: dto.author, body: dto.body, at: new Date().toISOString() },
    ];
    const updated = await this.prisma.legalContractScan.update({
      where: { id: scan.id },
      data: { commentsThread: next },
    });
    return {
      id: updated.id,
      code: updated.code,
      commentsThread: next,
    };
  }

  /**
   * Expediente probatorio inmutable por placa:
   * preoperacionales firmados + bitácora Taller 4.0 + telemetría GPS.
   */
  async expedienteProbatorio(
    organizationId: string,
    plateRaw: string,
    actorId?: string,
  ) {
    const plate = plateRaw.trim().toUpperCase();
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { organizationId, plate },
    });
    if (!vehicle) {
      throw new NotFoundException(`Unidad ${plate} no registrada en flota`);
    }

    const trips = await this.prisma.trip.findMany({
      where: { organizationId, vehicleId: vehicle.id },
      orderBy: { departAt: "desc" },
      take: 40,
      include: {
        preoperational: true,
        trackPoints: {
          orderBy: { recordedAt: "asc" },
          take: 500,
        },
        driver: { select: { id: true, name: true, document: true } },
      },
    });

    const workOrders = await this.prisma.workOrder.findMany({
      where: { organizationId, vehicleId: vehicle.id },
      orderBy: { openedAt: "desc" },
      take: 30,
    });

    const preops = trips
      .filter((t) => t.preoperational)
      .map((t) => ({
        tripCode: t.code,
        signedAt: t.preoperational!.signedAt.toISOString(),
        approved: t.preoperational!.approved,
        brakesOk: t.preoperational!.brakesOk,
        lightsOk: t.preoperational!.lightsOk,
        tiresOk: t.preoperational!.tiresOk,
        kitOk: t.preoperational!.kitOk,
        oilOk: t.preoperational!.oilOk,
        observations: t.preoperational!.observations,
        driverName: t.driver?.name ?? null,
      }));

    const gpsPoints = trips.flatMap((t) =>
      t.trackPoints.map((p) => ({
        tripCode: t.code,
        lat: p.lat,
        lng: p.lng,
        speedKph: p.speedKph,
        recordedAt: p.recordedAt.toISOString(),
      })),
    );

    const tallerLog = workOrders.map((w) => ({
      code: w.code,
      description: w.description,
      status: w.status,
      openedAt: w.openedAt.toISOString(),
      closedAt: w.closedAt?.toISOString() ?? null,
      odometerAtOpen: w.odometerAtOpen,
    }));

    const sections = {
      plate,
      vehicleId: vehicle.id,
      vin: vehicle.vin,
      brand: vehicle.brand,
      model: vehicle.model,
      generatedAt: new Date().toISOString(),
      preoperacionales: preops,
      tallerBitacora: tallerLog,
      telemetriaGps: gpsPoints,
    };

    const canonical = JSON.stringify(sections);
    const contentHash = createHash("sha256").update(canonical).digest("hex");
    const pdfBuffer = await this.renderEvidentiaryPdf(sections, contentHash);

    const uploadsDir = join(process.cwd(), "uploads", "juridico", organizationId);
    await mkdir(uploadsDir, { recursive: true });
    const code = `EXP-${plate.replace(/[^A-Z0-9]/g, "")}-${Date.now().toString(36).toUpperCase()}`;
    const fileName = `${code}.pdf`;
    const absPath = join(uploadsDir, fileName);
    await writeFile(absPath, pdfBuffer);
    const pdfRef = `uploads/juridico/${organizationId}/${fileName}`;

    const sealedAt = new Date();
    const pkg = await this.prisma.evidentiaryPackage.create({
      data: {
        organizationId,
        code,
        plate,
        vehicleId: vehicle.id,
        tripId: trips[0]?.id,
        contentHash,
        pdfRef,
        status: EvidentiaryPackageStatus.SEALED,
        sectionsJson: sections,
        preopCount: preops.length,
        gpsPointCount: gpsPoints.length,
        workOrderCount: tallerLog.length,
        generatedById: actorId,
        sealedAt,
        meta: {
          byteSize: pdfBuffer.length,
          immutable: true,
        },
      },
    });

    return {
      id: pkg.id,
      code: pkg.code,
      plate: pkg.plate,
      contentHash: pkg.contentHash,
      pdfRef: pkg.pdfRef,
      status: pkg.status,
      sealedAt: sealedAt.toISOString(),
      immutable: true,
      preopCount: pkg.preopCount,
      gpsPointCount: pkg.gpsPointCount,
      workOrderCount: pkg.workOrderCount,
      sections,
      message: "Expediente probatorio sellado — hash SHA-256 inmutable",
    };
  }

  /** Genera PDF inmutable (exportado para tests unitarios) */
  async renderEvidentiaryPdf(
    sections: {
      plate: string;
      generatedAt: string;
      preoperacionales: Array<Record<string, unknown>>;
      tallerBitacora: Array<Record<string, unknown>>;
      telemetriaGps: Array<Record<string, unknown>>;
      vin?: string | null;
      brand?: string;
      model?: string;
    },
    contentHash: string,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 48, size: "LETTER", compress: false });
      const chunks: Buffer[] = [];
      doc.on("data", (c) => chunks.push(c as Buffer));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      doc
        .fillColor("#0F172A")
        .fontSize(16)
        .text("INRETRANS OS — Expediente Probatorio Digital", { align: "left" });
      doc
        .moveDown(0.3)
        .fontSize(10)
        .fillColor("#64748B")
        .text("Legal Hub 4.0 · Paquete inmutable ante demanda");
      doc.moveDown();
      doc
        .fillColor("#0F172A")
        .font("Courier")
        .fontSize(12)
        .text(`Placa: ${sections.plate}`);
      if (sections.vin) {
        doc.text(`VIN: ${sections.vin}`);
      }
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#64748B")
        .text(
          `${sections.brand ?? ""} ${sections.model ?? ""} · Generado ${sections.generatedAt}`,
        );
      doc.moveDown();
      doc
        .fillColor("#0D9488")
        .font("Courier")
        .fontSize(9)
        .text(`SHA-256: ${contentHash}`);
      doc.moveDown();

      doc
        .font("Helvetica-Bold")
        .fillColor("#0F172A")
        .fontSize(12)
        .text("1. Preoperacionales firmados");
      doc.moveDown(0.3);
      if (!sections.preoperacionales.length) {
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor("#64748B")
          .text("Sin preoperacionales en ventana consultada.");
      }
      for (const p of sections.preoperacionales) {
        if (doc.y > 700) doc.addPage();
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor("#0F172A")
          .text(
            `${p.tripCode} · firmado ${p.signedAt} · aprobado=${p.approved} · frenos=${p.brakesOk} luces=${p.lightsOk} llantas=${p.tiresOk}`,
          );
      }

      doc.moveDown();
      doc
        .font("Helvetica-Bold")
        .fillColor("#0F172A")
        .fontSize(12)
        .text("2. Bitácora Taller 4.0");
      doc.moveDown(0.3);
      for (const w of sections.tallerBitacora) {
        if (doc.y > 700) doc.addPage();
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor("#0F172A")
          .text(
            `${w.code} [${w.status}] ${w.description} · apertura ${w.openedAt}`,
          );
      }
      if (!sections.tallerBitacora.length) {
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor("#64748B")
          .text("Sin órdenes de trabajo registradas.");
      }

      doc.moveDown();
      doc
        .font("Helvetica-Bold")
        .fillColor("#0F172A")
        .fontSize(12)
        .text("3. Telemetría GPS del evento");
      doc.moveDown(0.3);
      const gpsSample = sections.telemetriaGps.slice(0, 80);
      for (const g of gpsSample) {
        if (doc.y > 700) doc.addPage();
        doc
          .font("Courier")
          .fontSize(8)
          .fillColor("#0F172A")
          .text(
            `${g.recordedAt} · ${g.tripCode} · ${g.lat},${g.lng} · ${g.speedKph ?? "—"} km/h`,
          );
      }
      if (sections.telemetriaGps.length > gpsSample.length) {
        doc
          .font("Helvetica")
          .fontSize(8)
          .fillColor("#64748B")
          .text(
            `… +${sections.telemetriaGps.length - gpsSample.length} puntos en hash canónico`,
          );
      }
      if (!sections.telemetriaGps.length) {
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor("#64748B")
          .text("Sin puntos GPS en ventana consultada.");
      }

      doc.moveDown();
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor("#64748B")
        .text(
          "Documento sellado. Cualquier alteración invalida el hash SHA-256.",
        );

      doc.end();
    });
  }

  async consultaListas(
    organizationId: string,
    actorId: string,
    dto: SarlaftConsultaListasDto,
  ) {
    const result = await this.lists.screen(dto.document, dto.subjectName);
    const risk: SarlaftRisk =
      result.riskScore >= 80
        ? SarlaftRisk.HIGH
        : result.riskScore >= 50
          ? SarlaftRisk.MEDIUM
          : SarlaftRisk.LOW;

    const check = await this.prisma.sarlaftCheck.create({
      data: {
        organizationId,
        subjectName: dto.subjectName || dto.document,
        document: result.document,
        risk,
        riskScore: result.riskScore,
        listsMatched: result.hits.map((h) => h.list),
        status: result.matched
          ? SarlaftAlertStatus.PENDING
          : SarlaftAlertStatus.RESOLVED,
        notes: dto.plate
          ? `Consulta Legal Hub · placa ${dto.plate}`
          : "Consulta listas Clinton/Interpol/OFAC",
        graphPayload: {
          hits: result.hits,
          entityType: dto.entityType,
          plate: dto.plate,
          actorId,
        },
      },
    });

    return {
      id: check.id,
      document: result.document,
      matched: result.matched,
      riskScore: result.riskScore,
      risk,
      light:
        result.riskScore >= 80
          ? "RED"
          : result.riskScore >= 50
            ? "AMBER"
            : "GREEN",
      hits: result.hits,
      listsQueried: ["OFAC", "ONU", "PEPS", "NACIONAL", "CLINTON", "INTERPOL"],
      message: result.matched
        ? "Coincidencia en listas restrictivas — escalar compliance"
        : "Sin coincidencias en listas consultadas",
    };
  }

  async memorandoDescargos(
    organizationId: string,
    actorId: string,
    dto: DisciplinaryMemoDto,
  ) {
    let gpsEvidence: Array<Record<string, unknown>> = [];
    if (dto.tripId) {
      const points = await this.prisma.tripTrackPoint.findMany({
        where: { tripId: dto.tripId },
        orderBy: { recordedAt: "asc" },
        take: 200,
      });
      gpsEvidence = points.map((p) => ({
        lat: p.lat,
        lng: p.lng,
        speedKph: p.speedKph,
        recordedAt: p.recordedAt.toISOString(),
      }));
    } else if (dto.plate) {
      const vehicle = await this.prisma.vehicle.findFirst({
        where: {
          organizationId,
          plate: dto.plate.trim().toUpperCase(),
        },
      });
      if (vehicle) {
        const trip = await this.prisma.trip.findFirst({
          where: { organizationId, vehicleId: vehicle.id },
          orderBy: { departAt: "desc" },
          include: {
            trackPoints: {
              orderBy: { recordedAt: "asc" },
              take: 100,
            },
          },
        });
        gpsEvidence =
          trip?.trackPoints.map((p) => ({
            tripCode: trip.code,
            lat: p.lat,
            lng: p.lng,
            speedKph: p.speedKph,
            recordedAt: p.recordedAt.toISOString(),
          })) ?? [];
      }
    }

    const code = `MEM-${Date.now().toString(36).toUpperCase()}-${randomBytes(2).toString("hex").toUpperCase()}`;
    const memo = await this.prisma.disciplinaryMemo.create({
      data: {
        organizationId,
        code,
        subjectName: dto.subjectName,
        document: dto.document,
        plate: dto.plate?.trim().toUpperCase(),
        charge: dto.charge,
        gpsEvidence: gpsEvidence as object[],
        attachments: { tripId: dto.tripId ?? null },
        status: "ISSUED",
        createdById: actorId,
      },
    });

    return {
      id: memo.id,
      code: memo.code,
      subjectName: memo.subjectName,
      charge: memo.charge,
      gpsPointCount: gpsEvidence.length,
      gpsEvidence,
      status: memo.status,
      message: "Memorando de descargos emitido con evidencias GPS",
    };
  }
}
