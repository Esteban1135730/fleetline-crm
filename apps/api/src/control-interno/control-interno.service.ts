import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { FleetModule } from "@fsg/db";
import { HARD_RULES } from "@fsg/shared";
import { PrismaService } from "../prisma/prisma.service";
import { KafkaEventsService } from "../logistics/kafka-events.service";
import type {
  AuditLogQueryDto,
  BankAccountChangeDto,
  CrearHallazgoDto,
  SmartAuditQueryDto,
} from "./dto/control-interno.dto";
import { computeFuelSmartAudit } from "./dto/control-interno.dto";

/**
 * Módulo 11 — Forensic Compliance Hub (Auditor Control Interno · Marta).
 * AuditLog es append-only: este servicio solo CREATE + READ.
 */
@Injectable()
export class ControlInternoService {
  private readonly logger = new Logger(ControlInternoService.name);

  constructor(
    private prisma: PrismaService,
    private kafka: KafkaEventsService,
  ) {}

  /** GET audit-log — caja negra inmutable (solo lectura). */
  async auditLog(organizationId: string, query: AuditLogQueryDto) {
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    const createdAt =
      from || to
        ? {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          }
        : undefined;

    const rows = await this.prisma.auditLog.findMany({
      where: {
        organizationId,
        ...(query.userId ? { userId: query.userId } : {}),
        ...(query.action
          ? { action: { contains: query.action, mode: "insensitive" } }
          : {}),
        ...(query.entity
          ? { entity: { contains: query.entity, mode: "insensitive" } }
          : {}),
        ...(createdAt ? { createdAt } : {}),
      },
      include: {
        user: { select: { id: true, email: true, name: true, role: true } },
      },
      orderBy: { createdAt: "desc" },
      take: query.limit ?? 200,
    });

    return {
      immutable: true,
      count: rows.length,
      trail: rows.map((r) => ({
        id: r.id,
        at: r.createdAt,
        action: r.action,
        entity: r.entity,
        entityId: r.entityId,
        module: r.module,
        userId: r.userId,
        user: r.user,
        ipAddress: r.ipAddress,
        meta: r.meta,
        immutable: r.immutable !== false,
      })),
    };
  }

  /** Append-only write helper (no update/delete exposed). */
  async appendAuditLog(input: {
    organizationId: string;
    action: string;
    entity: string;
    entityId?: string;
    module?: FleetModule;
    userId?: string;
    ipAddress?: string;
    meta?: Record<string, unknown>;
  }) {
    return this.prisma.auditLog.create({
      data: {
        organizationId: input.organizationId,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        module: input.module,
        userId: input.userId,
        ipAddress: input.ipAddress,
        immutable: true,
        meta: (input.meta ?? undefined) as object | undefined,
      },
    });
  }

