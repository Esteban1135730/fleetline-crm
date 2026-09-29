import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  ComplianceDocType,
  DocStatus,
  InvoiceStatus,
  InvoiceType,
  QuoteStatus,
  TripStatus,
  VehicleStatus,
} from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";

type Signal<T> = { ok: true; value: T } | { ok: false; value: T };

async function signal<T>(run: () => Promise<T>, fallback: T): Promise<Signal<T>> {
  try {
    return { ok: true, value: await run() };
  } catch {
    return { ok: false, value: fallback };
  }
}

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getMetrics(organizationId: string) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const soon = new Date();
    soon.setDate(soon.getDate() + 15);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [operacion, riesgo, caja, npsAgg, ticketsOpen] = await Promise.all([
      signal(
        () =>
          Promise.all([
            this.prisma.vehicle.findMany({ where: { organizationId } }),
            this.prisma.trip.count({
              where: {
                organizationId,
                status: { in: [TripStatus.IN_TRANSIT, TripStatus.ASSIGNED] },
              },
            }),
            this.prisma.trip.count({
              where: { organizationId, departAt: { gte: startOfMonth } },
            }),
          ]),
        [[] as never[], 0, 0] as [
          { status: string }[],
          number,
          number,
        ],
      ),
      signal(
        () =>
          Promise.all([
            this.prisma.trip.count({
              where: { organizationId, status: TripStatus.INCIDENT },
            }),
            this.prisma.trip.count({
              where: {
                organizationId,
                status: TripStatus.INCIDENT,
                updatedAt: { gte: startOfDay },
              },
            }),
            this.prisma.vehicle.count({
              where: { organizationId, status: VehicleStatus.MAINTENANCE },
            }),
            this.prisma.complianceDocument.count({
              where: {
                organizationId,
                expiresAt: { gte: startOfDay, lte: soon },
                status: { not: DocStatus.EXPIRED },
              },
            }),
          ]),
        [0, 0, 0, 0] as [number, number, number, number],
      ),
      signal(
        () =>
          Promise.all([
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
          ]),
        [
          { _sum: { amount: null } },
          { _sum: { amount: null } },
          { _sum: { amount: null } },
        ] as const,
      ),
      this.prisma.qualityEvent
        .aggregate({
          where: { organizationId, kind: "NPS", npsScore: { not: null } },
          _avg: { npsScore: true },
          _count: true,
        })
        .catch(() => ({ _avg: { npsScore: null as number | null }, _count: 0 })),
      this.prisma.ticket
        .count({
          where: { organizationId, status: { in: ["OPEN", "IN_PROGRESS"] } },
        })
        .catch(() => 0),
    ]);

    const vehicles = operacion.value[0];
    const tripsActivos = operacion.value[1];
    const tripsMes = operacion.value[2];
    const novedades = riesgo.value[0];
    const bloqueosHoy = riesgo.value[1];
    const taller = riesgo.value[2];
    const docsPorVencer = riesgo.value[3];
    const cxcPaid = caja.value[0];
    const cxcIssued = caja.value[1];
    const cxpOpen = caja.value[2];

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
      npsAgg._avg.npsScore != null
        ? Number(Number(npsAgg._avg.npsScore).toFixed(1))
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
      docsPorVencer,
      nps,
      npsSamples: npsAgg._count,
      ticketsOpen,
      senales: {
        operacion: operacion.ok ? "ok" : "sin_senal",
        riesgo: riesgo.ok ? "ok" : "sin_senal",
        caja: caja.ok ? "ok" : "sin_senal",
      },
    };
  }

  async today(organizationId: string) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const [trips, orders, quotes] = await Promise.all([
      this.prisma.trip.findMany({
        where: {
          organizationId,
          OR: [
            { departAt: { gte: start } },
            { status: TripStatus.IN_TRANSIT, updatedAt: { gte: start } },
          ],
        },
        select: { id: true, code: true, origin: true, destination: true, departAt: true },
        orderBy: { departAt: "desc" },
        take: 8,
      }),
      this.prisma.workOrder.findMany({
        where: { organizationId, createdAt: { gte: start } },
        select: {
          id: true,
          code: true,
          description: true,
          createdAt: true,
          vehicle: { select: { plate: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      this.prisma.quote.findMany({
        where: {
          status: QuoteStatus.WON,
          customer: { organizationId },
          OR: [{ wonAt: { gte: start } }, { updatedAt: { gte: start } }],
        },
        select: { id: true, code: true, updatedAt: true, customer: { select: { name: true } } },
        orderBy: { updatedAt: "desc" },
        take: 8,
      }),
    ]);

    const events = [
      ...trips.map((t) => ({
        id: t.id,
        at: t.departAt.toISOString(),
        kind: "viaje" as const,
        text: `${t.code} ${t.origin} → ${t.destination}`,
      })),
      ...orders.map((o) => ({
        id: o.id,
        at: o.createdAt.toISOString(),
        kind: "taller" as const,
        text: `${o.code} · ${o.vehicle.plate} · ${o.description}`,
      })),
      ...quotes.map((q) => ({
        id: q.id,
        at: q.updatedAt.toISOString(),
        kind: "comercial" as const,
        text: `${q.code} ganada · ${q.customer?.name ?? "cliente"}`,
      })),
    ].sort((a, b) => (a.at < b.at ? 1 : -1));

    return events.slice(0, 12);
  }

  async plate(organizationId: string, raw: string) {
    const plate = raw.trim().toUpperCase().replace(/[\s-]/g, "");
    const vehicle = await this.prisma.vehicle.findFirst({
      where: {
        organizationId,
        plate: { equals: plate, mode: "insensitive" },
      },
      select: { id: true, plate: true, brand: true, model: true },
    });
    if (!vehicle) throw new NotFoundException("Placa no registrada");

    const docs = await this.prisma.complianceDocument.findMany({
      where: {
        organizationId,
        vehicleId: vehicle.id,
        type: {
          in: [ComplianceDocType.SOAT, ComplianceDocType.TECNOMECANICA, ComplianceDocType.FUEC],
        },
      },
      orderBy: { expiresAt: "desc" },
    });
    const fuec = await this.prisma.fuecDocument.findFirst({
      where: { organizationId, vehicleId: vehicle.id },
      orderBy: { validTo: "desc" },
      select: { number: true, status: true, validTo: true },
    });

    const pick = (type: ComplianceDocType) => docs.find((d) => d.type === type);
    const line = (type: ComplianceDocType, label: string) => {
      const doc = pick(type);
      if (!doc) return { label, estado: "sin registro", vence: null as string | null };
      return {
        label,
        estado: doc.status,
        vence: doc.expiresAt ? doc.expiresAt.toISOString() : null,
      };
    };

    return {
      plate: vehicle.plate,
      brand: vehicle.brand,
      model: vehicle.model,
      documentos: [
        line(ComplianceDocType.SOAT, "SOAT"),
        line(ComplianceDocType.TECNOMECANICA, "Tecnomecánica"),
        fuec
          ? {
              label: "FUEC",
              estado: fuec.status,
              vence: fuec.validTo.toISOString(),
              numero: fuec.number,
            }
          : line(ComplianceDocType.FUEC, "FUEC"),
      ],
    };
  }

  async dispatchOptions(organizationId: string) {
    const [customers, vehicles, drivers] = await Promise.all([
      this.prisma.customer.findMany({
        where: { organizationId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
        take: 80,
      }),
      this.prisma.vehicle.findMany({
        where: { organizationId },
        select: { id: true, plate: true },
        orderBy: { plate: "asc" },
        take: 80,
      }),
      this.prisma.driver.findMany({
        where: { organizationId, active: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
        take: 80,
      }),
    ]);
    return { customers, vehicles, drivers };
  }

  async createExpressTrip(
    organizationId: string,
    body: {
      origin?: string;
      destination?: string;
      customerId?: string;
      vehicleId?: string;
      driverId?: string;
    },
  ) {
    const origin = body.origin?.trim() || "";
    const destination = body.destination?.trim() || "";
    if (origin.length < 2 || destination.length < 2) {
      throw new BadRequestException("Indica origen y destino");
    }
    const seq = await this.prisma.trip.count({ where: { organizationId } });
    const assigned = Boolean(body.vehicleId && body.driverId);
    return this.prisma.trip.create({
      data: {
        code: `VIA-${new Date().getFullYear()}-${String(seq + 1).padStart(4, "0")}`,
        origin,
        destination,
        departAt: new Date(),
        customerId: body.customerId || undefined,
        vehicleId: body.vehicleId || undefined,
        driverId: body.driverId || undefined,
        fareAmount: 0,
        status: assigned ? TripStatus.ASSIGNED : TripStatus.PENDING,
        organizationId,
      },
      select: { id: true, code: true, status: true },
    });
  }

  async createExpressWorkOrder(
    organizationId: string,
    body: { vehicleId?: string; description?: string },
  ) {
    const description = body.description?.trim() || "";
    if (!body.vehicleId || description.length < 3) {
      throw new BadRequestException("Indica la unidad y un motivo de al menos 3 caracteres");
    }
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: body.vehicleId, organizationId },
      select: { id: true, plate: true },
    });
    if (!vehicle) throw new NotFoundException("Unidad no encontrada");
    const seq = await this.prisma.workOrder.count({ where: { organizationId } });
    return this.prisma.workOrder.create({
      data: {
        code: `OT-${new Date().getFullYear()}-${String(seq + 1).padStart(4, "0")}`,
        description,
        vehicleId: vehicle.id,
        organizationId,
      },
      select: { id: true, code: true, vehicle: { select: { plate: true } } },
    });
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
