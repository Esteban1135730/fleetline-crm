import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { SarlaftRisk } from "@fsg/db";
import { SARLAFT_BLOCK_RISKS } from "@fsg/shared";
import { PrismaService } from "../prisma/prisma.service";

function normalizeDoc(raw: string) {
  return raw.replace(/[\s.\-]/g, "").toUpperCase();
}

const FORCE_ROLES = new Set(["presidencia", "finanzas"]);

@Injectable()
export class SarlaftGuardService {
  constructor(private prisma: PrismaService) {}

  /**
   * Bloqueo operativo: HIGH/BLOCKED impiden operación.
   * Override blando: forceDespiteSarlaft + rol privilegiado → AuditLog.
   */
  async assertClear(params: {
    organizationId: string;
    subjectDoc: string;
    subjectName?: string;
    context: "CUSTOMER_CREATE" | "INVOICE_PAY";
    forceDespiteSarlaft?: boolean;
    actorUserId?: string;
    actorRole?: string;
  }) {
    const needle = normalizeDoc(params.subjectDoc || "");
    const nameNeedle = (params.subjectName || "").trim().toLowerCase();

    const checks = await this.prisma.sarlaftCheck.findMany({
      where: { organizationId: params.organizationId },
      orderBy: { checkedAt: "desc" },
      take: 200,
    });

    const hit = checks.find((c) => {
      if (needle && normalizeDoc(c.subjectDoc) === needle) return true;
      if (
        nameNeedle &&
        c.subjectName.trim().toLowerCase() === nameNeedle
      ) {
        return true;
      }
      return false;
    });
    if (!hit) return;

    const risk = hit.risk as string;
    if (!(SARLAFT_BLOCK_RISKS as readonly string[]).includes(risk)) {
      return;
    }

    if (params.forceDespiteSarlaft) {
      const role = String(params.actorRole || "").toLowerCase();
      if (!FORCE_ROLES.has(role)) {
        throw new ForbiddenException(
          "Override SARLAFT solo roles presidencia/finanzas",
        );
      }
      await this.prisma.auditLog.create({
        data: {
          action: "SARLAFT_FORCE_OVERRIDE",
          entity: params.context,
          entityId: hit.id,
          userId: params.actorUserId,
          meta: {
            organizationId: params.organizationId,
            subjectDoc: hit.subjectDoc,
            subjectName: hit.subjectName,
            risk,
            context: params.context,
          },
        },
      });
      return;
    }

    throw new BadRequestException(
      `Sujeto en lista de riesgo — uplink bloqueado (${risk}: ${hit.subjectName})`,
    );
  }

  async findLatestRisk(
    organizationId: string,
    subjectDoc: string,
  ): Promise<SarlaftRisk | null> {
    const needle = normalizeDoc(subjectDoc || "");
    if (!needle) return null;
    const checks = await this.prisma.sarlaftCheck.findMany({
      where: { organizationId },
      orderBy: { checkedAt: "desc" },
      take: 200,
    });
    const hit = checks.find((c) => normalizeDoc(c.subjectDoc) === needle);
    return hit?.risk ?? null;
  }
}
