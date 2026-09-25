import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import PDFDocument from "pdfkit";
import {
  ContractStatus,
  ExecutiveApprovalKind,
  ExecutiveApprovalStatus,
  FleetModule,
  InvoiceStatus,
  InvoiceType,
  ManagerialOverrideStatus,
  NotificationChannel,
  NotificationKind,
  PurchaseStatus,
  QuoteStatus,
  RoleCode,
  SalesPipelineStage,
  TripStatus,
  VehicleStatus,
  WorkOrderStatus,
} from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";
import { liquiditySnapshot } from "../finance/liquidity";
import { ExecutiveKpiService } from "../presidencia/executive-kpi.service";
import { PresidenciaService } from "../presidencia/presidencia.service";
import { KafkaEventsService } from "../logistics/kafka-events.service";
import {
  assertExecutivePinValid,
  pickOptimalOverrideScenario,
  type CreateApprovalDto,
  type FirmarPinDto,
  type NotifyBottleneckDto,
  type OverrideScenario,
  type ResolverOverrideDto,
} from "./dto/gerencia.dto";

const SIGN_ROLES = new Set(["gerente_general", "org_admin", "platform_master"]);

const AREA_NOTIFY_ROLES: Record<string, RoleCode[]> = {
  COMERCIAL: [
    RoleCode.COORDINADOR_COMERCIAL,
    RoleCode.GESTOR_COMERCIAL,
    RoleCode.DIRECTOR_COMERCIAL,
  ],
  LOGISTICA: [
    RoleCode.SUPERVISOR_LOGISTICA,
    RoleCode.DIRECTOR_OPERATIVO,
    RoleCode.COORDINADOR_OPERATIVO,
  ],
  TALLER: [RoleCode.COORDINADOR_TALLER, RoleCode.MECANICO],
};

/**
 * Módulo 16 — Gerencia General / Executive Operations Hub (Mauricio).
 */
@Injectable()
export class GerenciaService {
  private readonly logger = new Logger(GerenciaService.name);

  constructor(
    private prisma: PrismaService,
    private kpis: ExecutiveKpiService,
    private presidencia: PresidenciaService,
    private kafka: KafkaEventsService,
  ) {}

  async strategyHub(organizationId: string, userId: string) {
    const canvas = await this.kpis.buildCanvasKpis(organizationId);

    const [tripsInFlight, openWorkOrders, fleetByStatus] = await Promise.all([
      this.prisma.trip.count({
        where: {
          organizationId,
          status: {
            in: [
              TripStatus.IN_TRANSIT,
              TripStatus.ASSIGNED,
              TripStatus.AWAITING_PREOP,
              TripStatus.AWAITING_FUEC,
            ],
          },
        },
      }),
      this.prisma.workOrder.count({
        where: {
          organizationId,
          status: {
            in: [
              WorkOrderStatus.OPEN,
              WorkOrderStatus.IN_PROGRESS,
              WorkOrderStatus.WAITING_PARTS,
            ],
          },
        },
      }),
      this.prisma.vehicle.groupBy({
        by: ["status"],
        where: { organizationId },
        _count: { _all: true },
      }),
    ]);

    await this.prisma.executiveQueryLog.create({
      data: {
        organizationId,
        userId,
        utterance: "GET /gerencia/strategy-hub",
        generatedSql: null,
        answerText: JSON.stringify({
          source: "StrategyHub",
          tripsInFlight,
          openWorkOrders,
          killSwitchBlockedPct: canvas.killSwitch.blockedPct,
        }),
      },
    });

    return {
      hub: "Omniscient Strategy Hub",
      ssot: true,
      operational: {
        tripsInFlight,
        openWorkOrders,
        fleetByStatus: fleetByStatus.map((r) => ({
          status: r.status,
          count: r._count._all,
        })),
      },
      canvasSnapshot: {
        profitability: canvas.profitability,
        killSwitch: canvas.killSwitch,
        cashFlow: canvas.cashFlow,
        procurementDiscrepancies: canvas.procurementDiscrepancies,
        generatedAt: canvas.generatedAt,
      },
      whatIf: {
        status: "READY",
        note: "Escenarios what-if consumen el mismo SSoT; sin mutación operativa.",
      },
    };
  }

