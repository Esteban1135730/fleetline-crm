import { Injectable } from "@nestjs/common";
import { FleetModule } from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";
import type { AuditTrailQueryDto } from "./dto/audit-trail-query.dto";

/**
 * Ledger forense — consume AuditLog + ExecutiveQueryLog (inmutable).
 */
@Injectable()
export class RevisoriaForenseService {
  constructor(private prisma: PrismaService) {}

  async auditTrail(organizationId: string, query: AuditTrailQueryDto) {
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    const createdAt =
      from || to
        ? {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          }
        : undefined;

    const moduleFilter = query.module
      ? (String(query.module).toUpperCase() as FleetModule)
      : undefined;

    const [auditLogs, executiveQueries] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: {
          organizationId,
          ...(query.userId ? { userId: query.userId } : {}),
          ...(moduleFilter ? { module: moduleFilter } : {}),
          ...(createdAt ? { createdAt } : {}),
        },
        include: {
          user: { select: { id: true, email: true, name: true, role: true } },
        },
        orderBy: { createdAt: "desc" },
        take: query.limit ?? 200,
      }),
      this.prisma.executiveQueryLog.findMany({
        where: {
          organizationId,
          ...(query.userId ? { userId: query.userId } : {}),
          ...(createdAt ? { createdAt } : {}),
        },
        include: {
          user: { select: { id: true, email: true, name: true, role: true } },
        },
        orderBy: { createdAt: "desc" },
        take: query.limit ?? 200,
      }),
    ]);

    const trail = [
      ...auditLogs.map((row) => ({
        kind: "AUDIT_LOG" as const,
        id: row.id,
        at: row.createdAt,
        module: row.module,
        action: row.action,
        entity: row.entity,
        entityId: row.entityId,
        userId: row.userId,
        user: row.user,
        meta: row.meta,
        immutable: true,
      })),
      ...executiveQueries.map((row) => ({
        kind: "EXECUTIVE_QUERY" as const,
        id: row.id,
        at: row.createdAt,
        module: FleetModule.PRESIDENCIA,
        action: "TEXT_TO_SQL",
        entity: "ExecutiveQueryLog",
        entityId: row.id,
        userId: row.userId,
        user: row.user,
        meta: {
          utterance: row.utterance,
          generatedSql: row.generatedSql,
          answerText: row.answerText,
        },
        immutable: true,
      })),
    ].sort((a, b) => b.at.getTime() - a.at.getTime());

    return {
      organizationId,
      filters: {
        from: from?.toISOString() ?? null,
        to: to?.toISOString() ?? null,
        userId: query.userId ?? null,
        module: moduleFilter ?? null,
      },
      count: trail.length,
      trail,
    };
  }
}
