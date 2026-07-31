import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { BoardingPassStatus, TripStatus } from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";
import type {
  GenerateBoardingPassDto,
  ValidateBoardingPassDto,
} from "./dto/pasajeros.dto";
import {
  BOARDING_PASS_TTL_MINUTES,
  buildBoardingQrPayload,
  estimateEtaMinutes,
  generateBoardingToken,
  verifyBoardingPassToken,
} from "./boarding.calc";

export const BOARDING_PASS_INVALID = "BOARDING_PASS_INVALID";

/**
 * Pasajeros App corporativo/especial (Módulo 20).
 */
@Injectable()
export class PassengerAppService {
  private readonly logger = new Logger(PassengerAppService.name);

  constructor(private prisma: PrismaService) {}

  async generateBoardingPass(
    organizationId: string,
    dto: GenerateBoardingPassDto,
  ) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: dto.tripId, organizationId },
      include: {
        vehicle: { select: { id: true, plate: true } },
        customer: { select: { id: true, name: true } },
      },
    });
    if (!trip) throw new NotFoundException("Viaje no encontrado");
    if (
      trip.status === TripStatus.CANCELLED ||
      trip.status === TripStatus.COMPLETED
    ) {
      throw new BadRequestException(
        "No se emite boarding pass para viajes cerrados",
      );
    }

    const passenger = await this.resolveOrCreatePassenger(organizationId, dto);
    const ttl = dto.ttlMinutes ?? BOARDING_PASS_TTL_MINUTES;
    const expiresAt = new Date(Date.now() + ttl * 60_000);
    const token = generateBoardingToken();
    const qrPayload = buildBoardingQrPayload({
      token,
      tripId: trip.id,
      passengerId: passenger.id,
      organizationId,
      expiresAt,
    });

    const pass = await this.prisma.boardingPass.create({
      data: {
        organizationId,
        passengerId: passenger.id,
        tripId: trip.id,
        token,
        qrPayload,
        status: BoardingPassStatus.ISSUED,
        expiresAt,
        seatLabel: dto.seatLabel,
        meta: {
          tripCode: trip.code,
          plate: trip.vehicle?.plate,
          customerName: trip.customer?.name,
        },
      },
      include: {
        passenger: {
          select: { id: true, name: true, document: true, phone: true },
        },
        trip: { select: { id: true, code: true, origin: true, destination: true } },
      },
    });

    this.logger.log(
      `[PASAJEROS] boarding pass ${pass.id.slice(0, 8)} trip=${trip.code}`,
    );

    return {
      ...pass,
      qrDataUrlHint: `fleetline-boarding://${token}`,
      ttlMinutes: ttl,
    };
  }

  async validateBoarding(
    organizationId: string,
    dto: ValidateBoardingPassDto,
    validatedById?: string,
  ) {
    let token = dto.token;
    if (!token && dto.qrPayload) {
      try {
        const parsed = JSON.parse(dto.qrPayload) as { token?: string };
        token = parsed.token;
      } catch {
        throw new BadRequestException("qrPayload inválido");
      }
    }
    if (!token) throw new BadRequestException("token requerido");

    const pass = await this.prisma.boardingPass.findFirst({
      where: {
        organizationId,
        token,
        ...(dto.tripId ? { tripId: dto.tripId } : {}),
      },
      include: {
        passenger: true,
        trip: {
          select: {
            id: true,
            code: true,
            status: true,
            vehicleId: true,
          },
        },
      },
    });
    if (!pass) throw new NotFoundException("Boarding pass no encontrado");

    const check = verifyBoardingPassToken({
      token,
      storedToken: pass.token,
      status: pass.status,
      expiresAt: pass.expiresAt,
    });
    if (!check.ok) {
      if (check.reason === "EXPIRED" && pass.status === BoardingPassStatus.ISSUED) {
        await this.prisma.boardingPass.update({
          where: { id: pass.id },
          data: { status: BoardingPassStatus.EXPIRED },
        });
      }
      throw new UnprocessableEntityException({
        error: BOARDING_PASS_INVALID,
        message: "Boarding pass inválido o vencido",
        reason: check.reason,
      });
    }

    const updated = await this.prisma.boardingPass.update({
      where: { id: pass.id },
      data: {
        status: BoardingPassStatus.VALIDATED,
        validatedAt: new Date(),
        validatedById,
      },
      include: {
        passenger: {
          select: { id: true, name: true, document: true },
        },
        trip: { select: { id: true, code: true } },
      },
    });

    this.logger.log(
      `[PASAJEROS] validado pass trip=${updated.trip.code} pax=${updated.passenger.name}`,
    );

    return { valid: true, pass: updated };
  }

  async tripTracking(organizationId: string, tripId: string) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, organizationId },
      include: {
        vehicle: {
          select: {
            id: true,
            plate: true,
            lat: true,
            lng: true,
            status: true,
            updatedAt: true,
          },
        },
        route: {
          select: {
            id: true,
            name: true,
            destination: true,
            etaMinutes: true,
            distanceKm: true,
          },
        },
        driver: { select: { id: true, name: true, phone: true } },
      },
    });
    if (!trip) throw new NotFoundException("Viaje no encontrado");

    const destLat = 4.65;
    const destLng = -74.06;
    const fromLat = trip.vehicle?.lat ?? 4.711;
    const fromLng = trip.vehicle?.lng ?? -74.0721;
    const eta = estimateEtaMinutes({
      fromLat,
      fromLng,
      toLat: destLat,
      toLng: destLng,
    });

    return {
      tripId: trip.id,
      code: trip.code,
      status: trip.status,
      origin: trip.origin,
      destination: trip.destination,
      vehicle: trip.vehicle
        ? {
            id: trip.vehicle.id,
            plate: trip.vehicle.plate,
            status: trip.vehicle.status,
            location: {
              lat: trip.vehicle.lat,
              lng: trip.vehicle.lng,
              at: trip.vehicle.updatedAt.toISOString(),
            },
          }
        : null,
      driver: trip.driver,
      eta: {
        minutes: trip.route?.etaMinutes ?? eta.etaMinutes,
        distanceKm: trip.route?.distanceKm ?? eta.distanceKm,
        arrivalEstimate: new Date(
          Date.now() + (trip.route?.etaMinutes ?? eta.etaMinutes) * 60_000,
        ).toISOString(),
      },
    };
  }

  private async resolveOrCreatePassenger(
    organizationId: string,
    dto: GenerateBoardingPassDto,
  ) {
    if (dto.passengerId) {
      const p = await this.prisma.passengerProfile.findFirst({
        where: { id: dto.passengerId, organizationId },
      });
      if (!p) throw new NotFoundException("Pasajero no encontrado");
      return p;
    }
    return this.prisma.passengerProfile.create({
      data: {
        organizationId,
        name: dto.passengerName!,
        document: dto.document,
        phone: dto.phone,
        customerId: dto.customerId,
      },
    });
  }
}