  async dashboard(
    organizationId: string,
    period: "day" | "week" | "month" | "year" = "month",
    fromIso?: string,
    toIso?: string,
  ) {
    const [scorecard, approvals, overrides, warRooms, tacticalPanel] =
      await Promise.all([
      this.balanceScorecard(organizationId),
      this.listApprovalInbox(organizationId),
      this.prisma.managerialOverride.findMany({
        where: {
          organizationId,
          status: ManagerialOverrideStatus.PENDING,
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      this.prisma.gerenciaWarRoomSession.findMany({
        where: { organizationId, status: "OPEN" },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      this.buildTacticalPanel(organizationId, period, fromIso, toIso),
    ]);

    const directors = [
      {
        role: "DIRECTOR_COMERCIAL",
        name: "Felipe",
        channel: "chat:comercial",
        video: "meet:comercial-war",
      },
      {
        role: "DIRECTOR_OPERATIVO",
        name: "Héctor",
        channel: "chat:ops",
        video: "meet:ops-war",
      },
      {
        role: "DIRECTOR_FINANCIERO",
        name: "Elena",
        channel: "chat:finanzas",
        video: "meet:cfo-war",
      },
      {
        role: "LIDER_QHSE",
        name: "Carolina",
        channel: "chat:qhse",
        video: "meet:qhse-war",
      },
    ];

    return {
      period,
      scorecard,
      approvalsInbox: approvals,
      pendingOverrides: overrides.map((o) => ({
        ...o,
        penaltyCostCop: Number(o.penaltyCostCop),
        vipNetGainCop: Number(o.vipNetGainCop),
      })),
      warRooms,
      commandDirectory: directors,
      riskRadar: scorecard.riskRadar,
      tacticalPanel,
    };
  }

  /** Panel táctico COO — KPIs reales filtrados por período (from/to ISO). */
  async buildTacticalPanel(
    organizationId: string,
    period: "day" | "week" | "month" | "year" = "month",
    fromIso?: string,
    toIso?: string,
  ) {
    const now = new Date();
    const threeDaysAgo = new Date(now);
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const { rangeStart, rangeEnd } = this.resolvePeriodRange(
      period,
      fromIso,
      toIso,
      now,
    );

    /** Viajes «en curso» — IN_TRANSIT (equiv. IN_PROGRESS / EN_ROUTE del dominio). En vivo. */
    const inFlightStatuses = [TripStatus.IN_TRANSIT] as const;

    const [
      tripsInFlight,
      openWorkOrders,
      delayedWorkOrders,
      vehicleBlocks,
      driverSarlaftBlocks,
      customerSarlaftBlocks,
      openInvoices,
      activityTrips,
      vehicles,
      cxcAging,
    ] = await Promise.all([
      this.prisma.trip.count({
        where: {
          organizationId,
          status: { in: [...inFlightStatuses] },
        },
      }),
      this.prisma.workOrder.count({
        where: {
          organizationId,
          status: { in: [...this.openWoStatuses] },
          openedAt: { gte: rangeStart, lte: rangeEnd },
        },
      }),
      this.prisma.workOrder.count({
        where: {
          organizationId,
          status: WorkOrderStatus.WAITING_PARTS,
          openedAt: { lt: threeDaysAgo, gte: rangeStart },
        },
      }),
      this.prisma.vehicle.count({
        where: {
          organizationId,
          OR: [
            { complianceBlocked: true },
            { status: VehicleStatus.COMPLIANCE_BLOCKED },
          ],
        },
      }),
      // Conductores bloqueados para despacho: flag propio o empleado SARLAFT
      this.prisma.driver.count({
        where: {
          organizationId,
          OR: [
            { dispatchBlocked: true },
            { employee: { sarlaftBlocked: true } },
          ],
        },
      }),
      this.prisma.customer.count({
        where: { organizationId, sarlaftBlocked: true },
      }),
      this.prisma.invoice.findMany({
        where: {
          organizationId,
          type: { in: [InvoiceType.RECEIVABLE, InvoiceType.PAYABLE] },
          status: {
            in: [InvoiceStatus.ISSUED, InvoiceStatus.OVERDUE],
          },
          OR: [
            { dueDate: { gte: rangeStart, lte: rangeEnd } },
            {
              dueDate: null,
              createdAt: { gte: rangeStart, lte: rangeEnd },
            },
          ],
        },
        select: { type: true, amount: true, dueDate: true, status: true },
      }),
      this.prisma.trip.findMany({
        where: {
          organizationId,
          OR: [
            { status: { in: [...inFlightStatuses] } },
            { departAt: { gte: rangeStart, lte: rangeEnd } },
            {
              status: TripStatus.COMPLETED,
              completedAt: { gte: rangeStart, lte: rangeEnd },
            },
          ],
        },
        select: { departAt: true, startedAt: true, completedAt: true },
        take: 500,
      }),
      this.prisma.vehicle.findMany({
        where: { organizationId },
        select: { capacity: true, status: true, complianceBlocked: true },
      }),
      this.buildCxcAging(organizationId),
    ]);

    const dispatchBlocks =
      vehicleBlocks + driverSarlaftBlocks + customerSarlaftBlocks;

    let cxcOpen = 0;
    let cxpOpen = 0;
    const agingBuckets = [
      { rango: "0-15 Días", cxc: 0, cxp: 0 },
      { rango: "16-30 Días", cxc: 0, cxp: 0 },
      { rango: "31-60 Días", cxc: 0, cxp: 0 },
      { rango: "+60 Días", cxc: 0, cxp: 0 },
    ];

    for (const inv of openInvoices) {
      const amt = Number(inv.amount);
      const due = inv.dueDate ? new Date(inv.dueDate) : now;
      const days = Math.max(
        0,
        Math.ceil((now.getTime() - due.getTime()) / 86400000),
      );
      let bucket = 3;
      if (days <= 15) bucket = 0;
      else if (days <= 30) bucket = 1;
      else if (days <= 60) bucket = 2;
      if (inv.type === InvoiceType.RECEIVABLE) {
        cxcOpen += amt;
        agingBuckets[bucket].cxc += Math.round(amt / 1_000_000);
      } else if (inv.type === InvoiceType.PAYABLE) {
        cxpOpen += amt;
        agingBuckets[bucket].cxp += Math.round(amt / 1_000_000);
      }
    }

    const hourSlots = [4, 6, 8, 10, 12, 14, 16, 18];
    const hourlyActivity = hourSlots.map((slot) => {
      const label = `${String(slot).padStart(2, "0")}:00`;
      const viajes = activityTrips.filter((t) => {
        const ref = t.startedAt ?? t.departAt;
        if (!ref) return false;
        const h = ref.getHours();
        return h >= slot && h < slot + 2;
      }).length;
      return { hora: label, viajes };
    });

    const fleetByType = [
      { tipo: "Buses", operativo: 0, taller: 0, bloqueado: 0 },
      { tipo: "Vans", operativo: 0, taller: 0, bloqueado: 0 },
      { tipo: "Camionetas", operativo: 0, taller: 0, bloqueado: 0 },
    ];

    for (const v of vehicles) {
      const idx = v.capacity >= 30 ? 0 : v.capacity >= 15 ? 1 : 2;
      if (v.complianceBlocked || v.status === VehicleStatus.COMPLIANCE_BLOCKED) {
        fleetByType[idx].bloqueado += 1;
      } else if (
        v.status === VehicleStatus.MAINTENANCE ||
        v.status === VehicleStatus.OUT_OF_SERVICE
      ) {
        fleetByType[idx].taller += 1;
      } else {
        fleetByType[idx].operativo += 1;
      }
    }

    return {
      period,
      from: rangeStart.toISOString(),
      to: rangeEnd.toISOString(),
      rangeStart: rangeStart.toISOString(),
      kpis: {
        tripsInFlight,
        tripsInFlightLive: true,
        openWorkOrders,
        delayedWorkOrders,
        cxcOpen,
        cxpOpen,
        cxcOpenMillions: Math.round(cxcOpen / 1_000_000),
        cxpOpenMillions: Math.round(cxpOpen / 1_000_000),
        dispatchBlocks,
        dispatchBlocksBreakdown: {
          vehicles: vehicleBlocks,
          drivers: driverSarlaftBlocks,
          customers: customerSarlaftBlocks,
        },
      },
      hourlyActivity,
      fleetByType,
      cashAging: agingBuckets,
      cxcAging,
      cashAgingSource: "invoices" as const,
    };
  }

  private openWoStatuses = [
    WorkOrderStatus.OPEN,
    WorkOrderStatus.DIAGNOSIS,
    WorkOrderStatus.IN_PROGRESS,
    WorkOrderStatus.WAITING_PARTS,
    WorkOrderStatus.PENDING_APPROVAL,
  ] as const;

  private agingBucketId(daysOverdue: number): "0-15" | "16-30" | "31-60" | "gt60" {
    if (daysOverdue <= 15) return "0-15";
    if (daysOverdue <= 30) return "16-30";
    if (daysOverdue <= 60) return "31-60";
    return "gt60";
  }

  private daysPastDue(dueDate: Date | null, now: Date): number {
    if (!dueDate) return 0;
    return Math.max(
      0,
      Math.floor((now.getTime() - dueDate.getTime()) / 86400000),
    );
  }

  /** Aging CxC — RECEIVABLE no PAID/CANCELLED/DRAFT, buckets por dueDate. */
  async buildCxcAging(organizationId: string) {
    const now = new Date();
    const invoices = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        type: InvoiceType.RECEIVABLE,
        status: {
          notIn: [
            InvoiceStatus.PAID,
            InvoiceStatus.CANCELLED,
            InvoiceStatus.DRAFT,
          ],
        },
      },
      select: { amount: true, dueDate: true },
    });

    const buckets: Array<{
      id: "0-15" | "16-30" | "31-60" | "gt60";
      label: string;
      amountCop: number;
      count: number;
    }> = [
      { id: "0-15", label: "0–15 días", amountCop: 0, count: 0 },
      { id: "16-30", label: "16–30 días", amountCop: 0, count: 0 },
      { id: "31-60", label: "31–60 días", amountCop: 0, count: 0 },
      { id: "gt60", label: ">60 días", amountCop: 0, count: 0 },
    ];

    for (const inv of invoices) {
      const days = this.daysPastDue(inv.dueDate, now);
      const id = this.agingBucketId(days);
      const b = buckets.find((x) => x.id === id)!;
      b.amountCop += Number(inv.amount);
      b.count += 1;
    }

    return {
      asOf: now.toISOString(),
      totalCop: buckets.reduce((s, b) => s + b.amountCop, 0),
      totalCount: buckets.reduce((s, b) => s + b.count, 0),
      buckets,
      note: "Incluye RECEIVABLE no PAID/CANCELLED/DRAFT; días desde dueDate (0 si no vencida).",
    };
  }

  /** Facturas PAYABLE abiertas (CxP) — detalle SlideOver. */
  async listOpenPayables(
    organizationId: string,
    fromIso?: string,
    toIso?: string,
  ) {
    const now = new Date();
    const { rangeStart, rangeEnd } = this.resolvePeriodRange(
      "month",
      fromIso,
      toIso,
      now,
    );
    const rows = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        type: InvoiceType.PAYABLE,
        status: {
          in: [InvoiceStatus.ISSUED, InvoiceStatus.OVERDUE],
        },
        ...(fromIso && toIso
          ? {
              OR: [
                { dueDate: { gte: rangeStart, lte: rangeEnd } },
                {
                  dueDate: null,
                  createdAt: { gte: rangeStart, lte: rangeEnd },
                },
              ],
            }
          : {}),
      },
      include: {
        supplier: { select: { name: true, nit: true } },
      },
      orderBy: { dueDate: "asc" },
    });