  async crearHallazgo(
    organizationId: string,
    createdById: string,
    dto: CrearHallazgoDto,
  ) {
    const count = await this.prisma.internalFinding.count({
      where: { organizationId },
    });
    const code = `HALL-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;

    const finding = await this.prisma.internalFinding.create({
      data: {
        organizationId,
        code,
        title: dto.title,
        description: dto.description,
        category: dto.category ?? "OPERATIVA",
        severity: dto.severity ?? "MEDIUM",
        status: "OPEN",
        areaResponsible: dto.areaResponsible,
        evidenceRef: dto.evidenceRef,
        relatedEntity: dto.relatedEntity,
        relatedEntityId: dto.relatedEntityId,
        createdById,
      },
    });

    await this.appendAuditLog({
      organizationId,
      action: "HALLAZGO_CREATED",
      entity: "InternalFinding",
      entityId: finding.id,
      module: FleetModule.REVISORIA,
      userId: createdById,
      meta: { code, category: finding.category },
    });

    return {
      finding,
      message: `Hallazgo registrado (${code}) — estado Abierta`,
    };
  }

  /**
   * Cambio de cuenta bancaria proveedor → Audit Log + Hard-Block pagos.
   */
  async onSupplierBankAccountChange(
    organizationId: string,
    changedById: string | undefined,
    dto: BankAccountChangeDto,
  ) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: dto.supplierId, organizationId },
    });
    if (!supplier) throw new NotFoundException("Proveedor no encontrado");

    const previousAccount = supplier.bankAccountNumber;
    const previousBank = supplier.bankName;

    if (previousAccount && previousAccount === dto.newAccount) {
      return { blocked: false, message: "Cuenta sin cambio" };
    }

    await this.prisma.supplier.update({
      where: { id: supplier.id },
      data: {
        bankAccountNumber: dto.newAccount,
        bankName: dto.newBank ?? supplier.bankName,
        paymentHardBlocked: true,
      },
    });

    const audit = await this.appendAuditLog({
      organizationId,
      action: "SUPPLIER_BANK_ACCOUNT_CHANGED",
      entity: "Supplier",
      entityId: supplier.id,
      module: FleetModule.TESORERIA,
      userId: changedById,
      ipAddress: dto.ipAddress,
      meta: {
        previousAccount,
        newAccount: dto.newAccount,
        previousBank,
        newBank: dto.newBank,
      },
    });

    const blockCount = await this.prisma.paymentHardBlock.count({
      where: { organizationId },
    });
    const code = `PHB-${new Date().getFullYear()}-${String(blockCount + 1).padStart(4, "0")}`;

    const hardBlock = await this.prisma.paymentHardBlock.create({
      data: {
        organizationId,
        code,
        supplierId: supplier.id,
        reason: "Cambio de cuenta bancaria antes de dispersión",
        previousAccount,
        newAccount: dto.newAccount,
        auditLogId: audit.id,
        active: true,
        createdById: changedById,
        ipAddress: dto.ipAddress,
      },
    });

    await this.prisma.supplierBankAccountChange.create({
      data: {
        organizationId,
        supplierId: supplier.id,
        previousAccount,
        newAccount: dto.newAccount,
        previousBank,
        newBank: dto.newBank,
        changedById,
        ipAddress: dto.ipAddress,
        hardBlockId: hardBlock.id,
      },
    });

    const finding = await this.crearHallazgo(organizationId, changedById || "system", {
      title: `Hard-Block pagos · ${supplier.name}`,
      description: `Cuenta ${previousAccount || "n/a"} → ${dto.newAccount}. Pagos pausados hasta validación.`,
      category: "FINANCIERA",
      severity: "CRITICAL",
      areaResponsible: "TESORERIA",
      relatedEntity: "Supplier",
      relatedEntityId: supplier.id,
    });

    await this.kafka.emit("control_interno.payment.hard_block", {
      organizationId,
      hardBlockId: hardBlock.id,
      supplierId: supplier.id,
      auditLogId: audit.id,
    });

    this.logger.warn(
      `Hard-Block ${code} · supplier=${supplier.name} · IP=${dto.ipAddress ?? "n/a"}`,
    );

    return {
      blocked: true,
      hardBlock,
      audit,
      finding: finding.finding,
      message: `Pagos pausados (${code}) — Hard-Block preventivo`,
    };
  }

  /**
   * Consolida overrides del día y genera hallazgos de justificación.
   */
  async consolidarOverridesDiarios(
    organizationId: string,
    auditorId: string,
    day?: Date,
  ) {
    const start = day ? new Date(day) : new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const overrides = await this.prisma.auditLog.findMany({
      where: {
        organizationId,
        createdAt: { gte: start, lt: end },
        OR: [
          { action: { contains: "OVERRIDE", mode: "insensitive" } },
          { entity: { contains: "Override", mode: "insensitive" } },
        ],
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const created: Array<{
      id: string;
      code: string;
      title: string;
      status: string;
      category: string;
    }> = [];
    for (const ov of overrides) {
      const res = await this.crearHallazgo(organizationId, auditorId, {
        title: `Override operativo · ${ov.action}`,
        description: `Requiere justificación escrita. Usuario ${ov.user?.name || ov.userId || "n/a"} · IP ${(ov.meta as { ip?: string } | null)?.ip || ov.ipAddress || "n/a"}`,
        category: "OVERRIDE",
        severity: "HIGH",
        areaResponsible: "OPERACIONES",
        relatedEntity: ov.entity,
        relatedEntityId: ov.entityId || ov.id,
      });
      created.push(res.finding);
    }

    return {
      day: start.toISOString().slice(0, 10),
      overridesCount: overrides.length,
      findingsCreated: created.length,
      findings: created,
      message: `${created.length} hallazgo(s) por overrides del día`,
    };
  }

  /** Smart Audit combustible — mapa de calor por vehículo. */
  async smartAuditCombustible(
    organizationId: string,
    query: SmartAuditQueryDto,
  ) {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

    const expenses = await this.prisma.routeExpense.findMany({
      where: {
        organizationId,
        createdAt: { gte: from, lte: to },
        kind: { in: ["TANQUEO", "COMBUSTIBLE"] },
        ...(query.plate ? { plate: query.plate } : {}),
      },
    });

    const byPlate = new Map<
      string,
      { gallons: number; vehicleId?: string | null; amount: number }
    >();
    for (const e of expenses) {
      const plate = e.plate || "SIN-PLACA";
      const cur = byPlate.get(plate) || {
        gallons: 0,
        vehicleId: e.vehicleId,
        amount: 0,
      };
      cur.gallons += e.gallons ?? 0;
      cur.amount += Number(e.amount);
      cur.vehicleId = cur.vehicleId || e.vehicleId;
      byPlate.set(plate, cur);
    }

    const heatMap: Array<{
      plate: string;
      vehicleId: string | null;
      gallonsPaid: number;
      kmGps: number;
      expectedKmPerGallon: number;
      actualKmPerGallon: number | null;
      expectedKm: number;
      deviationPct: number;
      anomalyScore: number;
      heatLevel: "GREEN" | "AMBER" | "RED";
      auditId: string | null;
    }> = [];
    for (const [plate, agg] of byPlate) {
      const vehicle = await this.prisma.vehicle.findFirst({
        where: {
          organizationId,
          ...(agg.vehicleId ? { id: agg.vehicleId } : { plate }),
        },
      });

      const trips = await this.prisma.trip.findMany({
        where: {
          organizationId,
          departAt: { gte: from, lte: to },
          ...(vehicle
            ? { vehicleId: vehicle.id }
            : agg.vehicleId
              ? { vehicleId: agg.vehicleId }
              : {}),
        },
        select: { id: true, meta: true, distanceKm: true },
      });

      let kmGps = 0;
      for (const t of trips) {
        const meta = t.meta as { distanceKm?: number } | null;
        kmGps +=
          Number(t.distanceKm ?? meta?.distanceKm ?? 0) ||
          HARD_RULES.DEFAULT_TRIP_DISTANCE_KM;
      }
      if (kmGps === 0 && vehicle) {
        kmGps = Math.max(0, (vehicle.odometerKm || 0) * 0.02);
      }

      const expected =
        vehicle?.expectedKmPerGallon && vehicle.expectedKmPerGallon > 0
          ? vehicle.expectedKmPerGallon
          : 8;

      const computed = computeFuelSmartAudit({
        gallonsPaid: agg.gallons,
        kmGps,
        expectedKmPerGallon: expected,
      });

      let persisted: { id: string } | null = null;
      if (query.persist !== false) {
        const count = await this.prisma.forensicFuelAudit.count({
          where: { organizationId },
        });
        const code = `FUEL-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}-${plate}`;
        persisted = await this.prisma.forensicFuelAudit.create({
          data: {
            organizationId,
            code,
            vehicleId: vehicle?.id,
            plate,
            periodFrom: from,
            periodTo: to,
            gallonsPaid: agg.gallons,
            kmGps,
            expectedKmPerGallon: expected,
            actualKmPerGallon: computed.actualKmPerGallon ?? undefined,
            deviationPct: computed.deviationPct,
            anomalyScore: computed.anomalyScore,
            heatLevel: computed.heatLevel,
            meta: { amountPaid: agg.amount },
          },
        });
      }

      heatMap.push({
        plate,
        vehicleId: vehicle?.id ?? null,
        gallonsPaid: agg.gallons,
        kmGps,
        expectedKmPerGallon: expected,
        ...computed,
        auditId: persisted?.id ?? null,
      });
    }

    heatMap.sort((a, b) => b.anomalyScore - a.anomalyScore);

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      thresholdPct: HARD_RULES.FUEL_AUDIT_DEVIATION_PCT,
      heatMap,
      anomalies: heatMap.filter((h) => h.heatLevel !== "GREEN"),
      message: `Smart Audit: ${heatMap.length} unidad(es) · ${heatMap.filter((h) => h.heatLevel !== "GREEN").length} anomalía(s)`,
    };
  }

  async dashboard(organizationId: string) {
    const [trail, findings, hardBlocks, fuelRecent, overrideToday] =
      await Promise.all([
        this.auditLog(organizationId, { limit: 40 }),
        this.prisma.internalFinding.findMany({
          where: { organizationId },
          orderBy: { createdAt: "desc" },
          take: 30,
        }),
        this.prisma.paymentHardBlock.findMany({
          where: { organizationId, active: true },
          orderBy: { createdAt: "desc" },
          take: 15,
        }),
        this.prisma.forensicFuelAudit.findMany({
          where: { organizationId },
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
        this.prisma.auditLog.count({
          where: {
            organizationId,
            createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
            OR: [
              { action: { contains: "OVERRIDE", mode: "insensitive" } },
              { entity: { contains: "Override", mode: "insensitive" } },
            ],
          },
        }),
      ]);

    const aiFlags = [
      ...hardBlocks.map((b) => ({
        kind: "HARD_BLOCK" as const,
        id: b.id,
        label: b.code,
        detail: b.reason,
        severity: "CRITICAL" as const,
        at: b.createdAt,
      })),
      ...fuelRecent
        .filter((f) => f.heatLevel !== "GREEN")
        .map((f) => ({
          kind: "FUEL_ANOMALY" as const,
          id: f.id,
          label: f.plate,
          detail: `Desviación ${f.deviationPct}% · ${f.heatLevel}`,
          severity:
            f.heatLevel === "RED"
              ? ("CRITICAL" as const)
              : ("WARN" as const),
          at: f.createdAt,
        })),
    ].sort((a, b) => +new Date(b.at) - +new Date(a.at));

    return {
      auditTrail: trail,
      findings,
      hardBlocks,
      fuelHeat: fuelRecent,
      overridesToday: overrideToday,
      aiFlags,
      findingStats: {
        open: findings.filter((f) => f.status === "OPEN").length,
        inDischarge: findings.filter((f) => f.status === "IN_DISCHARGE")
          .length,
        closed: findings.filter((f) => f.status === "CLOSED_IMPROVEMENT_PLAN")
          .length,
      },
      ui: { theme: "forensic_panel", immutableAuditLog: true },
    };
  }
}
