import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import {
  ContractStatus,
  ExecutiveApprovalKind,
  ExecutiveApprovalStatus,
  ManagerialOverrideStatus,
  SalesPipelineStage,
  TripStatus,
  WorkOrderStatus,
} from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";
import { ExecutiveKpiService } from "../presidencia/executive-kpi.service";
import { KafkaEventsService } from "../logistics/kafka-events.service";
import {
  assertExecutivePinValid,
  pickOptimalOverrideScenario,
  type CreateApprovalDto,
  type FirmarPinDto,
  type OverrideScenario,
  type ResolverOverrideDto,
} from "./dto/gerencia.dto";

/**
 * Módulo 16 — Gerencia General / Executive Operations Hub (Mauricio).
 */
@Injectable()
export class GerenciaService {
  private readonly logger = new Logger(GerenciaService.name);

  constructor(
    private prisma: PrismaService,
    private kpis: ExecutiveKpiService,
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

  async dashboard(organizationId: string) {
    const [scorecard, approvals, overrides, warRooms] = await Promise.all([
      this.balanceScorecard(organizationId),
      this.prisma.executiveApproval.findMany({
        where: {
          organizationId,
          status: ExecutiveApprovalStatus.PENDING,
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
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
      scorecard,
      approvalsInbox: approvals.map((a) => ({
        ...a,
        amountCop: Number(a.amountCop),
        cashflowImpactCop: Number(a.cashflowImpactCop),
      })),
      pendingOverrides: overrides.map((o) => ({
        ...o,
        penaltyCostCop: Number(o.penaltyCostCop),
        vipNetGainCop: Number(o.vipNetGainCop),
      })),
      warRooms,
      commandDirectory: directors,
      riskRadar: scorecard.riskRadar,
    };
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
    const bottlenecks: Array<{
      area: string;
      severity: "AMBER" | "RED";
      message: string;
      warRoomHint: string;
    }> = [];

    if (openWo > 3) {
      bottlenecks.push({
        area: "TALLER",
        severity: openWo > 6 ? "RED" : "AMBER",
        message: `${openWo} OT abiertas — cuello de botella en mantenimiento`,
        warRoomHint: "DIRECTOR_OPERATIVO",
      });
    }
    if (tripsInFlight > 0 && openWo / Math.max(fleetTotal, 1) > 0.4) {
      bottlenecks.push({
        area: "OPS_FLOTAS",
        severity: "RED",
        message: "Alta carga OT vs flota activa — riesgo de despacho",
        warRoomHint: "DIRECTOR_OPERATIVO",
      });
    }
    if (pendingApprovals > 2) {
      bottlenecks.push({
        area: "FINANZAS",
        severity: "AMBER",
        message: `${pendingApprovals} aprobaciones ejecutivas pendientes`,
        warRoomHint: "DIRECTOR_FINANCIERO",
      });
    }
    if (openDeals > 8 && tripsInFlight < 2) {
      bottlenecks.push({
        area: "COMERCIAL_OPS",
        severity: "AMBER",
        message: "Pipeline comercial alto sin capacidad operativa equivalente",
        warRoomHint: "DIRECTOR_COMERCIAL",
      });
    }

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

  /**
   * Firma ejecutiva con PIN de seguridad (obligatorio).
   */
  async firmarAprobacionPin(
    organizationId: string,
    userId: string,
    dto: FirmarPinDto,
  ) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId },
      select: { id: true, executivePinHash: true, email: true },
    });
    if (!user) throw new NotFoundException("Usuario no encontrado");

    assertExecutivePinValid(dto.pin as string | undefined, user.executivePinHash, (p, h) =>
      bcrypt.compareSync(p, h),
    );

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
}
