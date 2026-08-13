import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { FleetModule } from "@fsg/db";
import { HARD_RULES } from "@fsg/shared";
import { PrismaService } from "../prisma/prisma.service";
import type {
  FuelTokenDto,
  PreoperacionalDto,
  SosDto,
} from "./dto/pilot.dto";

export const PREOP_PHOTOS_REQUIRED = "PREOP_PHOTOS_REQUIRED";
export const PREOP_ITEMS_FAILED = "PREOP_ITEMS_FAILED";

@Injectable()
export class PilotService {
  constructor(private prisma: PrismaService) {}

  speedLock(speedKph: number) {
    const lock = speedKph > HARD_RULES.PILOT_SPEED_LOCK_KPH;
    return {
      speedKph,
      thresholdKph: HARD_RULES.PILOT_SPEED_LOCK_KPH,
      touchLocked: lock,
      uiMode: lock ? "DRIVER_SAFE_BLACKOUT" : "INTERACTIVE",
      message: lock
        ? `Pantalla bloqueada — velocidad ${speedKph} km/h > ${HARD_RULES.PILOT_SPEED_LOCK_KPH} km/h`
        : "Modo interactivo nominal",
    };
  }

  async submitPreoperacional(
    organizationId: string,
    userId: string,
    dto: PreoperacionalDto,
  ) {
    if (!dto.photoRefs?.length) {
      throw new BadRequestException({
        error: PREOP_PHOTOS_REQUIRED,
        message: "Preoperacional fotográfico obligatorio previo al encendido",
      });
    }

    const trip = await this.prisma.trip.findFirst({
      where: { id: dto.tripId, organizationId },
      include: { driver: true },
    });
    if (!trip) throw new NotFoundException("Viaje no encontrado");

    const driver =
      trip.driver ??
      (await this.prisma.driver.findFirst({
        where: { organizationId, userId },
      }));
    if (!driver) {
      throw new BadRequestException("Conductor no vinculado al viaje");
    }

    const allOk =
      dto.brakesOk &&
      dto.lightsOk &&
      dto.tiresOk &&
      dto.kitOk &&
      dto.oilOk;

    if (!allOk) {
      throw new UnprocessableEntityException({
        error: PREOP_ITEMS_FAILED,
        message: "Checklist preoperacional fallido — encendido lógico bloqueado",
      });
    }

    const existing = await this.prisma.preoperational.findUnique({
      where: { tripId: trip.id },
    });
    if (existing) {
      await this.prisma.preoperational.delete({ where: { id: existing.id } });
    }

    const preop = await this.prisma.preoperational.create({
      data: {
        tripId: trip.id,
        driverId: driver.id,
        brakesOk: dto.brakesOk,
        lightsOk: dto.lightsOk,
        tiresOk: dto.tiresOk,
        kitOk: dto.kitOk,
        oilOk: dto.oilOk,
        observations: dto.observations,
        approved: true,
        payload: { photoRefs: dto.photoRefs, submittedBy: userId },
      },
    });

    await this.prisma.trip.update({
      where: { id: trip.id },
      data: {
        status: "AWAITING_FUEC",
        meta: {
          ...((trip.meta as object) || {}),
          preopApprovedAt: new Date().toISOString(),
          logicalIgnitionUnlocked: true,
        },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId,
        action: "PILOT_PREOP_APPROVED",
        entity: "Preoperational",
        entityId: preop.id,
        module: FleetModule.APP_CONDUCTOR,
        userId,
        meta: { tripId: trip.id, photoCount: dto.photoRefs.length },
      },
    });

    return {
      approved: true,
      logicalIgnitionUnlocked: true,
      preoperationalId: preop.id,
      tripId: trip.id,
      message: "Preoperacional OK — encendido lógico autorizado",
    };
  }

  async raiseSos(
    organizationId: string,
    userId: string,
    dto: SosDto,
  ) {
    const code = `SOS-${Date.now().toString(36).toUpperCase()}`;
    const voipChannel = `voip://fsg-pilot/${code}`;

    const alert = await this.prisma.pilotSosAlert.create({
      data: {
        organizationId,
        code,
        category: dto.category,
        tripId: dto.tripId,
        vehicleId: dto.vehicleId,
        plate: dto.plate?.toUpperCase(),
        lat: dto.lat,
        lng: dto.lng,
        speedKph: dto.speedKph,
        voipChannel,
        status: "ACTIVE",
        meta: { raisedBy: userId, channels: ["PUSH", "SMS", "VOIP"] },
      },
    });

    await this.prisma.systemAlert.create({
      data: {
        organizationId,
        severity: "CRITICAL",
        source: "FSG_PILOT_SOS",
        message: `SOS ${dto.category} · ${dto.plate || "SIN-PLACA"} · ${voipChannel}`,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId,
        action: "PILOT_SOS",
        entity: "PilotSosAlert",
        entityId: alert.id,
        module: FleetModule.APP_CONDUCTOR,
        userId,
        meta: { category: dto.category, voipChannel },
      },
    });

    return {
      alertId: alert.id,
      code,
      voipChannel,
      multichannel: ["PUSH", "SMS", "VOIP"],
      message: "SOS multicanal disparado — canal VoIP abierto",
    };
  }

  async issueFuelToken(
    organizationId: string,
    userId: string,
    dto: FuelTokenDto,
  ) {
    const tokenQr = `FUEL-${organizationId.slice(0, 6)}-${Date.now().toString(36)}`;
    const expiresAt = new Date(Date.now() + 2 * 3600_000);

    const token = await this.prisma.fuelWalletToken.create({
      data: {
        organizationId,
        tokenQr,
        plate: dto.plate?.toUpperCase(),
        amountCop: dto.amountCop,
        status: "ACTIVE",
        expiresAt,
        meta: { issuedBy: userId, tripId: dto.tripId },
      },
    });

    return {
      tokenId: token.id,
      tokenQr,
      amountCop: dto.amountCop,
      expiresAt,
      message: "Token QR de tanqueo emitido — sin efectivo",
    };
  }

  async dashboard(organizationId: string, userId: string) {
    const driver = await this.prisma.driver.findFirst({
      where: { organizationId, userId },
    });
    const trips = await this.prisma.trip.findMany({
      where: {
        organizationId,
        ...(driver ? { driverId: driver.id } : {}),
        status: {
          in: [
            "ASSIGNED",
            "AWAITING_PREOP",
            "AWAITING_FUEC",
            "IN_TRANSIT",
          ],
        },
      },
      orderBy: { departAt: "asc" },
      take: 10,
      include: {
        vehicle: { select: { plate: true } },
        preoperational: true,
      },
    });

    const sos = await this.prisma.pilotSosAlert.findMany({
      where: { organizationId, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    const wallet = await this.prisma.fuelWalletToken.findMany({
      where: { organizationId, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    return {
      hub: "FSG Pilot",
      role: "CONDUCTOR",
      speedLockKph: HARD_RULES.PILOT_SPEED_LOCK_KPH,
      trips: trips.map((t) => ({
        id: t.id,
        code: t.code,
        status: t.status,
        plate: t.vehicle?.plate,
        departAt: t.departAt,
        preopDone: Boolean(t.preoperational?.approved),
        origin: t.origin,
        destination: t.destination,
      })),
      activeSos: sos,
      fuelWallet: wallet,
      scoreCard: {
        label: "Score Card del día",
        safety: 92,
        punctuality: 88,
        fuelEfficiency: 85,
      },
    };
  }
}
