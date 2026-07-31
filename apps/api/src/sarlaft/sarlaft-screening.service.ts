import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import {
  FleetModule,
  SarlaftAlertStatus,
  SarlaftEntityType,
  SarlaftRisk,
} from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";
import {
  RestrictiveListsClient,
  normalizeSarlaftDoc,
} from "./restrictive-lists.client";
import type {
  ResolveAlertDto,
  SarlaftScreenEntityType,
  ScreenEntityDto,
} from "./dto/sarlaft.dto";

export const SARLAFT_BLOCK_SCORE = 80;

function riskFromScore(score: number, matched: boolean): SarlaftRisk {
  if (score >= 90 || (matched && score >= SARLAFT_BLOCK_SCORE)) {
    return SarlaftRisk.BLOCKED;
  }
  if (score >= SARLAFT_BLOCK_SCORE) return SarlaftRisk.HIGH;
  if (score >= 50) return SarlaftRisk.MEDIUM;
  return SarlaftRisk.LOW;
}

@Injectable()
export class SarlaftScreeningService {
  constructor(
    private prisma: PrismaService,
    private lists: RestrictiveListsClient,
  ) {}

  /**
   * Verifica contraparte en listas restrictivas y persiste hallazgo.
   * Si score >= 80 o match crítico → sarlaftBlocked = true en la entidad.
   */
  async screenEntity(
    organizationId: string,
    type: SarlaftScreenEntityType,
    entityId: string | null | undefined,
    taxIdOrDocument: string,
    opts?: { subjectName?: string; actorUserId?: string },
  ) {
    const entityType = type as SarlaftEntityType;
    const resolved = await this.resolveEntity(
      organizationId,
      entityType,
      entityId,
      taxIdOrDocument,
      opts?.subjectName,
    );

    const screen = await this.lists.screen(
      resolved.document,
      resolved.subjectName,
    );
    const risk = riskFromScore(screen.riskScore, screen.matched);
    const shouldBlock =
      screen.riskScore >= SARLAFT_BLOCK_SCORE ||
      risk === SarlaftRisk.BLOCKED ||
      risk === SarlaftRisk.HIGH;

    if (shouldBlock && resolved.entityId) {
      await this.applyEntityBlock(
        entityType,
        resolved.entityId,
        true,
        screen.riskScore,
      );
    }

    const alert = await this.prisma.sarlaftCheck.create({
      data: {
        organizationId,
        subjectName: resolved.subjectName,
        document: normalizeSarlaftDoc(resolved.document),
        risk,
        riskScore: screen.riskScore,
        entityType,
        entityId: resolved.entityId,
        listsMatched: screen.hits.map((h) => h.list),
        status: shouldBlock
          ? SarlaftAlertStatus.PENDING
          : SarlaftAlertStatus.RESOLVED,
        notes: shouldBlock
          ? "Hallazgo automático — pendiente Oficial de Cumplimiento"
          : "Screening sin bloqueo",
        graphPayload: {
          hits: screen.hits,
          screenedAt: new Date().toISOString(),
          blocked: shouldBlock,
        },
        customerId:
          entityType === SarlaftEntityType.CUSTOMER
            ? resolved.entityId
            : undefined,
        resolvedAt: shouldBlock ? undefined : new Date(),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId,
        action: "SARLAFT_SCREEN",
        entity: "SarlaftCheck",
        entityId: alert.id,
        module: FleetModule.SARLAFT,
        userId: opts?.actorUserId,
        meta: {
          entityType,
          entityId: resolved.entityId,
          document: alert.document,
          riskScore: screen.riskScore,
          risk,
          blocked: shouldBlock,
          lists: screen.hits.map((h) => h.list),
        },
      },
    });

    return {
      alert,
      screening: screen,
      sarlaftBlocked: shouldBlock,
      threshold: SARLAFT_BLOCK_SCORE,
    };
  }

  screenManual(organizationId: string, dto: ScreenEntityDto, actorUserId?: string) {
    return this.screenEntity(
      organizationId,
      dto.type,
      dto.entityId,
      dto.taxIdOrDocument,
      { subjectName: dto.subjectName, actorUserId },
    );
  }

  listAlerts(
    organizationId: string,
    status?: SarlaftAlertStatus,
  ) {
    return this.prisma.sarlaftCheck.findMany({
      where: {
        organizationId,
        ...(status
          ? { status }
          : {
              status: {
                in: [
                  SarlaftAlertStatus.PENDING,
                  SarlaftAlertStatus.UNDER_REVIEW,
                ],
              },
            }),
      },
      include: {
        resolvedBy: { select: { id: true, email: true, name: true } },
      },
      orderBy: [{ riskScore: "desc" }, { createdAt: "desc" }],
      take: 200,
    });
  }

