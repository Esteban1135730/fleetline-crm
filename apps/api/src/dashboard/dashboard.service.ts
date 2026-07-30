import { Injectable } from "@nestjs/common";
import {
  InvoiceStatus,
  InvoiceType,
  TripStatus,
  VehicleStatus,
} from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getMetrics(organizationId: string) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [
      vehicles,
      tripsActivos,
      novedades,
      bloqueosHoy,
      cxcPaid,
      cxcIssued,
      cxpOpen,
      taller,
      npsAgg,
      ticketsOpen,
      tripsMes,
    ] = await Promise.all([
      this.prisma.vehicle.findMany({ where: { organizationId } }),
      this.prisma.trip.count({
        where: {
          organizationId,
          status: { in: [TripStatus.IN_TRANSIT, TripStatus.ASSIGNED] },
        },
      }),
      this.prisma.trip.count({
        where: { organizationId, status: TripStatus.INCIDENT },
      }),
      this.prisma.trip.count({
        where: {
          organizationId,
          status: TripStatus.INCIDENT,
          updatedAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      }),
      this.prisma.invoice.aggregate({
        where: {
          organizationId,
          type: InvoiceType.RECEIVABLE,
          status: InvoiceStatus.PAID,
        },
        _sum: { amount: true },
      }),
      this.prisma.invoice.aggregate({
        where: {
          organizationId,
          type: InvoiceType.RECEIVABLE,
          status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.OVERDUE] },
        },
        _sum: { amount: true },
      }),
      this.prisma.invoice.aggregate({
        where: {
          organizationId,
          type: InvoiceType.PAYABLE,
          status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.OVERDUE] },
        },
        _sum: { amount: true },
      }),
      this.prisma.vehicle.count({
        where: { organizationId, status: VehicleStatus.MAINTENANCE },
      }),
      this.prisma.qualityEvent.aggregate({
        where: {
          organizationId,
          type: "NPS",
          score: { not: null },
        },
        _avg: { score: true },
        _count: true,
      }),
      this.prisma.ticket.count({
        where: {
          organizationId,
          status: { in: ["OPEN", "IN_PROGRESS"] },
        },
      }),
      this.prisma.trip.count({
        where: {
          organizationId,
          scheduledAt: { gte: startOfMonth },
        },
      }),
    ]);

    const ingresos = Number(cxcPaid._sum.amount || 0) + Number(cxcIssued._sum.amount || 0);
    const egresos = Number(cxpOpen._sum.amount || 0);
    const margenUtilidad =
      ingresos > 0 ? Number((((ingresos - egresos) / ingresos) * 100).toFixed(1)) : 0;
    const flotaOperacion = vehicles.filter(
      (v) =>
        v.status === VehicleStatus.IN_SERVICE ||
        v.status === VehicleStatus.AVAILABLE,
    ).length;
    const nps =
      npsAgg._avg.score != null
        ? Number(Number(npsAgg._avg.score).toFixed(1))
        : 0;

    return {
      ingresosMtd: ingresos,
      egresosAbiertos: egresos,
      margenUtilidad,
      flotaOperacion,
      flotaTotal: vehicles.length,
      viajesActivos: tripsActivos,
      viajesMes: tripsMes,
      novedades,
      bloqueosHoy,
      vehiculosTaller: taller,
      nps,
      npsSamples: npsAgg._count,
      ticketsOpen,
    };
  }

  async getCharts(organizationId: string) {
    const now = new Date();
    const months: { key: string; label: string; from: Date; to: Date }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const to = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: d.toLocaleDateString("es-CO", { month: "short" }),
        from: d,
        to,
      });
    }

    const invoices = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        issuedAt: { gte: months[0].from },
      },
      select: {
        type: true,
        status: true,
        amount: true,
        issuedAt: true,
      },
    });

    const revenueByMonth = months.map((m) => {
      const slice = invoices.filter(
        (inv) => inv.issuedAt >= m.from && inv.issuedAt < m.to,
      );
      const cobrado = slice
        .filter(
          (i) =>
            i.type === InvoiceType.RECEIVABLE &&
            i.status === InvoiceStatus.PAID,
        )
        .reduce((s, i) => s + Number(i.amount), 0);
      const porCobrar = slice
        .filter(
          (i) =>
            i.type === InvoiceType.RECEIVABLE &&
            (i.status === InvoiceStatus.ISSUED ||
              i.status === InvoiceStatus.OVERDUE),
        )
        .reduce((s, i) => s + Number(i.amount), 0);
      const porPagar = slice
        .filter(
          (i) =>
            i.type === InvoiceType.PAYABLE &&
            (i.status === InvoiceStatus.ISSUED ||
              i.status === InvoiceStatus.OVERDUE ||
              i.status === InvoiceStatus.PAID),
        )
        .reduce((s, i) => s + Number(i.amount), 0);
      return {
        month: m.label,
        cobrado: Math.round(cobrado / 1_000_000),
        porCobrar: Math.round(porCobrar / 1_000_000),
        gastos: Math.round(porPagar / 1_000_000),
      };
    });

    const trips = await this.prisma.trip.groupBy({
      by: ["status"],
      where: { organizationId },
      _count: { _all: true },
    });

    const tripsByStatus = trips.map((t) => ({
      status: t.status,
      count: t._count._all,
    }));

    const vehicles = await this.prisma.vehicle.groupBy({
      by: ["status"],
      where: { organizationId },
      _count: { _all: true },
    });

    const fleetByStatus = vehicles.map((v) => ({
      status: v.status,
      count: v._count._all,
    }));

    const customers = await this.prisma.customer.groupBy({
      by: ["segment"],
      where: { organizationId },
      _count: { _all: true },
    });

    const customersBySegment = customers.map((c) => ({
      segment: c.segment,
      count: c._count._all,
    }));

    const npsEvents = await this.prisma.qualityEvent.findMany({
      where: {
        organizationId,
        type: "NPS",
        score: { not: null },
        createdAt: { gte: months[0].from },
      },
      select: { score: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    const npsByMonth = months.map((m) => {
      const scores = npsEvents
        .filter((e) => e.createdAt >= m.from && e.createdAt < m.to)
        .map((e) => Number(e.score));
      const avg =
        scores.length > 0
          ? Number(
              (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1),
            )
          : null;
      return { month: m.label, nps: avg };
    });

    return {
      revenueByMonth,
      tripsByStatus,
      fleetByStatus,
      customersBySegment,
      npsByMonth,
    };
  }

  async getTicker(organizationId: string) {
    const m = await this.getMetrics(organizationId);
    return [
      {
        label: "Ingresos",
        value: `$${(m.ingresosMtd / 1_000_000).toFixed(1)}M`,
      },
      { label: "Viajes activos", value: String(m.viajesActivos) },
      { label: "NPS", value: m.nps ? `${m.nps}/5` : "—" },
      {
        label: "Flota",
        value: `${m.flotaOperacion}/${m.flotaTotal}`,
      },
      { label: "Tickets abiertos", value: String(m.ticketsOpen) },
      { label: "Novedades", value: String(m.novedades) },
    ];
  }
}
