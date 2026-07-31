import { BadRequestException, Injectable } from "@nestjs/common";
import { RodamientoLiquidationStatus, TripStatus } from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";

/** % del fareAmount del viaje que se liquida como rodamiento (default 30%) */
function rodamientoRate(): number {
  const n = Number(process.env.TREASURY_RODAMIENTO_RATE ?? "0.30");
  return Number.isFinite(n) && n > 0 && n <= 1 ? n : 0.3;
}

@Injectable()
export class RodamientosService {
  constructor(private prisma: PrismaService) {}

  /**
   * Calcula y registra liquidación de rodamientos por viajes COMPLETED en el periodo.
   */
  async liquidate(
    organizationId: string,
    userId: string,
    input: {
      periodFrom: string;
      periodTo: string;
      driverId?: string;
      vehicleId?: string;
    },
  ) {
    const from = new Date(input.periodFrom);
    const to = new Date(input.periodTo);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
      throw new BadRequestException("periodFrom / periodTo inválidos");
    }

    const trips = await this.prisma.trip.findMany({
      where: {
        organizationId,
        status: TripStatus.COMPLETED,
        departAt: { gte: from, lte: to },
        ...(input.driverId ? { driverId: input.driverId } : {}),
        ...(input.vehicleId ? { vehicleId: input.vehicleId } : {}),
      },
      include: {
        driver: { select: { id: true, name: true, document: true } },
        vehicle: { select: { id: true, plate: true } },
      },
    });

    const rate = rodamientoRate();
    const byKey = new Map<
      string,
      {
        driverId: string | null;
        vehicleId: string | null;
        tripCount: number;
        amount: number;
        trips: Array<{ id: string; code: string; fare: number; rodamiento: number }>;
      }
    >();

    for (const t of trips) {
      const key = `${t.driverId || "none"}:${t.vehicleId || "none"}`;
      const fare = Number(t.fareAmount || 0);
      const rod = Number((fare * rate).toFixed(2));
      const row = byKey.get(key) || {
        driverId: t.driverId,
        vehicleId: t.vehicleId,
        tripCount: 0,
        amount: 0,
        trips: [],
      };
      row.tripCount += 1;
      row.amount += rod;
      row.trips.push({ id: t.id, code: t.code, fare, rodamiento: rod });
      byKey.set(key, row);
    }

    const count = await this.prisma.rodamientoLiquidation.count({
      where: { organizationId },
    });
    const created = [];
    let i = 0;
    for (const row of byKey.values()) {
      i += 1;
      const liq = await this.prisma.rodamientoLiquidation.create({
        data: {
          organizationId,
          code: `ROD-${String(count + i).padStart(5, "0")}`,
          periodFrom: from,
          periodTo: to,
          driverId: row.driverId,
          vehicleId: row.vehicleId,
          tripCount: row.tripCount,
          amount: Number(row.amount.toFixed(2)),
          status: RodamientoLiquidationStatus.LIQUIDATED,
          liquidatedById: userId,
          details: {
            rate,
            trips: row.trips,
          },
        },
      });
      created.push(liq);
    }

    // Si no hubo viajes, registrar liquidación en cero para auditoría
    if (!created.length) {
      const empty = await this.prisma.rodamientoLiquidation.create({
        data: {
          organizationId,
          code: `ROD-${String(count + 1).padStart(5, "0")}`,
          periodFrom: from,
          periodTo: to,
          driverId: input.driverId,
          vehicleId: input.vehicleId,
          tripCount: 0,
          amount: 0,
          status: RodamientoLiquidationStatus.LIQUIDATED,
          liquidatedById: userId,
          details: { rate, trips: [], note: "Sin viajes COMPLETED en periodo" },
        },
      });
      created.push(empty);
    }

    return {
      periodFrom: from.toISOString(),
      periodTo: to.toISOString(),
      rate,
      liquidations: created,
      totalAmount: created.reduce((s, c) => s + Number(c.amount), 0),
      tripCount: trips.length,
    };
  }

  list(organizationId: string) {
    return this.prisma.rodamientoLiquidation.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }
}
