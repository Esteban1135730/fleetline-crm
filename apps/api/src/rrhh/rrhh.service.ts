import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { EmployeeStatus } from "@fsg/db";
import { HARD_RULES, normalizeRole } from "@fsg/shared";
import { PrismaService } from "../prisma/prisma.service";
import { FatigueManagementService } from "./fatigue-management.service";
import { LogisticsService } from "../logistics/logistics.service";
import type {
  CreateTrainingDto,
  PatchEmployeeDto,
  UpsertEmployeeDto,
} from "./dto/rrhh.dto";

const LICENSE_ALERT_DAYS = 30;

const driverSelect = {
  id: true,
  name: true,
  document: true,
  licenseNumber: true,
  licenseCategory: true,
  licenseExpiresAt: true,
  fatigueScore: true,
  dispatchBlocked: true,
  blockReason: true,
  active: true,
} as const;

function mapEmployeeRow<
  T extends {
    title: string;
    fatigueScore: number;
    driver?: {
      fatigueScore: number;
      licenseExpiresAt: Date | null;
      dispatchBlocked: boolean;
      blockReason: string | null;
    } | null;
  },
>(emp: T) {
  const driver = emp.driver ?? null;
  const fatigueScore = driver?.fatigueScore ?? emp.fatigueScore;
  const licenseExpiresAt = driver?.licenseExpiresAt ?? null;
  return {
    ...emp,
    position: emp.title,
    fatigueScore,
    licenseSemaphore: licenseSemaphore(licenseExpiresAt, !!driver),
    fatigueSemaphore: fatigueSemaphore(fatigueScore),
    dispatchBlocked: driver?.dispatchBlocked ?? false,
    blockReason: driver?.blockReason ?? null,
  };
}

function licenseSemaphore(
  expiresAt: Date | null,
  isDriver: boolean,
): "GREEN" | "AMBER" | "RED" | "N_A" {
  if (!isDriver) return "N_A";
  if (!expiresAt) return "RED";
  const ms = expiresAt.getTime() - Date.now();
  const days = ms / (1000 * 60 * 60 * 24);
  if (days <= 0) return "RED";
  if (days <= LICENSE_ALERT_DAYS) return "AMBER";
  return "GREEN";
}

function fatigueSemaphore(score: number): "GREEN" | "AMBER" | "RED" {
  if (score >= HARD_RULES.FATIGUE_BLOCK_SCORE) return "RED";
  if (score >= 31) return "AMBER";
  return "GREEN";
}

function canManageTenantIdentity(role?: string) {
  const r = normalizeRole(String(role || ""));
  return r === "platform_master" || r === "org_admin";
}

@Injectable()
export class RrhhService {
  constructor(
    private prisma: PrismaService,
    private fatigue: FatigueManagementService,
    private logistics: LogisticsService,
  ) {}

  async listEmployees(organizationId: string) {
    const rows = await this.prisma.employee.findMany({
      where: { organizationId },
      include: { driver: { select: driverSelect } },
      orderBy: { name: "asc" },
    });
    return rows.map(mapEmployeeRow);
  }

  async upsertEmployee(organizationId: string, dto: UpsertEmployeeDto) {
    if (dto.driverId) {
      const driver = await this.prisma.driver.findFirst({
        where: { id: dto.driverId, organizationId },
      });
      if (!driver) throw new NotFoundException("Conductor no encontrado");
    }

    const data = {
      name: dto.name,
      document: dto.document,
      title: dto.title,
      area: dto.area,
      status: (dto.status as EmployeeStatus) || EmployeeStatus.ACTIVE,
      baseSalary: dto.baseSalary ?? 0,
      hourlyRate: dto.hourlyRate ?? 0,
      email: dto.email ?? null,
      phone: dto.phone ?? null,
      driverId: dto.driverId ?? null,
    };

    if (dto.id) {
      const existing = await this.prisma.employee.findFirst({
        where: { id: dto.id, organizationId },
      });
      if (!existing) throw new NotFoundException("Expediente no encontrado");
      const updated = await this.prisma.employee.update({
        where: { id: dto.id },
        data,
        include: { driver: { select: driverSelect } },
      });
      await this.logistics.ensureDriverForEmployee(organizationId, updated);
      const linked = await this.prisma.employee.findFirst({
        where: { id: updated.id },
        include: { driver: { select: driverSelect } },
      });
      return mapEmployeeRow(linked ?? updated);
    }

    try {
      const created = await this.prisma.employee.create({
        data: { ...data, organizationId },
        include: { driver: { select: driverSelect } },
      });
      if (!created.driverId) {
        await this.logistics.ensureDriverForEmployee(organizationId, created);
        const linked = await this.prisma.employee.findFirst({
          where: { id: created.id },
          include: { driver: { select: driverSelect } },
        });
        if (linked) return mapEmployeeRow(linked);
      }
      return mapEmployeeRow(created);
    } catch {
      throw new BadRequestException({
        error: "EMPLOYEE_DOCUMENT_CONFLICT",
        message: "Ya existe un expediente con ese documento",
      });
    }
  }

