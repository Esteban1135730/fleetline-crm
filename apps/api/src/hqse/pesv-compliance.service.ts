import { Injectable, Logger } from "@nestjs/common";
import {
  HqseAuditScope,
  HqseAuditStatus,
  IncidentSeverity,
  IncidentStatus,
  PesvControlStatus,
} from "@fsg/db";
import ExcelJS from "exceljs";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateAuditDto, PesvScorecardQuery } from "./dto/hqse.dto";
import { calculatePesvScorecard } from "./pesv.calc";

/**
 * Monitoreo PESV / ISO 39001 — matriz, capacitaciones, simulacros, preops.
 */
@Injectable()
export class PesvComplianceService {
  private readonly logger = new Logger(PesvComplianceService.name);

  constructor(private prisma: PrismaService) {}

  async scorecard(organizationId: string, query: PesvScorecardQuery) {
    const days = query.days ?? 90;
    const since = new Date();
    since.setDate(since.getDate() - days);
    const now = new Date();

    const [
      riskControlsTotal,
      riskControlsCompliant,
      driversTotal,
      validTrainings,
      drillsScheduled,
      drillsCompleted,
      preopsTotal,
      preopsApproved,
      openSevereIncidents,
      recentAudits,
    ] = await Promise.all([
      this.prisma.pesvRiskControl.count({ where: { organizationId } }),
      this.prisma.pesvRiskControl.count({
        where: {
          organizationId,
          status: PesvControlStatus.COMPLIANT,
        },
      }),
      this.prisma.driver.count({
        where: { organizationId, active: true },
      }),
      this.prisma.hqseTrainingRecord.findMany({
        where: {
          organizationId,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          completedAt: { gte: since },
        },
        select: { driverId: true },
        distinct: ["driverId"],
      }),
      this.prisma.hqseSafetyDrill.count({
        where: {
          organizationId,
          scheduledAt: { gte: since },
        },
      }),
      this.prisma.hqseSafetyDrill.count({
        where: {
          organizationId,
          scheduledAt: { gte: since },
          completedAt: { not: null },
        },
      }),
      this.prisma.preoperational.count({
        where: {
          signedAt: { gte: since },
          driver: { organizationId },
        },
      }),
      this.prisma.preoperational.count({
        where: {
          signedAt: { gte: since },
          approved: true,
          driver: { organizationId },
        },
      }),
      this.prisma.hqseIncident.count({
        where: {
          organizationId,
          severity: {
            in: [IncidentSeverity.SEVERE, IncidentSeverity.CRITICAL],
          },
          status: { not: IncidentStatus.CLOSED },
        },
      }),
      this.prisma.hqseAudit.findMany({
        where: {
          organizationId,
          auditedAt: { gte: since },
        },
        orderBy: { auditedAt: "desc" },
        take: 5,
        select: {
          id: true,
          code: true,
          scope: true,
          standard: true,
          score: true,
          nonConformities: true,
          auditedAt: true,
          status: true,
        },
      }),
    ]);

    const computed = calculatePesvScorecard({
      riskControlsTotal,
      riskControlsCompliant,
      driversTotal,
      driversWithValidTraining: validTrainings.length,
      drillsScheduled,
      drillsCompleted,
      preopsTotal,
      preopsApproved,
    });

    this.logger.log(
      `[PESV] scorecard org=${organizationId} score=${computed.overallScore} status=${computed.systemStatus}`,
    );

    return {
      periodDays: days,
      since: since.toISOString(),
      ...computed,
      openSevereIncidents,
      recentAudits,
      entities: {
        Supertransporte: true,
        Mintransporte: true,
        ISO39001: true,
      },
    };
  }

  async createAudit(organizationId: string, dto: CreateAuditDto) {
    const count = await this.prisma.hqseAudit.count({
      where: { organizationId },
    });
    return this.prisma.hqseAudit.create({
      data: {
        organizationId,
        code: `AUD-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`,
        title: dto.title,
        scope: (dto.scope as HqseAuditScope) || HqseAuditScope.INTERNAL,
        standard: dto.standard || "ISO_39001",
        auditedAt: dto.auditedAt || new Date(),
        findingsCount: dto.findingsCount ?? 0,
        nonConformities: dto.nonConformities ?? 0,
        score: dto.score,
        auditorName: dto.auditorName,
        notes: dto.notes,
        status: (dto.status as HqseAuditStatus) || HqseAuditStatus.CLOSED,
      },
    });
  }

  listAudits(organizationId: string) {
    return this.prisma.hqseAudit.findMany({
      where: { organizationId },
      orderBy: { auditedAt: "desc" },
    });
  }

  listRiskMatrix(organizationId: string) {
    return this.prisma.pesvRiskControl.findMany({
      where: { organizationId },
      orderBy: [{ category: "asc" }, { code: "asc" }],
    });
  }

