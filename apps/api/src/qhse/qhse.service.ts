import { Injectable, NotFoundException } from "@nestjs/common";
import {
  IncidentKind,
  IncidentSeverity,
  IncidentStatus,
  WorkOrderStatus,
} from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";
import { KafkaEventsService } from "../logistics/kafka-events.service";
import { HqseIncidentService } from "../hqse/hqse-incident.service";
import type { CreateSiniestroDto, HuellaCarbonoDto } from "./dto/qhse.dto";
import {
  buildCarbonPdfMarkup,
  computeCarbonFootprint,
  DEFAULT_KG_CO2_PER_GALLON,
} from "./qhse-carbon.calc";

@Injectable()
export class QhseService {
  constructor(
    private prisma: PrismaService,
    private kafka: KafkaEventsService,
    private incidents: HqseIncidentService,
  ) {}

  /**
   * War Room: SOS móvil → incidente + evidencias + ARL + OT Taller.
   */
  async createSiniestro(
    organizationId: string,
    reportedById: string | undefined,
    dto: CreateSiniestroDto,
  ) {
    const severity = (dto.severity || "SEVERE") as IncidentSeverity;
    const base = await this.incidents.create(
      organizationId,
      {
        title: dto.title,
        description: dto.description,
        kind: "TRAFFIC_ACCIDENT",
        severity,
        occurredAt: dto.occurredAt,
        location: dto.location,
        vehicleId: dto.vehicleId,
        driverId: dto.driverId,
      },
      reportedById,
    );

    let workOrder: { id: string; code: string } | null = null;
    const auto = (
      base as {
        autoActions?: { workOrder?: { id: string; code: string } | null } | null;
      }
    ).autoActions;
    if (auto?.workOrder) workOrder = auto.workOrder;

    if (dto.emitWorkOrder && dto.vehicleId && !workOrder) {
      const woCount = await this.prisma.workOrder.count({
        where: { organizationId },
      });
      workOrder = await this.prisma.workOrder.create({
        data: {
          organizationId,
          vehicleId: dto.vehicleId,
          code: `OT-SIN-${String(woCount + 1).padStart(4, "0")}`,
          description: `Reparación post-siniestro ${base.code} — ${dto.title}`,
          status: WorkOrderStatus.OPEN,
        },
        select: { id: true, code: true },
      });
    }

    const insurance = dto.activateInsurance
      ? {
          status: "ACTIVATED" as const,
          provider: dto.insuranceProvider || "ARL_DEFAULT",
          claimRef: `CLAIM-${base.code}`,
          guide: [
            "1. Descargar fotografías SOS desde App",
            "2. Activar integración Aseguradora / ARL",
            "3. Emitir orden de reparación a Taller",
            "4. Cerrar con Plan de Acción en Kanban",
          ],
        }
      : { status: "SKIPPED" as const };

    const meta = {
      photoRefs: dto.photoRefs,
      warRoom: true,
      insurance,
      workOrderId: workOrder?.id,
      workOrderCode: workOrder?.code,
      kanbanColumn: "EN_INVESTIGACION",
    };

    const updated = await this.prisma.hqseIncident.update({
      where: { id: base.id },
      data: {
        status: IncidentStatus.INVESTIGATING,
        workOrderId: workOrder?.id ?? (base as { workOrderId?: string }).workOrderId,
        kind: IncidentKind.TRAFFIC_ACCIDENT,
        meta,
      },
      include: {
        vehicle: { select: { id: true, plate: true, status: true } },
        driver: {
          select: { id: true, name: true, safetyScore: true, document: true },
        },
      },
    });

    await this.kafka.emit("qhse.siniestro.opened", {
      organizationId,
      incidentId: updated.id,
      code: updated.code,
      workOrderId: workOrder?.id,
      photoCount: dto.photoRefs.length,
      insurance: insurance.status,
    });

    return {
      incident: updated,
      warRoom: {
        photosDownloaded: dto.photoRefs,
        insurance,
        repairOrder: workOrder,
        nextStatus: "EN_INVESTIGACION",
        closedLabel: "Cerrado con Plan de Acción",
      },
    };
  }

