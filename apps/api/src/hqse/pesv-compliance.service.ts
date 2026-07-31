import { Injectable, Logger } from "@nestjs/common";
import {
  HqseAuditScope,
  HqseAuditStatus,
  IncidentSeverity,
  IncidentStatus,
  PesvControlStatus,
} from "@fsg/db";
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
}