  async resolveAlert(
    organizationId: string,
    alertId: string,
    userId: string,
    dto: ResolveAlertDto,
  ) {
    const alert = await this.prisma.sarlaftCheck.findFirst({
      where: { id: alertId, organizationId },
    });
    if (!alert) throw new NotFoundException("Alerta SARLAFT no encontrada");
    if (
      alert.status === SarlaftAlertStatus.RESOLVED ||
      alert.status === SarlaftAlertStatus.DISMISSED
    ) {
      throw new BadRequestException("La alerta ya fue cerrada");
    }

    const status =
      dto.resolution === "DISMISSED"
        ? SarlaftAlertStatus.DISMISSED
        : SarlaftAlertStatus.RESOLVED;

    const updated = await this.prisma.sarlaftCheck.update({
      where: { id: alert.id },
      data: {
        status,
        resolvedAt: new Date(),
        resolvedById: userId,
        resolutionNotes: dto.notes,
      },
    });

    if (
      dto.clearBlock &&
      dto.resolution === "RESOLVED" &&
      alert.entityType &&
      alert.entityId
    ) {
      await this.applyEntityBlock(alert.entityType, alert.entityId, false, 0);
    }

    await this.prisma.auditLog.create({
      data: {
        organizationId,
        action: "SARLAFT_ALERT_RESOLVE",
        entity: "SarlaftCheck",
        entityId: alert.id,
        module: FleetModule.SARLAFT,
        userId,
        meta: {
          resolution: dto.resolution,
          notes: dto.notes,
          clearBlock: dto.clearBlock,
          previousStatus: alert.status,
          document: alert.document,
          entityType: alert.entityType,
          entityId: alert.entityId,
        },
      },
    });

    return updated;
  }

  private async resolveEntity(
    organizationId: string,
    entityType: SarlaftEntityType,
    entityId: string | null | undefined,
    taxIdOrDocument: string,
    subjectName?: string,
  ): Promise<{ entityId: string | null; document: string; subjectName: string }> {
    if (entityType === SarlaftEntityType.SUPPLIER) {
      if (!entityId) {
        return {
          entityId: null,
          document: taxIdOrDocument,
          subjectName: subjectName || taxIdOrDocument,
        };
      }
      const s = await this.prisma.supplier.findFirst({
        where: { id: entityId, organizationId },
      });
      if (!s) throw new NotFoundException("Proveedor no encontrado");
      return {
        entityId: s.id,
        document: taxIdOrDocument || s.nit,
        subjectName: subjectName || s.name,
      };
    }

    if (entityType === SarlaftEntityType.EMPLOYEE) {
      if (!entityId) {
        return {
          entityId: null,
          document: taxIdOrDocument,
          subjectName: subjectName || taxIdOrDocument,
        };
      }
      const e = await this.prisma.employee.findFirst({
        where: { id: entityId, organizationId },
      });
      if (!e) throw new NotFoundException("Empleado no encontrado");
      return {
        entityId: e.id,
        document: taxIdOrDocument || e.document,
        subjectName: subjectName || e.name,
      };
    }

    if (entityType === SarlaftEntityType.CUSTOMER) {
      if (!entityId) {
        return {
          entityId: null,
          document: taxIdOrDocument,
          subjectName: subjectName || taxIdOrDocument,
        };
      }
      const c = await this.prisma.customer.findFirst({
        where: { id: entityId, organizationId },
      });
      if (!c) throw new NotFoundException("Cliente no encontrado");
      return {
        entityId: c.id,
        document: taxIdOrDocument || c.nit,
        subjectName: subjectName || c.name,
      };
    }

    // THIRD_PARTY — beneficiario tesorería / tercero sin ficha maestra
    return {
      entityId: entityId || null,
      document: taxIdOrDocument,
      subjectName: subjectName || taxIdOrDocument,
    };
  }

  private async applyEntityBlock(
    entityType: SarlaftEntityType,
    entityId: string,
    blocked: boolean,
    riskScore: number,
  ) {
    const data = { sarlaftBlocked: blocked, sarlaftRiskScore: riskScore };
    if (entityType === SarlaftEntityType.SUPPLIER) {
      await this.prisma.supplier.update({ where: { id: entityId }, data });
      return;
    }
    if (entityType === SarlaftEntityType.EMPLOYEE) {
      await this.prisma.employee.update({ where: { id: entityId }, data });
      return;
    }
    if (entityType === SarlaftEntityType.CUSTOMER) {
      await this.prisma.customer.update({ where: { id: entityId }, data });
    }
  }
}
