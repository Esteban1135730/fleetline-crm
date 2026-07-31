import { Injectable } from "@nestjs/common";
import { DocStatus } from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class TramitesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Lista vehículos bloqueados o con documentos por vencer (≤15 días / ≤24h).
   */
  async complianceStatus(
    organizationId: string,
    filter: "blocked" | "expiring" | "all" = "all",
  ) {
    const now = Date.now();
    const in15d = new Date(now + 15 * 86400000);
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
          new Date(d.expiresAt).getTime() <= in15d.getTime(),
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
