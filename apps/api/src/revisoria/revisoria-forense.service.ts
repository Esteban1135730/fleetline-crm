import { Injectable } from "@nestjs/common";
import { FleetModule } from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";
import type { AuditTrailQueryDto } from "./dto/audit-trail-query.dto";

function clip(value: unknown): string {
  if (value == null) return "—";
  const text =
    typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 96 ? `${text.slice(0, 93)}…` : text;
}

/** Valor anterior / nuevo cuando el meta trae el diff; si no, un resumen corto. */
function valuePair(meta: unknown): { before: string; after: string } {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return { before: "—", after: "—" };
  }
  const row = meta as Record<string, unknown>;
  const before =
    row.before ?? row.previous ?? row.oldValue ?? row.valorAnterior;
  const after = row.after ?? row.next ?? row.newValue ?? row.valorNuevo;
  if (before == null && after == null) {
    const keys = Object.keys(row).slice(0, 3);
    return {
      before: "—",
      after: keys.length
        ? keys.map((key) => `${key}: ${clip(row[key])}`).join(" · ")
        : "—",
    };
  }
  return { before: clip(before), after: clip(after) };
}

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
      ...auditLogs.map((row) => {
        const values = valuePair(row.meta);
        return {
          kind: "AUDIT_LOG" as const,
          id: row.id,
          at: row.createdAt,
          module: row.module,
          action: row.action,
          entity: row.entity,
          entityId: row.entityId,
          ipAddress: row.ipAddress,
          userId: row.userId,
          user: row.user,
          before: values.before,
          after: values.after,
          meta: row.meta,
          immutable: true,
        };
      }),
      ...executiveQueries.map((row) => ({
        kind: "EXECUTIVE_QUERY" as const,
        id: row.id,
        at: row.createdAt,
        module: FleetModule.PRESIDENCIA,
        action: "TEXT_TO_SQL",
        entity: "ExecutiveQueryLog",
        entityId: row.id,
        ipAddress: null,
        userId: row.userId,
        user: row.user,
        before: "—",
        after: clip(row.utterance),
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
