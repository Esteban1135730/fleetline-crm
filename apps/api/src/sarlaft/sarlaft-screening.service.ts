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
  LiberarBloqueoDto,
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

  /**
   * Cuarentena Oficial: maestros con sarlaftBlocked + alertas abiertas
   * HIGH/BLOCKED (aunque aún no tengan ficha maestra / entityId).
   * Así coinciden con lo que la matriz muestra como «BLOQUEADO» pendiente.
   */
  async listBlocked(organizationId: string) {
    const [customers, suppliers, employees, openAlerts] = await Promise.all([
      this.prisma.customer.findMany({
        where: { organizationId, sarlaftBlocked: true },
        select: {
          id: true,
          name: true,
          nit: true,
          email: true,
          phone: true,
          sarlaftRiskScore: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: "desc" },
        take: 200,
      }),
      this.prisma.supplier.findMany({
        where: { organizationId, sarlaftBlocked: true },
        select: {
          id: true,
          name: true,
          nit: true,
          email: true,
          phone: true,
          sarlaftRiskScore: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: "desc" },
        take: 200,
      }),
      this.prisma.employee.findMany({
        where: { organizationId, sarlaftBlocked: true },
        select: {
          id: true,
          name: true,
          document: true,
          email: true,
          phone: true,
          sarlaftRiskScore: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: "desc" },
        take: 200,
      }),
      this.prisma.sarlaftCheck.findMany({
        where: {
          organizationId,
          status: {
            in: [SarlaftAlertStatus.PENDING, SarlaftAlertStatus.UNDER_REVIEW],
          },
        },
        orderBy: [{ riskScore: "desc" }, { createdAt: "desc" }],
        take: 400,
      }),
    ]);

    type Row = {
      entityType: SarlaftEntityType;
      entityId: string | null;
      subjectName: string;
      document: string;
      email?: string | null;
      phone?: string | null;
      riskScore: number;
      updatedAt: string;
      openAlertId: string | null;
      alertRisk: string | null;
      alertStatus: string | null;
      listsMatched: string[];
      notes: string | null;
      /** MASTER = hard-lock en ficha; ALERT = cuarentena por hallazgo pendiente */
      source: "MASTER" | "ALERT";
      hardLocked: boolean;
    };

    const rows: Row[] = [];
    const seenEntity = new Set<string>();
    const seenAlert = new Set<string>();

    const alertByEntity = new Map<string, (typeof openAlerts)[number]>();
    for (const a of openAlerts) {
      if (!a.entityType || !a.entityId) continue;
      const key = `${a.entityType}:${a.entityId}`;
      if (!alertByEntity.has(key)) alertByEntity.set(key, a);
    }

    for (const c of customers) {
      const key = `${SarlaftEntityType.CUSTOMER}:${c.id}`;
      seenEntity.add(key);
      const alert = alertByEntity.get(key);
      if (alert) seenAlert.add(alert.id);
      rows.push({
        entityType: SarlaftEntityType.CUSTOMER,
        entityId: c.id,
        subjectName: c.name,
        document: c.nit,
        email: c.email,
        phone: c.phone,
        riskScore: c.sarlaftRiskScore ?? alert?.riskScore ?? 0,
        updatedAt: c.updatedAt.toISOString(),
        openAlertId: alert?.id ?? null,
        alertRisk: alert?.risk ?? SarlaftRisk.BLOCKED,
        alertStatus: alert?.status ?? null,
        listsMatched: alert?.listsMatched ?? [],
        notes: alert?.notes ?? null,
        source: "MASTER",
        hardLocked: true,
      });
    }
    for (const s of suppliers) {
      const key = `${SarlaftEntityType.SUPPLIER}:${s.id}`;
      seenEntity.add(key);
      const alert = alertByEntity.get(key);
      if (alert) seenAlert.add(alert.id);
      rows.push({
        entityType: SarlaftEntityType.SUPPLIER,
        entityId: s.id,
        subjectName: s.name,
        document: s.nit,
        email: s.email,
        phone: s.phone,
        riskScore: s.sarlaftRiskScore ?? alert?.riskScore ?? 0,
        updatedAt: s.updatedAt.toISOString(),
        openAlertId: alert?.id ?? null,
        alertRisk: alert?.risk ?? SarlaftRisk.BLOCKED,
        alertStatus: alert?.status ?? null,
        listsMatched: alert?.listsMatched ?? [],
        notes: alert?.notes ?? null,
        source: "MASTER",
        hardLocked: true,
      });
    }
    for (const e of employees) {
      const key = `${SarlaftEntityType.EMPLOYEE}:${e.id}`;
      seenEntity.add(key);
      const alert = alertByEntity.get(key);
      if (alert) seenAlert.add(alert.id);
      rows.push({
        entityType: SarlaftEntityType.EMPLOYEE,
        entityId: e.id,
        subjectName: e.name,
        document: e.document,
        email: e.email,
        phone: e.phone,
        riskScore: e.sarlaftRiskScore ?? alert?.riskScore ?? 0,
        updatedAt: e.updatedAt.toISOString(),
        openAlertId: alert?.id ?? null,
        alertRisk: alert?.risk ?? SarlaftRisk.BLOCKED,
        alertStatus: alert?.status ?? null,
        listsMatched: alert?.listsMatched ?? [],
        notes: alert?.notes ?? null,
        source: "MASTER",
        hardLocked: true,
      });
    }

    // Alertas abiertas de la matriz (BLOQUEADO/ALTO) aún sin hard-lock o sin ficha
    for (const a of openAlerts) {
      if (seenAlert.has(a.id)) continue;
      const isQuarantine =
        a.risk === SarlaftRisk.BLOCKED ||
        a.risk === SarlaftRisk.HIGH ||
        (a.riskScore ?? 0) >= SARLAFT_BLOCK_SCORE;
      if (!isQuarantine) continue;

      if (a.entityType && a.entityId) {
        const key = `${a.entityType}:${a.entityId}`;
        if (seenEntity.has(key)) continue;
        seenEntity.add(key);
      }
      seenAlert.add(a.id);

      rows.push({
        entityType: (a.entityType as SarlaftEntityType) || SarlaftEntityType.THIRD_PARTY,
        entityId: a.entityId,
        subjectName: a.subjectName,
        document: a.document,
        riskScore: a.riskScore ?? 0,
        updatedAt: (a.updatedAt ?? a.createdAt).toISOString(),
        openAlertId: a.id,
        alertRisk: a.risk,
        alertStatus: a.status,
        listsMatched: a.listsMatched ?? [],
        notes: a.notes,
        source: "ALERT",
        hardLocked: false,
      });
    }

    rows.sort((a, b) => b.riskScore - a.riskScore);

    return {
      items: rows,
      totals: {
        all: rows.length,
        customers: rows.filter((r) => r.entityType === SarlaftEntityType.CUSTOMER)
          .length,
        suppliers: rows.filter((r) => r.entityType === SarlaftEntityType.SUPPLIER)
          .length,
        employees: rows.filter((r) => r.entityType === SarlaftEntityType.EMPLOYEE)
          .length,
        alertsOnly: rows.filter((r) => r.source === "ALERT").length,
        hardLocked: rows.filter((r) => r.hardLocked).length,
      },
    };
  }

  /**
   * Libera bloqueo SARLAFT con justificación obligatoria (Oficial de Cumplimiento).
   * Cierra alerta abierta y limpia flags en el maestro cuando aplica.
   */
  async liberarBloqueo(
    organizationId: string,
    userId: string,
    dto: LiberarBloqueoDto,
  ) {
    // 1) Liberación directa por alerta (matriz → cuarentena)
    if (dto.alertId) {
      return this.resolveAlert(organizationId, dto.alertId, userId, {
        resolution: "RESOLVED",
        notes: dto.notes,
        clearBlock: true,
      });
    }

    const entityType = dto.entityType as SarlaftEntityType;
    const entityId = dto.entityId!;
    if (entityType === SarlaftEntityType.THIRD_PARTY) {
      throw new BadRequestException(
        "Terceros sin ficha: indique alertId de la consulta pendiente",
      );
    }

    const open = await this.prisma.sarlaftCheck.findFirst({
      where: {
        organizationId,
        entityType,
        entityId,
        status: {
          in: [SarlaftAlertStatus.PENDING, SarlaftAlertStatus.UNDER_REVIEW],
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (open) {
      return this.resolveAlert(organizationId, open.id, userId, {
        resolution: "RESOLVED",
        notes: dto.notes,
        clearBlock: true,
      });
    }

    // Bloqueo huérfano (flag sin alerta abierta): limpia maestro + auditoría
    const resolved = await this.resolveEntity(
      organizationId,
      entityType,
      entityId,
      entityId,
    );
    await this.applyEntityBlock(entityType, entityId, false, 0);

    const check = await this.prisma.sarlaftCheck.create({
      data: {
        organizationId,
        subjectName: resolved.subjectName,
        document: normalizeSarlaftDoc(resolved.document),
        risk: SarlaftRisk.LOW,
        riskScore: 0,
        entityType,
        entityId,
        status: SarlaftAlertStatus.RESOLVED,
        notes: "Liberación de bloqueo sin alerta abierta",
        resolutionNotes: dto.notes,
        resolvedAt: new Date(),
        resolvedById: userId,
        customerId:
          entityType === SarlaftEntityType.CUSTOMER ? entityId : undefined,
        graphPayload: { liberatedWithoutOpenAlert: true },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId,
        action: "SARLAFT_BLOCK_CLEAR",
        entity: entityType,
        entityId,
        module: FleetModule.SARLAFT,
        userId,
        meta: {
          notes: dto.notes,
          checkId: check.id,
          orphanBlock: true,
        },
      },
    });

    return check;
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
