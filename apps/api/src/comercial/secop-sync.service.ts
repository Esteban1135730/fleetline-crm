import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { SecopOpportunitiesQuery } from "./dto/comercial.dto";

export type SecopOpportunityDto = {
  processId: string;
  title: string;
  entityName: string;
  modality: string;
  status: string;
  category: string;
  estimatedValue: number;
  publishAt: string;
  closeAt: string;
  url: string;
};

/**
 * Cliente mock SECOP II — licitaciones de transporte público/escolar/especial.
 */
@Injectable()
export class SecopClient {
  async fetchOpenOpportunities(): Promise<SecopOpportunityDto[]> {
    const now = Date.now();
    const day = 86_400_000;
    return [
      {
        processId: "SECOP-II-TP-2026-0142",
        title: "Transporte escolar intermunicipal — Ruta Bogotá–Soacha",
        entityName: "Alcaldía de Soacha — Secretaría de Educación",
        modality: "Licitación pública",
        status: "OPEN",
        category: "ESCOLAR",
        estimatedValue: 1_850_000_000,
        publishAt: new Date(now - 5 * day).toISOString(),
        closeAt: new Date(now + 20 * day).toISOString(),
        url: "https://community.secop.gov.co/Public/Tendering/OpportunityDetail/Index?noticeUID=SECOP-II-TP-2026-0142",
      },
      {
        processId: "SECOP-II-TE-2026-0088",
        title: "Servicio de transporte especial de pasajeros — entidad territorial",
        entityName: "Gobernación de Cundinamarca",
        modality: "Selección abreviada",
        status: "OPEN",
        category: "ESPECIAL",
        estimatedValue: 920_000_000,
        publishAt: new Date(now - 2 * day).toISOString(),
        closeAt: new Date(now + 12 * day).toISOString(),
        url: "https://community.secop.gov.co/Public/Tendering/OpportunityDetail/Index?noticeUID=SECOP-II-TE-2026-0088",
      },
      {
        processId: "SECOP-II-PU-2026-0031",
        title: "Operación de rutas de transporte público colectivo — corredor norte",
        entityName: "Área Metropolitana",
        modality: "Licitación pública",
        status: "OPEN",
        category: "PUBLICO",
        estimatedValue: 4_200_000_000,
        publishAt: new Date(now - 10 * day).toISOString(),
        closeAt: new Date(now + 35 * day).toISOString(),
        url: "https://community.secop.gov.co/Public/Tendering/OpportunityDetail/Index?noticeUID=SECOP-II-PU-2026-0031",
      },
      {
        processId: "SECOP-II-ES-2025-0999",
        title: "Proceso cerrado — referencia histórica",
        entityName: "Municipio Demo",
        modality: "Licitación pública",
        status: "CLOSED",
        category: "ESCOLAR",
        estimatedValue: 100_000_000,
        publishAt: new Date(now - 90 * day).toISOString(),
        closeAt: new Date(now - 30 * day).toISOString(),
        url: "https://community.secop.gov.co/Public/Tendering/OpportunityDetail/Index?noticeUID=SECOP-II-ES-2025-0999",
      },
    ];
  }
}

@Injectable()
export class SecopSyncService {
  private readonly logger = new Logger(SecopSyncService.name);

  constructor(
    private prisma: PrismaService,
    private client: SecopClient,
  ) {}

  async listOpportunities(
    organizationId: string,
    query: SecopOpportunitiesQuery,
  ) {
    if (query.sync) {
      await this.syncFromSecop(organizationId);
    }

    const stored = await this.prisma.secopOpportunity.findMany({
      where: {
        organizationId,
        ...(query.status
          ? { status: query.status.toUpperCase() }
          : { status: "OPEN" }),
        ...(query.category
          ? { category: query.category.toUpperCase() }
          : {}),
        ...(query.q
          ? {
              OR: [
                { title: { contains: query.q, mode: "insensitive" } },
                { entityName: { contains: query.q, mode: "insensitive" } },
                { processId: { contains: query.q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { closeAt: "asc" },
    });

    if (stored.length) {
      return {
        source: query.sync ? "SECOP_II_SYNC" : "SECOP_II_CACHE",
        count: stored.length,
        opportunities: stored,
      };
    }

    // Fallback en memoria si aún no hay sync
    const live = await this.client.fetchOpenOpportunities();
    const filtered = live.filter((o) => {
      if (query.status && o.status !== query.status.toUpperCase()) return false;
      if (!query.status && o.status !== "OPEN") return false;
      if (
        query.category &&
        o.category !== query.category.toUpperCase()
      ) {
        return false;
      }
      if (query.q) {
        const q = query.q.toLowerCase();
        return (
          o.title.toLowerCase().includes(q) ||
          o.entityName.toLowerCase().includes(q) ||
          o.processId.toLowerCase().includes(q)
        );
      }
      return true;
    });

    return {
      source: "SECOP_II_MOCK",
      count: filtered.length,
      opportunities: filtered,
    };
  }

  async syncFromSecop(organizationId: string) {
    const rows = await this.client.fetchOpenOpportunities();
    let upserted = 0;
    for (const row of rows) {
      await this.prisma.secopOpportunity.upsert({
        where: {
          organizationId_processId: {
            organizationId,
            processId: row.processId,
          },
        },
        create: {
          organizationId,
          processId: row.processId,
          title: row.title,
          entityName: row.entityName,
          modality: row.modality,
          status: row.status,
          category: row.category,
          estimatedValue: row.estimatedValue,
          publishAt: new Date(row.publishAt),
          closeAt: new Date(row.closeAt),
          url: row.url,
          rawPayload: row as object,
        },
        update: {
          title: row.title,
          entityName: row.entityName,
          modality: row.modality,
          status: row.status,
          category: row.category,
          estimatedValue: row.estimatedValue,
          publishAt: new Date(row.publishAt),
          closeAt: new Date(row.closeAt),
          url: row.url,
          rawPayload: row as object,
        },
      });
      upserted += 1;
    }
    this.logger.log(`[SECOP] sync org=${organizationId} upserted=${upserted}`);
    return { upserted };
  }
}