    const invoices = rows.map((inv) => ({
      id: inv.id,
      number: inv.number,
      supplier: inv.supplier?.name || inv.counterparty || "Sin proveedor",
      nit: inv.supplier?.nit ?? null,
      amount: Number(inv.amount),
      dueDate: inv.dueDate ? inv.dueDate.toISOString() : null,
      status: inv.status,
      daysOverdue: this.daysPastDue(inv.dueDate, now),
    }));

    return {
      asOf: now.toISOString(),
      from: fromIso ?? null,
      to: toIso ?? null,
      count: invoices.length,
      total: invoices.reduce((s, i) => s + i.amount, 0),
      invoices,
    };
  }

  /** Vehículos complianceBlocked — placa + motivo. */
  async listDispatchBlockVehicles(organizationId: string) {
    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        organizationId,
        OR: [
          { complianceBlocked: true },
          { status: VehicleStatus.COMPLIANCE_BLOCKED },
        ],
      },
      select: {
        id: true,
        plate: true,
        brand: true,
        model: true,
        status: true,
        complianceBlocked: true,
        complianceReason: true,
      },
      orderBy: { plate: "asc" },
    });

    return {
      asOf: new Date().toISOString(),
      count: vehicles.length,
      vehicles: vehicles.map((v) => ({
        id: v.id,
        plate: v.plate,
        label: `${v.brand} ${v.model}`.trim(),
        status: v.status,
        reason:
          v.complianceReason?.trim() ||
          (v.status === VehicleStatus.COMPLIANCE_BLOCKED
            ? "Estado COMPLIANCE_BLOCKED"
            : "Bloqueo de cumplimiento (SOAT/FUEC/docs)"),
      })),
    };
  }

  /** OT abiertas — código, vehículo, estado, antigüedad. */
  async listOpenWorkOrdersDetail(
    organizationId: string,
    fromIso?: string,
    toIso?: string,
  ) {
    const now = new Date();
    const { rangeStart, rangeEnd } = this.resolvePeriodRange(
      "month",
      fromIso,
      toIso,
      now,
    );
    const rows = await this.prisma.workOrder.findMany({
      where: {
        organizationId,
        status: { in: [...this.openWoStatuses] },
        ...(fromIso && toIso
          ? { openedAt: { gte: rangeStart, lte: rangeEnd } }
          : {}),
      },
      include: {
        vehicle: { select: { plate: true, brand: true, model: true } },
      },
      orderBy: { openedAt: "asc" },
    });

    const workOrders = rows.map((wo) => {
      const ageDays = Math.max(
        0,
        Math.floor((now.getTime() - wo.openedAt.getTime()) / 86400000),
      );
      return {
        id: wo.id,
        code: wo.code,
        description: wo.description,
        status: wo.status,
        openedAt: wo.openedAt.toISOString(),
        ageDays,
        vehiclePlate: wo.vehicle?.plate ?? "—",
        vehicleLabel: wo.vehicle
          ? `${wo.vehicle.brand} ${wo.vehicle.model}`.trim()
          : "Sin vehículo",
      };
    });

    return {
      asOf: now.toISOString(),
      from: fromIso ?? null,
      to: toIso ?? null,
      count: workOrders.length,
      workOrders,
    };
  }

  /** Facturas CxC de un bucket de aging (o todas si bucket omitido). */
  async listCxcAgingInvoices(
    organizationId: string,
    bucket?: "0-15" | "16-30" | "31-60" | "gt60",
  ) {
    const now = new Date();
    const rows = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        type: InvoiceType.RECEIVABLE,
        status: {
          notIn: [
            InvoiceStatus.PAID,
            InvoiceStatus.CANCELLED,
            InvoiceStatus.DRAFT,
          ],
        },
      },
      include: {
        customer: { select: { name: true, nit: true } },
      },
      orderBy: { dueDate: "asc" },
    });

    const invoices = rows
      .map((inv) => {
        const daysOverdue = this.daysPastDue(inv.dueDate, now);
        return {
          id: inv.id,
          number: inv.number,
          customer: inv.customer?.name || inv.counterparty || "Sin cliente",
          nit: inv.customer?.nit ?? null,
          amount: Number(inv.amount),
          dueDate: inv.dueDate ? inv.dueDate.toISOString() : null,
          status: inv.status,
          daysOverdue,
          bucket: this.agingBucketId(daysOverdue),
        };
      })
      .filter((inv) => (bucket ? inv.bucket === bucket : true));

    return {
      asOf: now.toISOString(),
      bucket: bucket ?? "all",
      count: invoices.length,
      total: invoices.reduce((s, i) => s + i.amount, 0),
      invoices,
    };
  }

  private resolvePeriodRange(
    period: "day" | "week" | "month" | "year",
    fromIso: string | undefined,
    toIso: string | undefined,
    now: Date,
  ): { rangeStart: Date; rangeEnd: Date } {
    if (fromIso && toIso) {
      const start = new Date(fromIso);
      const end = new Date(toIso);
      if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
        return { rangeStart: start, rangeEnd: end };
      }
    }
    const rangeEnd = new Date(now);
    const rangeStart = new Date(now);
    if (period === "day") {
      rangeStart.setHours(0, 0, 0, 0);
    } else if (period === "week") {
      rangeStart.setDate(rangeStart.getDate() - 7);
    } else if (period === "month") {
      rangeStart.setMonth(rangeStart.getMonth() - 1);
    } else {
      rangeStart.setFullYear(rangeStart.getFullYear() - 1);
    }
    return { rangeStart, rangeEnd };
  }

  /**
   * Balance Scorecard — cruce Ventas × Ops × Finanzas.
   */
  async balanceScorecard(organizationId: string) {
    const canvas = await this.kpis.buildCanvasKpis(organizationId);

    const [
      wonDeals,
      openDeals,
      tripsInFlight,
      openWo,
      fleetTotal,
      fleetActive,
      pendingApprovals,
      pendingOverrides,
      activeContracts,
    ] = await Promise.all([
      this.prisma.commercialDeal.count({
        where: {
          organizationId,
          stage: SalesPipelineStage.CERRADO_GANADO,
        },
      }),
      this.prisma.commercialDeal.count({
        where: {
          organizationId,
          stage: {
            notIn: [
              SalesPipelineStage.CERRADO_GANADO,
              SalesPipelineStage.CERRADO_PERDIDO,
            ],
          },
        },
      }),
      this.prisma.trip.count({
        where: {
          organizationId,
          status: {
            in: [TripStatus.IN_TRANSIT, TripStatus.ASSIGNED],
          },
        },
      }),
      this.prisma.workOrder.count({
        where: {
          organizationId,
          status: {
            in: [
              WorkOrderStatus.OPEN,
              WorkOrderStatus.IN_PROGRESS,
              WorkOrderStatus.WAITING_PARTS,
            ],
          },
        },
      }),
      this.prisma.vehicle.count({ where: { organizationId } }),
      this.prisma.vehicle.count({
        where: {
          organizationId,
          status: { in: ["AVAILABLE", "IN_SERVICE"] },
        },
      }),
      this.prisma.executiveApproval.count({
        where: {
          organizationId,
          status: ExecutiveApprovalStatus.PENDING,
        },
      }),
      this.prisma.managerialOverride.count({
        where: {
          organizationId,
          status: ManagerialOverrideStatus.PENDING,
        },
      }),
      this.prisma.transportContract.count({
        where: { organizationId, status: ContractStatus.ACTIVE },
      }),
    ]);

    const salesGrowthIdx = openDeals + wonDeals * 2;
    const fleetMaintIdx = openWo;
    const bottlenecks = await this.listRuleBottlenecks(organizationId);

    const vipNps = 78;
    const ministryAuditLight: "GREEN" | "AMBER" | "RED" =
      bottlenecks.some((b) => b.severity === "RED")
        ? "AMBER"
        : "GREEN";

    return {
      generatedAt: new Date().toISOString(),
      perspectives: {
        financial: {
          cashFlow: canvas.cashFlow,
          profitability: canvas.profitability,
          pendingApprovals,
        },
        customer: {
          wonDeals,
          openDeals,
          activeContracts,
          vipNps,
        },
        internalProcess: {
          tripsInFlight,
          openWorkOrders: openWo,
          pendingOverrides,
          killSwitch: canvas.killSwitch,
        },
        learningGrowth: {
          fleetUtilizationPct:
            fleetTotal > 0
              ? Math.round((fleetActive / fleetTotal) * 100)
              : 0,
          salesVsMaintenance: {
            salesGrowthIdx,
            fleetMaintIdx,
            correlationNote:
              salesGrowthIdx > fleetMaintIdx * 2
                ? "Crecimiento comercial supera ritmo de mantenimiento"
                : "Balance ventas / flota nominal",
          },
        },
      },
      crossKpis: {
        salesVsFleetMaintenance: [
          { label: "Ventas (idx)", value: salesGrowthIdx },
          { label: "Mantenimiento OT", value: fleetMaintIdx },
        ],
      },
      bottlenecks,
      riskRadar: {
        vipNps,
        vipLight: vipNps >= 70 ? "GREEN" : vipNps >= 50 ? "AMBER" : "RED",
        ministryAuditLight,
        message:
          ministryAuditLight === "GREEN"
            ? "Auditoría Ministerio — semáforo nominal"
            : "Atención: hallazgos operativos pueden impactar auditoría",
      },
    };
  }

  /**
   * Árbitro de conflictos — selecciona escenario óptimo y autoriza penalidad.
   */
  async resolverOverrideGerencial(
    organizationId: string,
    userId: string,
    dto: ResolverOverrideDto,
  ) {
    let override = dto.overrideId
      ? await this.prisma.managerialOverride.findFirst({
          where: { id: dto.overrideId, organizationId },
        })
      : null;

    const scenarios: OverrideScenario[] =
      dto.scenarios ??
      (override?.scenariosJson as OverrideScenario[] | null) ??
      [];

    if (!override) {
      if (!dto.title || scenarios.length < 2) {
        throw new BadRequestException(
          "overrideId o (title + scenarios≥2) requerido",
        );
      }
      const count = await this.prisma.managerialOverride.count({
        where: { organizationId },
      });
      const optimal = pickOptimalOverrideScenario(scenarios);
      override = await this.prisma.managerialOverride.create({
        data: {
          organizationId,
          code: `OVR-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`,
          title: dto.title,
          tripId: dto.tripId,
          dealId: dto.dealId,
          penaltyCostCop: optimal?.penaltyCostCop ?? 0,
          vipNetGainCop: optimal?.vipNetGainCop ?? 0,
          scenariosJson: scenarios as object[],
          optimalScenarioId: optimal?.id,
          requestedById: userId,
          status: ManagerialOverrideStatus.PENDING,
        },
      });
    }

    if (dto.reject) {
      const rejected = await this.prisma.managerialOverride.update({
        where: { id: override.id },
        data: {
          status: ManagerialOverrideStatus.REJECTED,
          resolvedById: userId,
          resolvedAt: new Date(),
          resolutionNotes: dto.resolutionNotes ?? "Rechazado por Gerencia",
        },
      });
      return {
        status: "OVERRIDE_REJECTED",
        override: rejected,
        message: "Override rechazado",
      };
    }

    const list =
      (scenarios.length
        ? scenarios
        : (override.scenariosJson as OverrideScenario[])) ?? [];
    const optimal = pickOptimalOverrideScenario(list);
    if (!optimal) {
      throw new BadRequestException("Sin escenarios para resolver");
    }

    const selectedId =
      dto.selectedScenarioId ??
      (dto.autoPickOptimal !== false ? optimal.id : null);
    if (!selectedId) {
      throw new BadRequestException("selectedScenarioId requerido");
    }
    const selected =
      list.find((s) => s.id === selectedId) ??
      (selectedId === optimal.id ? optimal : null);
    if (!selected) {
      throw new BadRequestException("Escenario no encontrado");
    }

    const net = selected.vipNetGainCop - selected.penaltyCostCop;
    const resolved = await this.prisma.managerialOverride.update({
      where: { id: override.id },
      data: {
        status: ManagerialOverrideStatus.RESOLVED,
        selectedScenarioId: selected.id,
        optimalScenarioId: optimal.id,
        penaltyCostCop: selected.penaltyCostCop,
        vipNetGainCop: selected.vipNetGainCop,
        penaltyBudgetAuthorized: selected.penaltyCostCop,
        itineraryPatch: (selected.itineraryPatch as object) ?? undefined,
        resolvedById: userId,
        resolvedAt: new Date(),
        resolutionNotes:
          dto.resolutionNotes ??
          `Óptimo: ${selected.label} · neto ${net} COP`,
      },
    });

    if (override.tripId && selected.itineraryPatch) {
      await this.prisma.trip.update({
        where: { id: override.tripId },
        data: {
          meta: {
            gerenciaOverride: resolved.code,
            itineraryPatch: selected.itineraryPatch as object,
            penaltyAuthorized: selected.penaltyCostCop,
          } as object,
        },
      });
    }

    await this.kafka.emit("gerencia.override.resolved", {
      organizationId,
      overrideId: resolved.id,
      selectedScenarioId: selected.id,
      penaltyAuthorized: selected.penaltyCostCop,
      net,
    });

    this.logger.log(
      `Override ${resolved.code} → ${selected.id} (neto ${net})`,
    );

    return {
      status: "OVERRIDE_RESOLVED",
      override: {
        ...resolved,
        penaltyCostCop: Number(resolved.penaltyCostCop),
        vipNetGainCop: Number(resolved.vipNetGainCop),
        penaltyBudgetAuthorized: Number(
          resolved.penaltyBudgetAuthorized ?? 0,
        ),
      },
      selected,
      optimal,
      netGainCop: net,
      message: `Escenario ${selected.label} autorizado · presupuesto penalidad ${selected.penaltyCostCop} COP`,
    };
  }

  /** Reglas fijas: cotización >24h, salida <2h sin recurso, OT >48h en repuestos. */
  async listRuleBottlenecks(organizationId: string) {
    const now = new Date();
    const quoteCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const partsCutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const departLimit = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    const [quotes, trips, orders] = await Promise.all([
      this.prisma.commercialIntelligentQuote.findMany({
        where: {
          organizationId,
          sentAt: null,
          status: { in: [QuoteStatus.DRAFT, QuoteStatus.APPROVED] },
          updatedAt: { lt: quoteCutoff },
        },
        include: { deal: { select: { code: true, accountName: true } } },
        orderBy: { updatedAt: "asc" },
        take: 20,
      }),
      this.prisma.trip.findMany({
        where: {
          organizationId,
          status: { not: TripStatus.CANCELLED },
          departAt: { gte: now, lte: departLimit },
          OR: [{ vehicleId: null }, { driverId: null }],
        },
        orderBy: { departAt: "asc" },
        take: 20,
      }),
      this.prisma.workOrder.findMany({
        where: {
          organizationId,
          status: WorkOrderStatus.WAITING_PARTS,
          updatedAt: { lt: partsCutoff },
        },
        orderBy: { updatedAt: "asc" },
        take: 20,
      }),
    ]);

    const items: Array<{
      area: "COMERCIAL" | "LOGISTICA" | "TALLER";
      severity: "YELLOW" | "RED";
      title: string;
      message: string;
      entityCode: string;
      entityId: string;
      href: string;
    }> = [];

    for (const quote of quotes) {
      const ageH = (now.getTime() - quote.updatedAt.getTime()) / 36e5;
      const code = quote.deal?.code ?? quote.id.slice(0, 8);
      items.push({
        area: "COMERCIAL",
        severity: ageH > 72 ? "RED" : "YELLOW",
        title: `Cotización ${code} sin envío al cliente hace ${Math.floor(ageH)} h`,
        message: `Cotización ${code} sin envío al cliente hace ${Math.floor(ageH)} h`,
        entityCode: code,
        entityId: quote.id,
        href: `/comercial?quote=${quote.id}`,
      });
    }

    for (const trip of trips) {
      const missing = [
        trip.vehicleId ? null : "vehículo",
        trip.driverId ? null : "conductor",
      ]
        .filter(Boolean)
        .join(" y ");
      items.push({
        area: "LOGISTICA",
        severity: "RED",
        title: `Servicio ${trip.code} sale en menos de 2 h sin ${missing}`,
        message: `Servicio ${trip.code} sale en menos de 2 h sin ${missing}`,
        entityCode: trip.code,
        entityId: trip.id,
        href: `/logistica/servicios?trip=${trip.id}`,
      });
    }

    for (const order of orders) {
      const ageH = (now.getTime() - order.updatedAt.getTime()) / 36e5;
      items.push({
        area: "TALLER",
        severity: ageH > 96 ? "RED" : "YELLOW",
        title: `OT ${order.code} en espera de repuesto hace ${Math.floor(ageH)} h`,
        message: `OT ${order.code} en espera de repuesto hace ${Math.floor(ageH)} h`,
        entityCode: order.code,
        entityId: order.id,
        href: `/taller?ot=${order.id}`,
      });
    }

    return items;
  }

  async listApprovalInbox(organizationId: string) {
    const [approvals, orders, invoices] = await Promise.all([
      this.prisma.executiveApproval.findMany({
        where: {
          organizationId,
          status: ExecutiveApprovalStatus.PENDING,
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      this.prisma.purchaseOrder.findMany({
        where: {
          organizationId,
          status: {
            in: [PurchaseStatus.REQUESTED, PurchaseStatus.PENDING_APPROVAL],
          },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      this.prisma.invoice.findMany({
        where: {
          organizationId,
          type: InvoiceType.PAYABLE,
          status: {
            in: [
              InvoiceStatus.ISSUED,
              InvoiceStatus.CAUSED,
              InvoiceStatus.PENDING_MATCH,
            ],
          },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

    return [
      ...orders.map((order) => ({
        id: order.id,
        code: order.code,
        kind: "COMPRA",
        title: order.description || `Orden ${order.code}`,
        amountCop: Number(order.totalEstimated),
        cashflowImpactCop: -Number(order.totalEstimated),
        originModule: "COMPRAS",
        originType: "PURCHASE_ORDER" as const,
        originId: order.id,
      })),
      ...invoices.map((invoice) => ({
        id: invoice.id,
        code: invoice.number,
        kind: "PAGO",
        title: invoice.counterparty || `CxP ${invoice.number}`,
        amountCop: Number(invoice.amount),
        cashflowImpactCop: -Number(invoice.amount),
        originModule: "TESORERIA",
        originType: "INVOICE" as const,
        originId: invoice.id,
      })),
      ...approvals.map((approval) => ({
        id: approval.id,
        code: approval.code,
        kind: approval.kind,
        title: approval.title,
        amountCop: Number(approval.amountCop),
        cashflowImpactCop: Number(approval.cashflowImpactCop),
        originModule: "GERENCIA",
        originType: "EXECUTIVE_APPROVAL" as const,
        originId: approval.id,
      })),
    ];
  }

  async approvalImpact(organizationId: string, id: string) {
    const snap = await liquiditySnapshot(this.prisma, organizationId);
    const approval = await this.prisma.executiveApproval.findFirst({
      where: { id, organizationId },
    });
    let amount = 0;
    let title = "";
    if (approval) {
      amount = Number(approval.amountCop);
      title = approval.title;
    } else {
      const order = await this.prisma.purchaseOrder.findFirst({
        where: { id, organizationId },
      });
      if (order) {
        amount = Number(order.totalEstimated);
        title = order.code;
      } else {
        const invoice = await this.prisma.invoice.findFirst({
          where: { id, organizationId },
        });
        if (!invoice) throw new NotFoundException("Solicitud no encontrada");
        amount = Number(invoice.amount);
        title = invoice.number;
      }
    }
    const balanceAfter = snap.bankBalance - amount;
    return {
      title,
      bankBalance: snap.bankBalance,
      amount,
      balanceAfter,
      impactPct:
        snap.bankBalance === 0
          ? null
          : Math.round((amount / snap.bankBalance) * 1000) / 10,
      payrollSafe: balanceAfter >= 0,
      hasBankAccount: snap.hasBankAccount,
    };
  }

  async notifyBottleneck(
    organizationId: string,
    userId: string,
    dto: NotifyBottleneckDto,
  ) {
    const roles = AREA_NOTIFY_ROLES[dto.area] ?? [];
    const users = roles.length
      ? await this.prisma.user.findMany({
          where: { organizationId, active: true, role: { in: roles } },
          select: { id: true },
          take: 8,
        })
      : [];

    if (users.length) {
      await this.prisma.userNotification.createMany({
        data: users.map((user) => ({
          organizationId,
          userId: user.id,
          kind: NotificationKind.SYSTEM,
          title: dto.title,
          body: `Gerencia registró un cuello de botella en ${dto.area}.`,
          href: dto.href,
          channels: [NotificationChannel.IN_APP],
        })),
      });
    }

    await this.prisma.auditLog.create({
      data: {
        organizationId,
        userId,
        action: "BOTTLENECK_NOTIFY",
        entity: dto.area,
        entityId: dto.entityId,
        module: FleetModule.GERENCIA,
        meta: {
          title: dto.title,
          href: dto.href,
          notified: users.length,
        },
      },
    });

    return {
      recorded: true,
      notified: users.length,
      message: "Aviso registrado",
    };
  }

  /**
   * Firma ejecutiva con PIN de seguridad (obligatorio).
   * Muta el proceso de origen (OC o CxP) cuando el ítem lo indica.
   */
  async firmarAprobacionPin(
    organizationId: string,
    userId: string,
    dto: FirmarPinDto,
    actorRole?: string,
  ) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId },
      select: { id: true, executivePinHash: true, email: true },
    });
    if (!user) throw new NotFoundException("Usuario no encontrado");
    if (actorRole && !SIGN_ROLES.has(String(actorRole).toLowerCase())) {
      throw new ForbiddenException("Solo gerencia u org_admin pueden firmar");
    }

    assertExecutivePinValid(dto.pin as string | undefined, user.executivePinHash, (p, h) =>
      bcrypt.compareSync(p, h),
    );

    if (dto.originType === "PURCHASE_ORDER" || dto.originType === "INVOICE") {
      return this.applyOriginDecision(
        organizationId,
        userId,
        dto.originType,
        dto.originId || dto.approvalId || "",
        Boolean(dto.approve),
        dto.rejectReason,
      );
    }

    const approval = await this.prisma.executiveApproval.findFirst({
      where: { id: dto.approvalId, organizationId },
    });
    if (!approval) throw new NotFoundException("Aprobación no encontrada");
    if (approval.status !== ExecutiveApprovalStatus.PENDING) {
      throw new BadRequestException("Aprobación no está pendiente");
    }

    if (!dto.approve) {
      const rejected = await this.prisma.executiveApproval.update({
        where: { id: approval.id },
        data: {
          status: ExecutiveApprovalStatus.REJECTED,
          signedById: userId,
          signedAt: new Date(),
          pinVerified: true,
          rejectReason: dto.rejectReason ?? "Rechazado con PIN",
        },
      });
      await this.writePinAudit(organizationId, userId, {
        action: "EXECUTIVE_REJECT",
        entity: "EXECUTIVE_APPROVAL",
        entityId: rejected.id,
        nextStatus: ExecutiveApprovalStatus.REJECTED,
      });
      return {
        status: "APPROVAL_REJECTED",
        approval: rejected,
        message: "Aprobación rechazada (PIN verificado)",
      };
    }

    const signed = await this.prisma.executiveApproval.update({
      where: { id: approval.id },
      data: {
        status: ExecutiveApprovalStatus.SIGNED,
        signedById: userId,
        signedAt: new Date(),
        pinVerified: true,
      },
    });

    const payload = (approval.payload ?? {}) as {
      purchaseOrderId?: string;
      invoiceId?: string;
    };
    if (payload.purchaseOrderId) {
      await this.applyOriginDecision(
        organizationId,
        userId,
        "PURCHASE_ORDER",
        payload.purchaseOrderId,
        true,
      );
    }
    if (payload.invoiceId) {
      await this.applyOriginDecision(
        organizationId,
        userId,
        "INVOICE",
        payload.invoiceId,
        true,
      );
    }

    await this.writePinAudit(organizationId, userId, {
      action: "EXECUTIVE_SIGN",
      entity: "EXECUTIVE_APPROVAL",
      entityId: signed.id,
      nextStatus: ExecutiveApprovalStatus.SIGNED,
    });

    await this.kafka.emit("gerencia.approval.signed", {
      organizationId,
      approvalId: signed.id,
      kind: signed.kind,
      amountCop: Number(signed.amountCop),
    });

    return {
      status: "APPROVAL_SIGNED",
      approval: {
        ...signed,
        amountCop: Number(signed.amountCop),
        cashflowImpactCop: Number(signed.cashflowImpactCop),
      },
      message: "Firma ejecutiva completada con PIN",
      cashflowSimulation: {
        impactCop: Number(signed.cashflowImpactCop),
        amountCop: Number(signed.amountCop),
        note: "Impacto en flujo de caja registrado",
      },
    };
  }

  private async applyOriginDecision(
    organizationId: string,
    userId: string,
    originType: "PURCHASE_ORDER" | "INVOICE",
    originId: string,
    approve: boolean,
    rejectReason?: string,
  ) {
    if (!originId) throw new BadRequestException("originId requerido");
    if (originType === "PURCHASE_ORDER") {
      const order = await this.prisma.purchaseOrder.findFirst({
        where: { id: originId, organizationId },
      });
      if (!order) throw new NotFoundException("Orden de compra no encontrada");
      const openPo: PurchaseStatus[] = [
        PurchaseStatus.REQUESTED,
        PurchaseStatus.PENDING_APPROVAL,
      ];
      if (!openPo.includes(order.status)) {
        throw new BadRequestException("La orden ya no está pendiente de firma");
      }
      const next = approve ? PurchaseStatus.APPROVED : PurchaseStatus.CANCELLED;
      const updated = await this.prisma.purchaseOrder.update({
        where: { id: order.id },
        data: {
          status: next,
          ...(approve ? { approvedById: userId } : {}),
        },
      });
      await this.writePinAudit(organizationId, userId, {
        action: approve ? "EXECUTIVE_SIGN" : "EXECUTIVE_REJECT",
        entity: "PURCHASE_ORDER",
        entityId: order.id,
        nextStatus: next,
        rejectReason,
      });
      return {
        status: approve ? "ORIGIN_APPROVED" : "ORIGIN_REJECTED",
        origin: { ...updated, totalEstimated: Number(updated.totalEstimated) },
        message: approve
          ? "Orden de compra aprobada con PIN"
          : "Orden de compra rechazada con PIN",
      };
    }

    const invoice = await this.prisma.invoice.findFirst({
      where: { id: originId, organizationId },
    });
    if (!invoice) throw new NotFoundException("Cuenta por pagar no encontrada");
    const openPay: InvoiceStatus[] = [
      InvoiceStatus.ISSUED,
      InvoiceStatus.CAUSED,
      InvoiceStatus.PENDING_MATCH,
    ];
    if (!openPay.includes(invoice.status)) {
      throw new BadRequestException("La cuenta por pagar ya no está pendiente de firma");
    }
    const next = approve
      ? InvoiceStatus.CLEARED_FOR_PAYMENT
      : InvoiceStatus.CANCELLED;
    const updated = await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: next },
    });
    await this.writePinAudit(organizationId, userId, {
      action: approve ? "EXECUTIVE_SIGN" : "EXECUTIVE_REJECT",
      entity: "INVOICE",
      entityId: invoice.id,
      nextStatus: next,
      rejectReason,
    });
    return {
      status: approve ? "ORIGIN_APPROVED" : "ORIGIN_REJECTED",
      origin: { ...updated, amount: Number(updated.amount) },
      message: approve
        ? "CxP liberada para pago con PIN"
        : "CxP rechazada con PIN",
    };
  }

  private async writePinAudit(
    organizationId: string,
    userId: string,
    input: {
      action: string;
      entity: string;
      entityId: string;
      nextStatus: string;
      rejectReason?: string;
    },
  ) {
    await this.prisma.auditLog.create({
      data: {
        organizationId,
        userId,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        module: FleetModule.GERENCIA,
        meta: {
          pinVerified: true,
          actorUserId: userId,
          nextStatus: input.nextStatus,
          rejectReason: input.rejectReason ?? null,
          at: new Date().toISOString(),
        },
      },
    });
  }

  async createApproval(
    organizationId: string,
    requestedById: string,
    dto: CreateApprovalDto,
  ) {
    const count = await this.prisma.executiveApproval.count({
      where: { organizationId },
    });
    return this.prisma.executiveApproval.create({
      data: {
        organizationId,
        code: `EA-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`,
        kind: dto.kind as ExecutiveApprovalKind,
        title: dto.title,
        amountCop: dto.amountCop,
        cashflowImpactCop: dto.cashflowImpactCop,
        payload: dto.payload ? (dto.payload as never) : undefined,
        requestedById,
        status: ExecutiveApprovalStatus.PENDING,
      },
    });
  }

  /** Día calendario America/Bogota → UTC bounds 00:00–23:59:59.999 */
  private bogotaDayBounds(dateYmd?: string): {
    date: string;
    start: Date;
    end: Date;
  } {
    const bogotaToday = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Bogota",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const date =
      dateYmd && /^\d{4}-\d{2}-\d{2}$/.test(dateYmd) ? dateYmd : bogotaToday;
    // Colombia UTC−5 sin DST
    const start = new Date(`${date}T00:00:00.000-05:00`);
    const end = new Date(`${date}T23:59:59.999-05:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException("Fecha inválida. Use YYYY-MM-DD.");
    }
    return { date, start, end };
  }

  /**
   * Reporte de turno diario — cifras reales, texto fijo (sin IA).
   * GET /gerencia/shift-report?date=YYYY-MM-DD
   */
  async buildShiftReport(
    organizationId: string,
    userId: string,
    dateYmd?: string,
  ) {
    const { date, start, end } = this.bogotaDayBounds(dateYmd);
    const exportedAt = new Date();

    const [org, user, tripIncome, dayTrips, signedApprovals, cash, qhseCount, maintVehicles] =
      await Promise.all([
        this.prisma.organization.findUnique({
          where: { id: organizationId },
          select: { name: true, nit: true },
        }),
        this.prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, name: true, email: true },
        }),
        this.prisma.trip.aggregate({
          where: {
            organizationId,
            status: TripStatus.COMPLETED,
            completedAt: { gte: start, lte: end },
          },
          _sum: { fareAmount: true },
          _count: { _all: true },
        }),
        this.prisma.trip.findMany({
          where: {
            organizationId,
            OR: [
              { departAt: { gte: start, lte: end } },
              { completedAt: { gte: start, lte: end } },
            ],
          },
          select: {
            id: true,
            status: true,
            arriveAt: true,
            completedAt: true,
          },
        }),
        this.prisma.executiveApproval.findMany({
          where: {
            organizationId,
            status: ExecutiveApprovalStatus.SIGNED,
            signedAt: { gte: start, lte: end },
          },
          select: { amountCop: true },
        }),
        this.presidencia.cashBreakdown(organizationId).catch((err) => {
          this.logger.warn(
            `shift-report cashBreakdown: ${err instanceof Error ? err.message : err}`,
          );
          return {
            accountsTotal: 0,
            asOf: exportedAt.toISOString(),
          };
        }),
        this.prisma.hqseIncident.count({
          where: {
            organizationId,
            occurredAt: { gte: start, lte: end },
          },
        }),
        this.prisma.vehicle.findMany({
          where: {
            organizationId,
            status: VehicleStatus.MAINTENANCE,
            updatedAt: { gte: start, lte: end },
          },
          select: { id: true, plate: true },
          orderBy: { plate: "asc" },
        }),
      ]);

    let withArrive = 0;
    let onTime = 0;
    for (const t of dayTrips) {
      if (
        t.status === TripStatus.COMPLETED &&
        t.completedAt &&
        t.arriveAt
      ) {
        withArrive += 1;
        if (t.completedAt.getTime() <= t.arriveAt.getTime()) onTime += 1;
      }
    }
    const slaMeasured = withArrive > 0;
    const slaOnTimePct = slaMeasured
      ? Math.round((onTime / withArrive) * 1000) / 10
      : null;

    let bottlenecks: Array<{
      area: string;
      severity: string;
      message: string;
      warRoomHint?: string;
    }> = [];
    try {
      const scorecard = await this.balanceScorecard(organizationId);
      bottlenecks = (scorecard.bottlenecks ?? []).map((b) => ({
        area: b.area,
        severity: b.severity,
        message: b.message,
      }));
    } catch (err) {
      this.logger.warn(
        `shift-report bottlenecks: ${err instanceof Error ? err.message : err}`,
      );
      bottlenecks = [];
    }

    const approvalsSum = signedApprovals.reduce(
      (s, a) => s + Number(a.amountCop),
      0,
    );

    return {
      header: {
        organization: org?.name ?? "Organización",
        organizationNit: org?.nit ?? "",
        shiftDate: date,
        timezone: "America/Bogota" as const,
        dayStartIso: start.toISOString(),
        dayEndIso: end.toISOString(),
        exportedBy: {
          userId: user?.id ?? userId,
          name: user?.name ?? "Usuario",
          email: user?.email ?? "",
        },
        exportedAt: exportedAt.toISOString(),
      },
      financial: {
        dayIncomeCop: Number(tripIncome._sum.fareAmount ?? 0),
        dayIncomeCount: tripIncome._count._all,
        dayIncomeSource:
          "Trip.fareAmount · viajes COMPLETED (completedAt en el día)",
        approvalsSignedCount: signedApprovals.length,
        approvalsSignedSumCop: approvalsSum,
        bankBalanceCop: Number(
          (cash as { accountsTotal?: number }).accountsTotal ?? 0,
        ),
        bankBalanceLabel: "Saldo actual cuentas caja/banco (PUC 11xx)",
        bankBalanceAsOf:
          (cash as { asOf?: string }).asOf ?? exportedAt.toISOString(),
      },
      operational: {
        tripsCount: dayTrips.length,
        slaOnTimePct,
        slaLabel: slaMeasured
          ? `${slaOnTimePct}% a tiempo (${onTime}/${withArrive} con arriveAt)`
          : "SLA no medido",
        qhseIncidentsCount: qhseCount,
        vehiclesToMaintenanceCount: maintVehicles.length,
        vehiclesToMaintenance: maintVehicles,
      },
      bottlenecks: {
        count: bottlenecks.length,
        items: bottlenecks,
        source: "balance-scorecard (cuellos abiertos)",
      },
    };
  }

  /** PDF texto plano del reporte de turno (pdfkit). */
  async buildShiftReportPdf(
    organizationId: string,
    userId: string,
    dateYmd?: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const report = await this.buildShiftReport(
      organizationId,
      userId,
      dateYmd,
    );
    const buffer = await this.renderShiftReportPdf(report);
    return {
      buffer,
      filename: `reporte-turno-${report.header.shiftDate}.pdf`,
    };
  }

  private moneyCop(n: number) {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(n);
  }

  private renderShiftReportPdf(report: Awaited<ReturnType<GerenciaService["buildShiftReport"]>>) {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 48, size: "LETTER" });
      const chunks: Buffer[] = [];
      doc.on("data", (c) => chunks.push(c as Buffer));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const line = (label: string, value: string) => {
        doc
          .fillColor("#334155")
          .font("Helvetica")
          .fontSize(10)
          .text(`${label}: `, { continued: true })
          .fillColor("#0F172A")
          .font("Helvetica-Bold")
          .text(value)
          .font("Helvetica");
      };

      const section = (title: string) => {
        doc.moveDown(0.8);
        doc
          .fillColor("#0F172A")
          .font("Helvetica-Bold")
          .fontSize(12)
          .text(title);
        doc.moveDown(0.3);
      };

      doc
        .fillColor("#0F172A")
        .font("Helvetica-Bold")
        .fontSize(16)
        .text("Reporte de turno");
      doc
        .moveDown(0.2)
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#64748B")
        .text("Resumen diario operativo y financiero · sin contenido generado por IA");

      section("Encabezado");
      line("Organización", report.header.organization);
      line("NIT", report.header.organizationNit || "—");
      line("Fecha del turno", `${report.header.shiftDate} (${report.header.timezone})`);
      line(
        "Exportado por",
        `${report.header.exportedBy.name} <${report.header.exportedBy.email}>`,
      );
      line("Timestamp", report.header.exportedAt);

      section("Financiero");
      line("Ingresos del día", this.moneyCop(report.financial.dayIncomeCop));
      line("Fuente ingresos", report.financial.dayIncomeSource);
      line("Viajes completados (ingreso)", String(report.financial.dayIncomeCount));
      line(
        "Aprobaciones firmadas",
        `${report.financial.approvalsSignedCount} · ${this.moneyCop(report.financial.approvalsSignedSumCop)}`,
      );
      line("Saldo bancario actual", this.moneyCop(report.financial.bankBalanceCop));
      line("Saldo · detalle", report.financial.bankBalanceLabel);

      section("Operativo");
      line("Viajes del día", String(report.operational.tripsCount));
      line("SLA / llegada", report.operational.slaLabel);
      line("Incidentes QHSE", String(report.operational.qhseIncidentsCount));
      line(
        "Vehículos a MAINTENANCE",
        String(report.operational.vehiclesToMaintenanceCount),
      );
      if (report.operational.vehiclesToMaintenance.length > 0) {
        line(
          "Placas",
          report.operational.vehiclesToMaintenance.map((v) => v.plate).join(", "),
        );
      }

      section("Cuellos abiertos");
      line("Cantidad", String(report.bottlenecks.count));
      line("Fuente", report.bottlenecks.source);
      if (report.bottlenecks.items.length === 0) {
        line("Estado", "Sin cuellos abiertos (0)");
      } else {
        for (const b of report.bottlenecks.items) {
          doc
            .fillColor("#0F172A")
            .fontSize(10)
            .text(`· [${b.severity}] ${b.area}: ${b.message}`);
        }
      }

      doc.moveDown(1.2);
      doc
        .fontSize(8)
        .fillColor("#94A3B8")
        .text(
          "Documento generado por Fleetline OS · Gerencia General · texto fijo + datos del sistema.",
        );

      doc.end();
    });
  }
}