  /**
   * Excel de auditoría PESV — scorecard, pilares, matriz de riesgo y auditorías.
   */
  async exportPesvAuditExcel(organizationId: string, days = 90) {
    const [scorecard, audits, risks, incidents] = await Promise.all([
      this.scorecard(organizationId, { days }),
      this.listAudits(organizationId),
      this.listRiskMatrix(organizationId),
      this.prisma.hqseIncident.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: {
          code: true,
          title: true,
          severity: true,
          status: true,
          kind: true,
          occurredAt: true,
          location: true,
          autoBlocked: true,
        },
      }),
    ]);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Inretrans OS · QHSE";
    workbook.created = new Date();

    const resume = workbook.addWorksheet("Scorecard PESV");
    resume.columns = [
      { header: "Campo", key: "k", width: 32 },
      { header: "Valor", key: "v", width: 48 },
    ];
    resume.addRows([
      { k: "Periodo (días)", v: scorecard.periodDays },
      { k: "Desde", v: scorecard.since },
      { k: "Score global", v: scorecard.overallScore },
      { k: "Estado sistema", v: scorecard.systemStatus },
      { k: "Marco regulatorio", v: scorecard.regulatorLabel },
      {
        k: "Incidentes severos abiertos",
        v: scorecard.openSevereIncidents,
      },
      {
        k: "Entidades",
        v: Object.keys(scorecard.entities || {})
          .filter((k) => (scorecard.entities as Record<string, boolean>)[k])
          .join(", "),
      },
    ]);
    this.styleHeader(resume);

    const pillars = workbook.addWorksheet("Pilares");
    pillars.columns = [
      { header: "Pilar", key: "label", width: 28 },
      { header: "Peso", key: "weight", width: 10 },
      { header: "Ratio", key: "ratio", width: 12 },
      { header: "Score", key: "score", width: 12 },
      { header: "Numerador", key: "numerator", width: 12 },
      { header: "Denominador", key: "denominator", width: 14 },
    ];
    for (const p of scorecard.pillars) {
      pillars.addRow({
        label: p.label,
        weight: p.weight,
        ratio: Number(p.ratio.toFixed(3)),
        score: Number(p.score.toFixed(2)),
        numerator: p.numerator,
        denominator: p.denominator,
      });
    }
    this.styleHeader(pillars);

    const auditSheet = workbook.addWorksheet("Auditorías");
    auditSheet.columns = [
      { header: "Código", key: "code", width: 16 },
      { header: "Título", key: "title", width: 36 },
      { header: "Alcance", key: "scope", width: 14 },
      { header: "Estándar", key: "standard", width: 14 },
      { header: "Score", key: "score", width: 10 },
      { header: "Hallazgos", key: "findingsCount", width: 12 },
      { header: "No conformidades", key: "nonConformities", width: 16 },
      { header: "Estado", key: "status", width: 12 },
      { header: "Auditor", key: "auditorName", width: 22 },
      { header: "Fecha", key: "auditedAt", width: 22 },
    ];
    for (const a of audits) {
      auditSheet.addRow({
        code: a.code,
        title: a.title,
        scope: a.scope,
        standard: a.standard,
        score: a.score ?? "",
        findingsCount: a.findingsCount,
        nonConformities: a.nonConformities,
        status: a.status,
        auditorName: a.auditorName ?? "",
        auditedAt: a.auditedAt?.toISOString() ?? "",
      });
    }
    this.styleHeader(auditSheet);

    const riskSheet = workbook.addWorksheet("Matriz de riesgo");
    riskSheet.columns = [
      { header: "Código", key: "code", width: 14 },
      { header: "Categoría", key: "category", width: 18 },
      { header: "Control", key: "title", width: 40 },
      { header: "Estado", key: "status", width: 14 },
      { header: "Riesgo residual", key: "residualRisk", width: 16 },
      { header: "Última revisión", key: "lastReviewedAt", width: 22 },
      { header: "Descripción", key: "description", width: 40 },
    ];
    for (const r of risks) {
      riskSheet.addRow({
        code: r.code,
        category: r.category,
        title: r.title,
        status: r.status,
        residualRisk: r.residualRisk,
        lastReviewedAt: r.lastReviewedAt?.toISOString() ?? "",
        description: r.description ?? "",
      });
    }
    this.styleHeader(riskSheet);

    const incSheet = workbook.addWorksheet("Incidentes QHSE");
    incSheet.columns = [
      { header: "Código", key: "code", width: 14 },
      { header: "Título", key: "title", width: 36 },
      { header: "Tipo", key: "kind", width: 18 },
      { header: "Severidad", key: "severity", width: 12 },
      { header: "Estado", key: "status", width: 12 },
      { header: "Ubicación", key: "location", width: 24 },
      { header: "Ocurrencia", key: "occurredAt", width: 22 },
      { header: "Auto-bloqueo", key: "autoBlocked", width: 12 },
    ];
    for (const i of incidents) {
      incSheet.addRow({
        code: i.code,
        title: i.title,
        kind: i.kind,
        severity: i.severity,
        status: i.status,
        location: i.location ?? "",
        occurredAt: i.occurredAt?.toISOString() ?? "",
        autoBlocked: i.autoBlocked ? "SÍ" : "NO",
      });
    }
    this.styleHeader(incSheet);

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const stamp = new Date().toISOString().slice(0, 10);
    return {
      buffer,
      filename: `pesv-auditoria-${stamp}.xlsx`,
    };
  }

  private styleHeader(ws: ExcelJS.Worksheet) {
    const row = ws.getRow(1);
    row.font = { bold: true, color: { argb: "FFF8FAFC" } };
    row.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F172A" },
    };
    row.alignment = { vertical: "middle" };
  }
}
