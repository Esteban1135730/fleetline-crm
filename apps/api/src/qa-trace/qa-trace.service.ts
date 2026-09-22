import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma } from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";
import type { QaEventIngestDto, QaSessionsQueryDto } from "./dto/qa-trace.dto";
import {
  coverageScore,
  isQaTraceEnabled,
  moduleKeyFromPath,
  QA_EXPECTED_MODULES,
} from "./qa-trace.util";

type Actor = {
  userId?: string;
  email?: string;
  name?: string;
  organizationId?: string;
};

@Injectable()
export class QaTraceService {
  private readonly log = new Logger(QaTraceService.name);

  constructor(private prisma: PrismaService) {}

  enabled() {
    return isQaTraceEnabled();
  }

  async ingest(
    actor: Actor,
    dto: QaEventIngestDto,
    ipAddress: string | null,
    userAgent: string | null,
  ) {
    if (!this.enabled()) {
      return { ok: false, disabled: true as const };
    }

    const moduleKey = moduleKeyFromPath(dto.path);
    const sessionId = dto.sessionId?.trim() || undefined;

    let session = sessionId
      ? await this.prisma.qaSession.findUnique({ where: { id: sessionId } })
      : null;

    const isRoute = dto.kind === "route";
    const isAction = dto.kind === "action";
    const initialModules =
      moduleKey && moduleKey !== "qa-trace" && moduleKey !== "login"
        ? [moduleKey]
        : [];

    if (!session) {
      session = await this.prisma.qaSession.create({
        data: {
          id: sessionId,
          organizationId: actor.organizationId,
          userId: actor.userId,
          userEmail: actor.email,
          userName: actor.name,
          ipAddress: ipAddress ?? undefined,
          userAgent: userAgent?.slice(0, 400) ?? undefined,
          routeCount: isRoute ? 1 : 0,
          actionCount: isAction ? 1 : 0,
          modulesTouched: initialModules,
          endedAt: dto.kind === "session_end" ? new Date() : undefined,
        },
      });
    } else {
      const touched = new Set(session.modulesTouched);
      if (moduleKey && moduleKey !== "qa-trace" && moduleKey !== "login") {
        touched.add(moduleKey);
      }
      session = await this.prisma.qaSession.update({
        where: { id: session.id },
        data: {
          lastSeenAt: new Date(),
          ipAddress: ipAddress ?? session.ipAddress,
          userAgent: userAgent?.slice(0, 400) ?? session.userAgent,
          userEmail: actor.email ?? session.userEmail,
          userName: actor.name ?? session.userName,
          userId: actor.userId ?? session.userId,
          organizationId: actor.organizationId ?? session.organizationId,
          routeCount: isRoute ? { increment: 1 } : undefined,
          actionCount: isAction ? { increment: 1 } : undefined,
          modulesTouched: [...touched],
          endedAt: dto.kind === "session_end" ? new Date() : undefined,
        },
      });
    }

    const event = await this.prisma.qaEvent.create({
      data: {
        sessionId: session.id,
        kind: dto.kind,
        path: dto.path?.slice(0, 500),
        method: dto.method?.slice(0, 16),
        moduleKey: moduleKey ?? undefined,
        meta: (dto.meta as Prisma.InputJsonValue) ?? undefined,
        ipAddress: ipAddress ?? undefined,
      },
    });

    return {
      ok: true as const,
      sessionId: session.id,
      eventId: event.id,
      modulesTouched: session.modulesTouched,
      coverage: coverageScore(session.modulesTouched),
    };
  }