  async patchEmployee(
    organizationId: string,
    id: string,
    dto: PatchEmployeeDto,
    actorRole?: string,
  ) {
    const existing = await this.prisma.employee.findFirst({
      where: { id, organizationId },
    });
    if (!existing) throw new NotFoundException("Expediente no encontrado");

    const canManageIdentity = canManageTenantIdentity(actorRole);
    if (dto.document !== undefined && !canManageIdentity) {
      throw new ForbiddenException(
        "Solo el maestro de plataforma o el admin de la empresa pueden corregir el documento",
      );
    }

    if (dto.document) {
      const clash = await this.prisma.employee.findFirst({
        where: {
          organizationId,
          document: dto.document.trim(),
          NOT: { id },
        },
      });
      if (clash) {
        throw new BadRequestException({
          error: "EMPLOYEE_DOCUMENT_CONFLICT",
          message: "Ya existe un expediente con ese documento",
        });
      }
    }

    if (dto.driverId) {
      const driver = await this.prisma.driver.findFirst({
        where: { id: dto.driverId, organizationId },
      });
      if (!driver) throw new NotFoundException("Conductor no encontrado");
    }

    const nextDocument = dto.document?.trim();
    const updated = await this.prisma.employee.update({
      where: { id },
      data: {
        name: dto.name,
        title: dto.title,
        area: dto.area,
        phone: dto.phone === undefined ? undefined : dto.phone,
        email: dto.email === undefined ? undefined : dto.email,
        baseSalary: dto.baseSalary,
        hourlyRate: dto.hourlyRate,
        driverId: dto.driverId === undefined ? undefined : dto.driverId,
        fatigueScore: dto.fatigueScore,
        document: canManageIdentity ? nextDocument : undefined,
        status: dto.status
          ? (dto.status.toUpperCase() as EmployeeStatus)
          : undefined,
      },
      include: { driver: { select: driverSelect } },
    });

    if (canManageIdentity && nextDocument && existing.driverId) {
      await this.prisma.driver.update({
        where: { id: existing.driverId },
        data: { document: nextDocument },
      });
    }

    await this.logistics.ensureDriverForEmployee(organizationId, updated);
    const linked = await this.prisma.employee.findFirst({
      where: { id: updated.id },
      include: { driver: { select: driverSelect } },
    });
    return mapEmployeeRow(linked ?? updated);
  }

  async deleteEmployee(
    organizationId: string,
    id: string,
    actorRole?: string,
  ) {
    if (!canManageTenantIdentity(actorRole)) {
      throw new ForbiddenException(
        "Solo el maestro de plataforma o el admin de la empresa pueden eliminar un expediente",
      );
    }
    const existing = await this.prisma.employee.findFirst({
      where: { id, organizationId },
    });
    if (!existing) throw new NotFoundException("Expediente no encontrado");

    await this.prisma.payrollLine.deleteMany({ where: { employeeId: id } });
    await this.prisma.employee.delete({ where: { id } });
    return { ok: true as const, id };
  }

  fatigueStatus(organizationId: string, driverId: string) {
    return this.fatigue.fatigueStatus(organizationId, driverId);
  }