  async npsSummary(organizationId: string) {
    const events = await this.prisma.qualityEvent.findMany({
      where: {
        organizationId,
        kind: { in: ["NPS", "nps"] },
        npsScore: { not: null },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    const scores = events
      .map((e) => e.npsScore)
      .filter((s): s is number => s != null);

    const promoters = scores.filter((s) => s >= 9).length;
    const detractors = scores.filter((s) => s <= 6).length;
    const total = scores.length;
    const nps =
      total > 0
        ? Math.round(((promoters - detractors) / total) * 100)
        : null;
    const average =
      total > 0
        ? Number(
            (scores.reduce((a, b) => a + b, 0) / total).toFixed(2),
          )
        : null;

    const riskOpen = await this.prisma.qualityEvent.count({
      where: {
        organizationId,
        kind: "RISK_TICKET",
        status: "OPEN",
      },
    });

    return {
      nps,
      average,
      sampleSize: total,
      promoters,
      detractors,
      passives: total - promoters - detractors,
      riskTicketsOpen: riskOpen,
      recent: events.slice(0, 10).map((e) => ({
        id: e.id,
        title: e.title,
        score: e.npsScore,
        status: e.status,
        at: e.createdAt,
      })),
    };
  }

  async huellaCarbono(organizationId: string, dto: HuellaCarbonoDto) {
    const to = dto.to || new Date();
    const from =
      dto.from || new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

    const expenses = await this.prisma.routeExpense.findMany({
      where: {
        organizationId,
        kind: { in: ["TANQUEO", "COMBUSTIBLE", "FUEL"] },
        createdAt: { gte: from, lte: to },
      },
      select: {
        gallons: true,
        amount: true,
        aiExtracted: true,
        plate: true,
      },
    });

    let gallons = 0;
    for (const e of expenses) {
      if (e.gallons != null && e.gallons > 0) {
        gallons += e.gallons;
        continue;
      }
      const ai = e.aiExtracted as { liters?: number; gallons?: number } | null;
      if (ai?.gallons) gallons += Number(ai.gallons);
      else if (ai?.liters) gallons += Number(ai.liters) / 3.78541;
    }
    gallons = Number(gallons.toFixed(2));

    const trips = await this.prisma.trip.aggregate({
      where: {
        organizationId,
        createdAt: { gte: from, lte: to },
        distanceKm: { not: null },
      },
      _sum: { distanceKm: true },
    });
    const distanceKm = Number((trips._sum.distanceKm || 0).toFixed(2));

    const footprint = computeCarbonFootprint({
      gallons,
      distanceKm,
      kgCo2PerGallon: dto.kgCo2PerGallon ?? DEFAULT_KG_CO2_PER_GALLON,
    });

    const nps = await this.npsSummary(organizationId);
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });

    const periodLabel = `${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)}`;
    const pdfMarkup = buildCarbonPdfMarkup({
      organizationName: org?.name,
      periodLabel,
      kgCo2: footprint.kgCo2,
      gallons: footprint.gallons,
      distanceKm: footprint.distanceKm,
      gCo2PerKm: footprint.gCo2PerKm,
      npsAverage: nps.average,
    });

    return {
      period: { from, to, label: periodLabel },
      fuelSamples: expenses.length,
      footprint,
      nps: { nps: nps.nps, average: nps.average, sampleSize: nps.sampleSize },
      export: dto.exportPdf
        ? {
            format: "PDF_MARKUP",
            contentBase64: Buffer.from(pdfMarkup, "utf8").toString("base64"),
            filename: `esg-huella-${from.toISOString().slice(0, 10)}.txt.pdf`,
          }
        : null,
    };
  }

  async preventionDashboard(organizationId: string) {
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const [
      incompletePreops,
      licenseExpiring,
      trainingsExpiring,
      drivers,
      riskFeed,
      pqrsFeed,
      incidents,
    ] = await Promise.all([
      this.prisma.preoperational.count({
        where: {
          approved: false,
          driver: { organizationId },
        },
      }),
      this.prisma.driver.count({
        where: {
          organizationId,
          active: true,
          licenseExpiresAt: { lte: in30 },
        },
      }),
      this.prisma.hqseTrainingRecord.count({
        where: {
          organizationId,
          expiresAt: { lte: in30 },
        },
      }),
      this.prisma.driver.findMany({
        where: { organizationId, active: true },
        select: { safetyScore: true },
      }),
      this.prisma.qualityEvent.findMany({
        where: {
          organizationId,
          kind: { in: ["RISK_TICKET", "NPS", "PQRS", "INCIDENT"] },
        },
        orderBy: { createdAt: "desc" },
        take: 25,
      }),
      this.prisma.ticket.findMany({
        where: {
          organizationId,
          pqrsType: { not: null },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          subject: true,
          status: true,
          createdAt: true,
        },
      }),
      this.prisma.hqseIncident.findMany({
        where: { organizationId },
        orderBy: { occurredAt: "desc" },
        take: 40,
        include: {
          vehicle: { select: { plate: true } },
          driver: { select: { name: true, safetyScore: true } },
        },
      }),
    ]);

    const scores = drivers.map((d) => d.safetyScore ?? 100);
    const globalDriverScore =
      scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : 100;

    const kanban = {
      enInvestigacion: incidents.filter(
        (i) =>
          i.status === IncidentStatus.OPEN ||
          i.status === IncidentStatus.INVESTIGATING,
      ),
      cerradoConPlan: incidents.filter(
        (i) => i.status === IncidentStatus.CLOSED,
      ),
    };

    return {
      riskMatrix: {
        preopsIncomplete: {
          count: incompletePreops,
          signal: incompletePreops === 0 ? "NOMINAL" : incompletePreops > 5 ? "ALERT" : "WATCH",
        },
        licensesCoursesExpiring: {
          count: licenseExpiring + trainingsExpiring,
          licenses: licenseExpiring,
          courses: trainingsExpiring,
          signal:
            licenseExpiring + trainingsExpiring === 0
              ? "NOMINAL"
              : licenseExpiring + trainingsExpiring > 3
                ? "ALERT"
                : "WATCH",
        },
        globalDriverScore: {
          value: globalDriverScore,
          signal:
            globalDriverScore >= 85
              ? "NOMINAL"
              : globalDriverScore >= 70
                ? "WATCH"
                : "ALERT",
        },
      },
      liveFeed: [
        ...riskFeed.map((e) => ({
          id: e.id,
          source: e.kind === "RISK_TICKET" ? "TELEMETRY" : "CALIDAD",
          title: e.title,
          status: e.status,
          at: e.createdAt,
        })),
        ...pqrsFeed.map((t) => ({
          id: t.id,
          source: "PQRS",
          title: t.subject || "PQRS",
          status: t.status,
          at: t.createdAt,
        })),
      ]
        .sort((a, b) => +new Date(b.at) - +new Date(a.at))
        .slice(0, 30),
      kanban,
    };
  }

  async ensureDriver(organizationId: string, driverId: string) {
    const d = await this.prisma.driver.findFirst({
      where: { id: driverId, organizationId },
    });
    if (!d) throw new NotFoundException("Conductor no encontrado");
    return d;
  }
}
