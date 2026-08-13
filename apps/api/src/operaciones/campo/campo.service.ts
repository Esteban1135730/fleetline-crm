import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { BoardingPassStatus, TripStatus } from "@fsg/db";
import { PrismaService } from "../../prisma/prisma.service";
import { KafkaEventsService } from "../../logistics/kafka-events.service";
import type {
  AbordajeManualDto,
  FallaSitioDto,
  RadarGeocercaQuery,
  SyncOfflineBoardingsDto,
} from "./dto/campo.dto";
import {
  FIELD_GEOFENCE_RADIUS_KM,
  approachPinStatus,
  estimateEtaMinutes,
  haversineKm,
  mergeOfflineBoardingQueue,
} from "./dto/campo.dto";

/**
 * Módulo 9.2 — Field Commander Hub (Coordinador de Campo · Carlos).
 */
@Injectable()
export class CampoService {
  private readonly logger = new Logger(CampoService.name);

  constructor(
    private prisma: PrismaService,
    private kafka: KafkaEventsService,
  ) {}

  /**
   * Radar geocerca dinámica 5 km alrededor del coordinador.
   */
  async radarGeocerca(
    organizationId: string,
    coordinatorId: string,
    query: RadarGeocercaQuery,
  ) {
    const radiusKm = query.radiusKm ?? FIELD_GEOFENCE_RADIUS_KM;
    const lat = query.lat;
    const lng = query.lng;

    if (query.persist !== false) {
      await this.prisma.fieldGeofenceSession.updateMany({
        where: { organizationId, coordinatorId, active: true },
        data: { active: false },
      });
      await this.prisma.fieldGeofenceSession.create({
        data: {
          organizationId,
          coordinatorId,
          customerId: query.customerId,
          lat,
          lng,
          radiusKm,
          active: true,
        },
      });
    }

    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        organizationId,
        ...(query.customerId
          ? {
              trips: {
                some: {
                  customerId: query.customerId,
                  status: {
                    in: [
                      TripStatus.ASSIGNED,
                      TripStatus.IN_TRANSIT,
                      TripStatus.AWAITING_PREOP,
                    ],
                  },
                },
              },
            }
          : {}),
      },
      include: {
        trips: {
          where: {
            status: {
              in: [
                TripStatus.ASSIGNED,
                TripStatus.IN_TRANSIT,
                TripStatus.AWAITING_PREOP,
                TripStatus.PENDING,
              ],
            },
            departAt: {
              gte: new Date(Date.now() - 2 * 60 * 60 * 1000),
              lte: new Date(Date.now() + 8 * 60 * 60 * 1000),
            },
          },
          take: 1,
          orderBy: { departAt: "asc" },
          include: {
            driver: { select: { name: true } },
            customer: { select: { id: true, name: true } },
          },
        },
        gpsSnapshots: {
          take: 1,
          orderBy: { recordedAt: "desc" },
        },
      },
    });

    const approaching: Array<{
      vehicleId: string;
      plate: string;
      brand: string;
      model: string;
      lat: number;
      lng: number;
      speedKph: number | null;
      distanceKm: number;
      etaMinutes: number;
      pin: "ON_TIME" | "DELAYED" | "STOPPED";
      pinColor: string;
      trip: {
        id: string;
        code: string;
        status: string;
        departAt: Date;
        driverName?: string | null;
        customerName?: string | null;
        customerId?: string | null;
      } | null;
    }> = [];
    for (const v of vehicles) {
      const snap = v.gpsSnapshots[0];
      const vLat = snap?.lat ?? v.lat;
      const vLng = snap?.lng ?? v.lng;
      const distanceKm = haversineKm(lat, lng, vLat, vLng);
      if (distanceKm > radiusKm) continue;
      const speedKph = snap?.speedKph ?? null;
      const etaMinutes = estimateEtaMinutes(distanceKm, speedKph);
      const trip = v.trips[0];
      const pin = approachPinStatus({
        speedKph,
        etaMinutes,
        scheduledDepartAt: trip?.departAt,
      });
      approaching.push({
        vehicleId: v.id,
        plate: v.plate,
        brand: v.brand,
        model: v.model,
        lat: vLat,
        lng: vLng,
        speedKph,
        distanceKm,
        etaMinutes,
        pin,
        pinColor:
          pin === "ON_TIME" ? "green" : pin === "DELAYED" ? "amber" : "red",
        trip: trip
          ? {
              id: trip.id,
              code: trip.code,
              status: trip.status,
              departAt: trip.departAt,
              driverName: trip.driver?.name,
              customerName: trip.customer?.name,
              customerId: trip.customer?.id,
            }
          : null,
      });
    }

    approaching.sort(
      (a, b) => a.etaMinutes - b.etaMinutes || a.distanceKm - b.distanceKm,
    );

    return {
      geofence: {
        lat,
        lng,
        radiusKm,
        coordinatorId,
        customerId: query.customerId || null,
      },
      approaching,
      arrivalOrder: approaching.map((a, i) => ({
        rank: i + 1,
        plate: a.plate,
        etaMinutes: a.etaMinutes,
        pin: a.pin,
      })),
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Falla de calidad en sitio + solicitud de reemplazo urgente a Gestor Operativo.
   */
  async fallaSitio(
    organizationId: string,
    coordinatorId: string,
    dto: FallaSitioDto,
  ) {
    const count = await this.prisma.fieldSiteAudit.count({
      where: { organizationId },
    });
    const code = `FSA-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;

    let plate = dto.plate;
    let vehicleId = dto.vehicleId;
    if (!plate && vehicleId) {
      const v = await this.prisma.vehicle.findFirst({
        where: { id: vehicleId, organizationId },
      });
      plate = v?.plate;
    }

    const audit = await this.prisma.fieldSiteAudit.create({
      data: {
        organizationId,
        code,
        tripId: dto.tripId,
        vehicleId,
        plate,
        coordinatorId,
        kind: "QUALITY_FAIL_ONSITE",
        notes: dto.notes,
        photoRef: dto.photoRef,
        requestReplacement: dto.requestReplacement !== false,
        status: "OPEN",
        meta: {
          lat: dto.lat,
          lng: dto.lng,
          beforeBoarding: true,
        },
      },
    });

    if (dto.requestReplacement !== false) {
      await this.kafka.emit("campo.reemplazo.urgente", {
        organizationId,
        auditId: audit.id,
        code: audit.code,
        tripId: dto.tripId,
        vehicleId,
        plate,
        notes: dto.notes,
        photoRef: dto.photoRef,
        targetRole: "GESTOR_OPERATIVO",
        priority: "URGENT",
      });
    }

    this.logger.warn(
      `Falla sitio ${code} · placa=${plate ?? "n/a"} · reemplazo=${dto.requestReplacement !== false}`,
    );

    return {
      audit,
      replacementRequested: dto.requestReplacement !== false,
      message: `Falla de calidad en sitio registrada (${code})`,
    };
  }

  /**
   * Abordaje manual por documento/nombre (override monitora).
   */
  async abordajeManual(
    organizationId: string,
    coordinatorId: string,
    dto: AbordajeManualDto,
  ) {
    if (!dto.passengerDocument && !dto.passengerName && !dto.passengerId) {
      throw new BadRequestException(
        "Indique documento, nombre o passengerId para abordaje",
      );
    }

    const trip = await this.prisma.trip.findFirst({
      where: { id: dto.tripId, organizationId },
    });
    if (!trip) throw new NotFoundException("Viaje no encontrado");

    const existing = await this.prisma.fieldBoardingOverride.findUnique({
      where: {
        organizationId_clientEventId: {
          organizationId,
          clientEventId: dto.clientEventId,
        },
      },
    });
    if (existing) {
      return {
        boarding: existing,
        deduped: true,
        message: "Evento ya sincronizado (idempotente)",
      };
    }

    let passengerId = dto.passengerId;
    let boardingPassId: string | undefined;

    if (!passengerId && dto.passengerDocument) {
      const profile = await this.prisma.passengerProfile.findFirst({
        where: {
          organizationId,
          document: dto.passengerDocument,
        },
      });
      passengerId = profile?.id;
    }

    if (passengerId) {
      const pass = await this.prisma.boardingPass.findFirst({
        where: {
          organizationId,
          tripId: dto.tripId,
          passengerId,
          status: { in: [BoardingPassStatus.ISSUED] },
        },
      });
      if (pass) {
        boardingPassId = pass.id;
        await this.prisma.boardingPass.update({
          where: { id: pass.id },
          data: {
            status: BoardingPassStatus.VALIDATED,
            validatedAt: new Date(),
            validatedById: coordinatorId,
          },
        });
      }
    }

    const offline = dto.offline === true;
    const boarding = await this.prisma.fieldBoardingOverride.create({
      data: {
        organizationId,
        tripId: dto.tripId,
        coordinatorId,
        passengerName: dto.passengerName,
        passengerDocument: dto.passengerDocument,
        passengerId,
        boardingPassId,
        clientEventId: dto.clientEventId,
        capturedAt: dto.capturedAt || new Date(),
        syncedAt: offline ? null : new Date(),
        syncStatus: offline ? "PENDING" : "SYNCED",
        offline,
        lat: dto.lat,
        lng: dto.lng,
        meta: { source: "FIELD_COMMANDER_OVERRIDE" },
      },
    });

    if (!offline) {
      await this.kafka.emit("campo.abordaje.manual", {
        organizationId,
        boardingId: boarding.id,
        tripId: dto.tripId,
        passengerDocument: dto.passengerDocument,
        passengerName: dto.passengerName,
      });
    }

    return {
      boarding,
      deduped: false,
      message: offline
        ? "Abordaje guardado localmente — sync diferida"
        : "Abordaje sincronizado en nube",
    };
  }

  /**
   * Sincronización diferida de cola offline (tablet → 4G).
   */
  async syncOfflineBoardings(
    organizationId: string,
    coordinatorId: string,
    dto: SyncOfflineBoardingsDto,
  ) {
    const ids = dto.events.map((e) => e.clientEventId);
    const already = await this.prisma.fieldBoardingOverride.findMany({
      where: {
        organizationId,
        clientEventId: { in: ids },
      },
      select: { clientEventId: true },
    });
    const alreadySet = new Set(already.map((a) => a.clientEventId));
    const plan = mergeOfflineBoardingQueue({
      pending: dto.events.map((e) => ({
        clientEventId: e.clientEventId,
        tripId: e.tripId,
        capturedAt: e.capturedAt instanceof Date
          ? e.capturedAt
          : new Date(e.capturedAt),
      })),
      alreadySyncedIds: alreadySet,
    });

    const synced: Array<{
      id: string;
      clientEventId: string;
      syncStatus: string;
      [key: string]: unknown;
    }> = [];
    for (const ev of plan.toInsert) {
      const full = dto.events.find((e) => e.clientEventId === ev.clientEventId)!;
      const result = await this.abordajeManual(organizationId, coordinatorId, {
        tripId: full.tripId,
        clientEventId: full.clientEventId,
        passengerDocument: full.passengerDocument,
        passengerName: full.passengerName,
        passengerId: full.passengerId,
        capturedAt: full.capturedAt,
        offline: false,
        lat: full.lat,
        lng: full.lng,
      });
      synced.push(result.boarding as (typeof synced)[number]);
    }

    // Mark any lingering PENDING with same ids as SYNCED (idempotent path)
    await this.prisma.fieldBoardingOverride.updateMany({
      where: {
        organizationId,
        clientEventId: { in: plan.toInsert.map((e) => e.clientEventId) },
        syncStatus: "PENDING",
      },
      data: { syncStatus: "SYNCED", syncedAt: new Date(), offline: false },
    });

    return {
      syncedCount: plan.syncedCount,
      skippedDuplicates: plan.skippedDuplicates,
      synced,
      message: `Sync diferida: ${plan.syncedCount} abordaje(s) · ${plan.skippedDuplicates.length} duplicado(s)`,
    };
  }

  async dashboard(organizationId: string, coordinatorId: string) {
    const session = await this.prisma.fieldGeofenceSession.findFirst({
      where: { organizationId, coordinatorId, active: true },
      orderBy: { updatedAt: "desc" },
    });

    const pendingOffline = await this.prisma.fieldBoardingOverride.count({
      where: {
        organizationId,
        coordinatorId,
        syncStatus: "PENDING",
      },
    });

    const recentAudits = await this.prisma.fieldSiteAudit.findMany({
      where: { organizationId, coordinatorId },
      orderBy: { createdAt: "desc" },
      take: 8,
    });

    let radar: Awaited<ReturnType<CampoService["radarGeocerca"]>> | null =
      null;
    if (session) {
      radar = await this.radarGeocerca(organizationId, coordinatorId, {
        lat: session.lat,
        lng: session.lng,
        radiusKm: session.radiusKm,
        customerId: session.customerId || undefined,
        persist: false,
      });
    }

    return {
      session,
      radar,
      pendingOfflineSync: pendingOffline,
      recentAudits,
      ui: {
        theme: "high_contrast_dark",
        fatFinger: true,
        offlineCapable: true,
      },
    };
  }
}