  async overview(organizationId: string) {
    const now = new Date();
    const alertThreshold = new Date();
    alertThreshold.setDate(now.getDate() + LICENSE_ALERT_DAYS);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      personalActivo,
      fatigaAlta,
      licenciasPorVencer,
      novedadesNominaMes,
    ] = await Promise.all([
      this.prisma.employee.count({
        where: { organizationId, status: EmployeeStatus.ACTIVE },
      }),
      this.prisma.driver.count({
        where: {
          organizationId,
          active: true,
          OR: [
            { fatigueScore: { gte: HARD_RULES.FATIGUE_BLOCK_SCORE } },
            { dispatchBlocked: true },
          ],
        },
      }),
      this.prisma.driver.count({
        where: {
          organizationId,
          active: true,
          licenseExpiresAt: { gte: now, lte: alertThreshold },
        },
      }),
      this.prisma.payrollRun.count({
        where: {
          organizationId,
          createdAt: { gte: monthStart },
        },
      }),
    ]);

    return {
      personalActivo,
      fatigaAlta,
      licenciasPorVencer,
      novedadesNominaMes,
      systemStatus:
        fatigaAlta > 0 || licenciasPorVencer > 0 ? "ALERT" : "NOMINAL",
    };
  }

  /** Auditoría de licencias: hard-stop en drivers vencidos. */
  async auditLicenses(organizationId: string) {
    const now = new Date();
    const alertThreshold = new Date();
    alertThreshold.setDate(now.getDate() + LICENSE_ALERT_DAYS);

    const expired = await this.prisma.driver.findMany({
      where: {
        organizationId,
        active: true,
        OR: [
          { licenseExpiresAt: { lt: now } },
          { licenseExpiresAt: null, licenseNumber: { not: null } },
        ],
      },
    });

    let blocked = 0;
    for (const d of expired) {
      if (d.dispatchBlocked && d.blockReason === "DRIVER_LICENSE_EXPIRED") {
        continue;
      }
      await this.prisma.driver.update({
        where: { id: d.id },
        data: {
          dispatchBlocked: true,
          blockReason: "DRIVER_LICENSE_EXPIRED",
        },
      });
      blocked += 1;
    }

    const expiringSoon = await this.prisma.driver.count({
      where: {
        organizationId,
        active: true,
        licenseExpiresAt: { gte: now, lte: alertThreshold },
      },
    });

    return {
      auditedAt: now.toISOString(),
      expiredFound: expired.length,
      newlyBlocked: blocked,
      expiringSoon,
    };
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async nightlyLicenseAudit() {
    const orgs = await this.prisma.organization.findMany({
      select: { id: true },
      take: 50,
    });
    for (const org of orgs) {
      await this.auditLicenses(org.id);
    }
  }

  listPayrollRuns(organizationId: string, take = 20) {
    return this.prisma.payrollRun.findMany({
      where: { organizationId },
      include: {
        lines: {
          include: {
            employee: { select: { id: true, name: true, document: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(take, 50),
    });
  }

  listTrainings(organizationId: string) {
    return this.prisma.hqseTrainingRecord.findMany({
      where: { organizationId },
      include: {
        driver: {
          select: { id: true, name: true, document: true },
        },
      },
      orderBy: { completedAt: "desc" },
      take: 100,
    });
  }

  async createTraining(organizationId: string, dto: CreateTrainingDto) {
    const driver = await this.prisma.driver.findFirst({
      where: { id: dto.driverId, organizationId },
    });
    if (!driver) throw new NotFoundException("Conductor no encontrado");

    return this.prisma.hqseTrainingRecord.create({
      data: {
        organizationId,
        driverId: dto.driverId,
        topic: dto.topic.trim(),
        completedAt: dto.completedAt ?? new Date(),
        expiresAt: dto.expiresAt ?? null,
        provider: dto.provider ?? null,
        certificateRef: dto.certificateRef ?? null,
      },
      include: {
        driver: { select: { id: true, name: true, document: true } },
      },
    });
  }

  listDriversForOps(organizationId: string) {
    return this.logistics.listDrivers(organizationId);
  }
}