  async listSessions(query: QaSessionsQueryDto) {
    const where: Prisma.QaSessionWhereInput = {};
    if (query.email) where.userEmail = query.email.toLowerCase();
    if (query.from || query.to) {
      where.startedAt = {};
      if (query.from) where.startedAt.gte = new Date(query.from);
      if (query.to) where.startedAt.lte = new Date(query.to);
    }

    const rows = await this.prisma.qaSession.findMany({
      where,
      orderBy: { lastSeenAt: "desc" },
      take: query.limit,
      include: {
        _count: { select: { events: true } },
      },
    });

    return {
      expectedModules: [...QA_EXPECTED_MODULES],
      sessions: rows.map((s) => {
        const cov = coverageScore(s.modulesTouched);
        const durationMs = Math.max(
          0,
          (s.endedAt ?? s.lastSeenAt).getTime() - s.startedAt.getTime(),
        );
        return {
          id: s.id,
          userEmail: s.userEmail,
          userName: s.userName,
          ipAddress: s.ipAddress,
          startedAt: s.startedAt.toISOString(),
          lastSeenAt: s.lastSeenAt.toISOString(),
          endedAt: s.endedAt?.toISOString() ?? null,
          durationMs,
          routeCount: s.routeCount,
          actionCount: s.actionCount,
          eventCount: s._count.events,
          modulesTouched: s.modulesTouched,
          coverage: cov,
          verdict: this.verdict(cov.score, s.actionCount, s.routeCount),
        };
      }),
    };
  }

  async sessionDetail(id: string) {
    const s = await this.prisma.qaSession.findUnique({
      where: { id },
      include: {
        events: { orderBy: { createdAt: "asc" }, take: 2000 },
      },
    });
    if (!s) throw new NotFoundException("Sesión QA no encontrada");
    const cov = coverageScore(s.modulesTouched);
    return {
      id: s.id,
      userEmail: s.userEmail,
      userName: s.userName,
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      startedAt: s.startedAt.toISOString(),
      lastSeenAt: s.lastSeenAt.toISOString(),
      endedAt: s.endedAt?.toISOString() ?? null,
      routeCount: s.routeCount,
      actionCount: s.actionCount,
      modulesTouched: s.modulesTouched,
      coverage: cov,
      verdict: this.verdict(cov.score, s.actionCount, s.routeCount),
      expectedModules: [...QA_EXPECTED_MODULES],
      events: s.events.map((e) => ({
        id: e.id,
        kind: e.kind,
        path: e.path,
        method: e.method,
        moduleKey: e.moduleKey,
        ipAddress: e.ipAddress,
        meta: e.meta,
        at: e.createdAt.toISOString(),
      })),
    };
  }

  async overview() {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const sessions = await this.prisma.qaSession.findMany({
      where: { startedAt: { gte: since } },
      orderBy: { lastSeenAt: "desc" },
      take: 200,
    });
    const byEmail = new Map<
      string,
      { sessions: number; avgScore: number; actions: number; routes: number }
    >();
    for (const s of sessions) {
      const email = (s.userEmail || "anon").toLowerCase();
      const cov = coverageScore(s.modulesTouched);
      const prev = byEmail.get(email) || {
        sessions: 0,
        avgScore: 0,
        actions: 0,
        routes: 0,
      };
      const n = prev.sessions + 1;
      byEmail.set(email, {
        sessions: n,
        avgScore: Math.round((prev.avgScore * prev.sessions + cov.score) / n),
        actions: prev.actions + s.actionCount,
        routes: prev.routes + s.routeCount,
      });
    }
    return {
      enabled: this.enabled(),
      windowDays: 7,
      sessionCount: sessions.length,
      testers: [...byEmail.entries()].map(([email, v]) => ({ email, ...v })),
      expectedModules: [...QA_EXPECTED_MODULES],
    };
  }

  private verdict(
    score: number,
    actionCount: number,
    routeCount: number,
  ): "COMPLETE" | "PARTIAL" | "SHALLOW" {
    if (score >= 60 && actionCount >= 5) return "COMPLETE";
    if (routeCount >= 3 || actionCount >= 1) return "PARTIAL";
    return "SHALLOW";
  }

  /** Fire-and-forget from interceptor — never throws to caller. */
  async safeIngestFromApi(
    actor: Actor,
    path: string,
    method: string,
    ipAddress: string | null,
    userAgent: string | null,
    sessionId?: string,
  ) {
    try {
      if (!this.enabled()) return;
      if (/qa-trace|\/health\b|\/auth\/login/i.test(path)) return;
      await this.ingest(
        actor,
        {
          sessionId,
          kind: "action",
          path,
          method,
          meta: { source: "api_interceptor" },
        },
        ipAddress,
        userAgent,
      );
    } catch (err) {
      this.log.warn(`QA ingest skip: ${String(err)}`);
    }
  }
}
