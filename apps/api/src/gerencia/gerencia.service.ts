import { Injectable } from "@nestjs/common";
import {
  TripStatus,
  VehicleStatus,
  WorkOrderStatus,
} from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";
import { ExecutiveKpiService } from "../presidencia/executive-kpi.service";

/**
 * Módulo 02 — Omniscient Strategy Hub (SSoT gerencial).
 */
@Injectable()
export class GerenciaService {
  constructor(
    private prisma: PrismaService,
    private kpis: ExecutiveKpiService,
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
          status: r.status as VehicleStatus,
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
}
