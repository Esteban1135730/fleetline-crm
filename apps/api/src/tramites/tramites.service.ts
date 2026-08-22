import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import { DocStatus, VehicleStatus } from "@fsg/db";
import { HARD_RULES } from "@fsg/shared";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class TramitesService {
  constructor(private prisma: PrismaService) {}

  listFleetUnits(organizationId: string) {
    return this.prisma.vehicle.findMany({
      where: { organizationId },
      select: {
        id: true,
        plate: true,
        brand: true,
        model: true,
        year: true,
        status: true,
      },
      orderBy: { plate: "asc" },
    });
  }

  async registerVehicle(
    organizationId: string,
    data: {
      plate: string;
      brand: string;
      model: string;
      year?: number;
    },
  ) {
    const plate = String(data.plate || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "-");
    const brand = String(data.brand || "").trim();
    const model = String(data.model || "").trim();
    const year = Number(data.year) || new Date().getFullYear();
    if (plate.length < 5) {
      throw new BadRequestException("Indique una placa válida (mín. 5 caracteres)");
    }
    if (!brand || !model) {
      throw new BadRequestException("Indique marca y modelo de la unidad");
    }
    const exists = await this.prisma.vehicle.findFirst({
      where: { organizationId, plate },
      select: { id: true },
    });
    if (exists) {
      throw new ConflictException(`La placa ${plate} ya está matriculada`);
    }
    return this.prisma.vehicle.create({
      data: {
        organizationId,
        plate,
        brand,
        model,
        year,
        status: VehicleStatus.AVAILABLE,
      },
      select: {
        id: true,
        plate: true,
        brand: true,
        model: true,
        year: true,
        status: true,
      },
    });
  }

  /**
   * Lista vehículos bloqueados o con documentos por vencer (≤ DOC_EXPIRING_DAYS).
   */
  async complianceStatus(
    organizationId: string,
    filter: "blocked" | "expiring" | "all" = "all",
  ) {
    const now = Date.now();
    const inWarn = new Date(now + HARD_RULES.DOC_EXPIRING_DAYS * 86400000);
    const in24h = new Date(now + 24 * 60 * 60 * 1000);

    const vehicles = await this.prisma.vehicle.findMany({
      where: { organizationId },
      include: {
        complianceDocs: {
          orderBy: { expiresAt: "asc" },
        },
      },
      orderBy: { plate: "asc" },
    });

    const rows = vehicles.map((v) => {
      const docs = v.complianceDocs.map((d) => {
        const ms = d.expiresAt ? d.expiresAt.getTime() - now : null;
        const hoursLeft = ms != null ? ms / 3600000 : null;
        const daysLeft = ms != null ? ms / 86400000 : null;
        return {
          id: d.id,
          type: d.type,
          status: d.status,
          expiresAt: d.expiresAt?.toISOString() ?? null,
          hoursLeft: hoursLeft != null ? Math.round(hoursLeft * 10) / 10 : null,
          daysLeft: daysLeft != null ? Math.floor(daysLeft) : null,
          runtVerified: d.runtVerified,
          reference: d.reference,
        };
      });

      const criticalExpired = docs.some(
        (d) =>
          (d.type === "SOAT" ||
            d.type === "TECNOMECANICA" ||
            d.type === "TARJETA_OPERACION") &&
          (d.status === DocStatus.EXPIRED ||
            (d.expiresAt != null && new Date(d.expiresAt).getTime() <= now)),
      );

      const expiringSoon = docs.some(
        (d) =>
          d.expiresAt != null &&
          new Date(d.expiresAt).getTime() > now &&
          new Date(d.expiresAt).getTime() <= inWarn.getTime(),
      );

      const expiring24h = docs.some(
        (d) =>
          d.expiresAt != null &&
          new Date(d.expiresAt).getTime() > now &&
          new Date(d.expiresAt).getTime() <= in24h.getTime(),
      );

      return {
        vehicleId: v.id,
        plate: v.plate,
        status: v.status,
        complianceBlocked: v.complianceBlocked,
        complianceReason: v.complianceReason,
        nightRestricted: v.nightRestricted,
        soatActivo: v.soatActivo,
        tecnoActiva: v.tecnoActiva,
        criticalExpired,
        expiringSoon,
        expiring24h,
        documents: docs,
      };
    });

    const filtered = rows.filter((r) => {
      if (filter === "blocked") return r.complianceBlocked || r.criticalExpired;
      if (filter === "expiring")
        return !r.complianceBlocked && (r.expiringSoon || r.expiring24h);
      return true;
    });

    return {
      organizationId,
      filter,
      counts: {
        total: rows.length,
        blocked: rows.filter((r) => r.complianceBlocked).length,
        expiring: rows.filter((r) => r.expiringSoon || r.expiring24h).length,
        listed: filtered.length,
      },
      vehicles: filtered,
    };
  }
}
