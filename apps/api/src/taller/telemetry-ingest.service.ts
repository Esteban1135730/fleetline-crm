import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { VehicleStatus, WorkOrderStatus } from "@fsg/db";
import { HARD_RULES } from "@fsg/shared";
import { PrismaService } from "../prisma/prisma.service";
import { KafkaEventsService } from "../logistics/kafka-events.service";
import type { TelemetryIngestDto } from "./dto/taller.dto";

/**
 * Ingest IoT / OBD-II (mock + estructura).
 * Actualiza odómetro y genera OT preventiva al cruzar umbral.
 */
@Injectable()
export class TelemetryIngestService {
  private readonly logger = new Logger(TelemetryIngestService.name);

  constructor(
    private prisma: PrismaService,
    private kafka: KafkaEventsService,
  ) {}

  async ingest(organizationId: string, dto: TelemetryIngestDto) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: dto.vehicleId, organizationId },
    });
    if (!vehicle) throw new NotFoundException("Vehículo no encontrado");

    const prevKm = vehicle.odometerKm;
    const nextKm =
      dto.odometerKm != null ? Math.max(dto.odometerKm, prevKm) : prevKm;
    const interval =
      vehicle.maintenanceEveryKm || HARD_RULES.MAINTENANCE_INTERVAL_KM;

    await this.prisma.vehicle.update({
      where: { id: vehicle.id },
      data: { odometerKm: nextKm },
    });

    if (dto.odometerKm != null || dto.speedKph != null) {
      await this.prisma.gpsSnapshot.create({
        data: {
          vehicleId: vehicle.id,
          lat: vehicle.lat,
          lng: vehicle.lng,
          speedKph: dto.speedKph,
        },
      });
    }

    const crossed =
      Math.floor(prevKm / interval) < Math.floor(nextKm / interval);

    let preventiveWo = null;
    let alert = null;

    if (crossed) {
      const openPrev = await this.prisma.workOrder.findFirst({
        where: {
          organizationId,
          vehicleId: vehicle.id,
          status: {
            in: [WorkOrderStatus.OPEN, WorkOrderStatus.IN_PROGRESS],
          },
          description: { contains: "Preventivo odómetro" },
        },
      });

      if (!openPrev) {
        const count = await this.prisma.workOrder.count({
          where: { organizationId },
        });
        preventiveWo = await this.prisma.workOrder.create({
          data: {
            code: `OT-P-${String(count + 1).padStart(4, "0")}`,
            description: `Preventivo odómetro — umbral ${interval} km (${nextKm} km)`,
            vehicleId: vehicle.id,
            organizationId,
            odometerAtOpen: nextKm,
            status: WorkOrderStatus.OPEN,
          },
        });

        await this.prisma.vehicle.update({
          where: { id: vehicle.id },
          data: { status: VehicleStatus.MAINTENANCE },
        });

        alert = await this.prisma.systemAlert.create({
          data: {
            organizationId,
            severity: "WARNING",
            source: "TELEMETRY_ODOMETER",
            message: `${vehicle.plate}: mantenimiento preventivo por odómetro ${nextKm} km`,
          },
        });

        await this.kafka.emit("taller.mantenimiento.programado", {
          vehicleId: vehicle.id,
          organizationId,
          workOrderId: preventiveWo.id,
          odometerKm: nextKm,
          intervalKm: interval,
        });

        this.logger.log(
          `[TELEMETRY] preventiva ${preventiveWo.code} para ${vehicle.plate}`,
        );
      }
    }

    let faultAlert = null;
    if (dto.obdCode) {
      faultAlert = await this.prisma.systemAlert.create({
        data: {
          organizationId,
          severity: "CRITICAL",
          source: "TELEMETRY_OBD",
          message: `${vehicle.plate}: OBD ${dto.obdCode} — ${dto.faultMessage || "falla motor"}`,
        },
      });
      await this.kafka.emit("taller.telemetria.falla_obd", {
        vehicleId: vehicle.id,
        organizationId,
        obdCode: dto.obdCode,
        faultMessage: dto.faultMessage,
        raw: dto.raw,
      });
    }

    return {
      vehicleId: vehicle.id,
      plate: vehicle.plate,
      odometerKm: nextKm,
      previousOdometerKm: prevKm,
      maintenanceEveryKm: interval,
      preventiveWorkOrder: preventiveWo,
      alerts: [alert, faultAlert].filter(Boolean),
      source: "IOT_MOCK",
    };
  }
}
