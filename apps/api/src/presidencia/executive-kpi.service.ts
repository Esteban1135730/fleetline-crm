import { Injectable } from "@nestjs/common";
import {
  InvoiceStatus,
  InvoiceType,
  JournalEntryStatus,
  PaymentScheduleStatus,
  ThreeWayMatchStatus,
  TripStatus,
} from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";

export type CanvasKpis = {
  generatedAt: string;
  profitability: {
    module: "04+10";
    tripsCompleted: number;
    grossFare: number;
    journalIncomePosted: number;
    estimatedMargin: number;
    byRoute: Array<{
      routeKey: string;
      trips: number;
      revenue: number;
      expenses: number;
      margin: number;
    }>;
  };
  killSwitch: {
    module: "06";
    totalUnits: number;
    blockedUnits: number;
    activeUnits: number;
    blockedPct: number;
    activePct: number;
  };
  cashFlow: {
    module: "09";
    queuedPayables: number;
    queuedAmount: number;
    overduePayables: number;
    overdueAmount: number;
    atRiskAmount: number;
  };
  procurementDiscrepancies: {
    module: "08";
    rejectedMatches: number;
    pendingMatches: number;
    approvedMatches: number;
    discrepancyRatePct: number;
  };
};

/**
 * Agregación Founder's Canvas — módulos 04, 06, 08, 09, 10.
 */
@Injectable()
export class ExecutiveKpiService {
  constructor(private prisma: PrismaService) {}

  async buildCanvasKpis(organizationId: string): Promise<CanvasKpis> {
    const [
      tripsCompleted,
      fareAgg,
      routeTrips,
      incomeLines,
      vehicles,
      queuedSchedules,
      overdueInvoices,
      matchCounts,
      tripsForExpense,
    ] = await Promise.all([
      this.prisma.trip.count({
        where: { organizationId, status: TripStatus.COMPLETED },
      }),
      this.prisma.trip.aggregate({
        where: { organizationId, status: TripStatus.COMPLETED },
        _sum: { fareAmount: true },
      }),
      this.prisma.trip.groupBy({
        by: ["origin", "destination"],
        where: { organizationId, status: TripStatus.COMPLETED },
        _sum: { fareAmount: true },
        _count: { _all: true },
      }),
      this.prisma.journalLine.findMany({
        where: {
          entry: { organizationId, status: JournalEntryStatus.POSTED },
          creditAccount: { code: { startsWith: "4" } },
        },
        select: { amount: true },
      }),
      this.prisma.vehicle.findMany({
        where: { organizationId },
        select: { id: true, complianceBlocked: true },
      }),
      this.prisma.paymentSchedule.findMany({
        where: {
          organizationId,
          status: {
            in: [PaymentScheduleStatus.QUEUED, PaymentScheduleStatus.PENDING],
          },
        },
        select: { amount: true, dueDate: true },
      }),
      this.prisma.invoice.aggregate({
        where: {
          organizationId,
          type: InvoiceType.PAYABLE,
          status: InvoiceStatus.OVERDUE,
        },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.threeWayMatch.groupBy({
        by: ["status"],
        where: { purchaseOrder: { organizationId } },
        _count: { _all: true },
      }),
      this.prisma.trip.findMany({
        where: { organizationId, status: TripStatus.COMPLETED },
        select: {
          id: true,
          origin: true,
          destination: true,
          routeExpenses: { select: { amount: true } },
        },
      }),
    ]);

    const expenseByRoute = new Map<string, number>();
    for (const t of tripsForExpense) {
      const key = `${t.origin}→${t.destination}`;
      const sum = t.routeExpenses.reduce((s, e) => s + Number(e.amount), 0);
      expenseByRoute.set(key, (expenseByRoute.get(key) || 0) + sum);
    }

    const byRoute = routeTrips.map((r) => {
      const routeKey = `${r.origin}→${r.destination}`;
      const revenue = Number(r._sum.fareAmount || 0);
      const expenses = expenseByRoute.get(routeKey) || 0;
      return {
        routeKey,
        trips: r._count._all,
        revenue,
        expenses,
        margin: revenue - expenses,
      };
    });

    const grossFare = Number(fareAgg._sum.fareAmount || 0);
    const journalIncomePosted = incomeLines.reduce(
      (s, l) => s + Number(l.amount),
      0,
    );
    const totalExpenses = byRoute.reduce((s, r) => s + r.expenses, 0);

    const totalUnits = vehicles.length;
    const blockedUnits = vehicles.filter((v) => v.complianceBlocked).length;
    const activeUnits = totalUnits - blockedUnits;

    const now = new Date();
    const queuedAmount = queuedSchedules.reduce(
      (s, p) => s + Number(p.amount),
      0,
    );
    const atRiskQueued = queuedSchedules
      .filter((p) => p.dueDate && p.dueDate < now)
      .reduce((s, p) => s + Number(p.amount), 0);
    const overdueAmount = Number(overdueInvoices._sum.amount || 0);

    const countByStatus = (status: ThreeWayMatchStatus) =>
      matchCounts.find((m) => m.status === status)?._count._all || 0;

    const rejectedMatches =
      countByStatus(ThreeWayMatchStatus.DISCREPANCY_REJECTED) +
      countByStatus(ThreeWayMatchStatus.MISMATCH) +
      countByStatus(ThreeWayMatchStatus.FRAUD_ALERT);
    const pendingMatches = countByStatus(ThreeWayMatchStatus.PENDING);
    const approvedMatches =
      countByStatus(ThreeWayMatchStatus.APPROVED) +
      countByStatus(ThreeWayMatchStatus.MATCHED);
    const matchTotal = rejectedMatches + pendingMatches + approvedMatches;

    return {
      generatedAt: new Date().toISOString(),
      profitability: {
        module: "04+10",
        tripsCompleted,
        grossFare,
        journalIncomePosted,
        estimatedMargin: grossFare - totalExpenses,
        byRoute: byRoute.sort((a, b) => b.margin - a.margin).slice(0, 20),
      },
      killSwitch: {
        module: "06",
        totalUnits,
        blockedUnits,
        activeUnits,
        blockedPct: totalUnits ? (blockedUnits / totalUnits) * 100 : 0,
        activePct: totalUnits ? (activeUnits / totalUnits) * 100 : 0,
      },
      cashFlow: {
        module: "09",
        queuedPayables: queuedSchedules.length,
        queuedAmount,
        overduePayables: overdueInvoices._count,
        overdueAmount,
        atRiskAmount: atRiskQueued + overdueAmount,
      },
      procurementDiscrepancies: {
        module: "08",
        rejectedMatches,
        pendingMatches,
        approvedMatches,
        discrepancyRatePct: matchTotal
          ? (rejectedMatches / matchTotal) * 100
          : 0,
      },
    };
  }
}
