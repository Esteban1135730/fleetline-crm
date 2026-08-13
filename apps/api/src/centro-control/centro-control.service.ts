import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { HARD_RULES } from "@fsg/shared";
import { PrismaService } from "../prisma/prisma.service";
import { KafkaEventsService } from "../logistics/kafka-events.service";
import type {
  ActivarSosDto,
  ApagadoRemotoDto,
  FatigaIntervencionDto,
  TipificarDesvioDto,
} from "./dto/centro-control.dto";
import {
  canTransmitEngineShutdown,
  isFatigueYellowZone,
} from "./dto/centro-control.dto";

/**
 * Módulo 10 — Centro de Control 24/7 / Watchtower (Valeria).
 */
@Injectable()
export class CentroControlService {
  private readonly logger = new Logger(CentroControlService.name);

  constructor(
    private prisma: PrismaService,
    private kafka: KafkaEventsService,
  ) {}

  /**
   * Tipificar desvío de geocerca → alarma + VoIP conductor + SMS cliente.
   */
  async tipificarDesvio(
    organizationId: string,
    operatorId: string,
    dto: TipificarDesvioDto,
  ) {
    const count = await this.prisma.watchtowerDeviation.count({
      where: { organizationId },
    });
    const code = `WTD-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;

    let plate = dto.plate;
    let driverId = dto.driverId;
    let customerPhone: string | null = null;
    let driverPhone: string | null = null;

    if (dto.vehicleId || dto.tripId) {
      const trip = dto.tripId
        ? await this.prisma.trip.findFirst({
            where: { id: dto.tripId, organizationId },
            include: {
              vehicle: true,
              driver: true,
              customer: true,
            },
          })
        : null;
      if (trip) {
        plate = plate || trip.vehicle?.plate;
        driverId = driverId || trip.driverId || undefined;
        driverPhone = trip.driver?.phone ?? null;
        customerPhone = trip.customer?.phone ?? null;
      } else if (dto.vehicleId) {
        const v = await this.prisma.vehicle.findFirst({
          where: { id: dto.vehicleId, organizationId },
        });
        plate = plate || v?.plate;
      }
    }

    const voip = dto.initiateVoip !== false;
    const sms = dto.sendSmsToCustomer !== false;

    const deviation = await this.prisma.watchtowerDeviation.create({
      data: {
        organizationId,
        code,
        tripId: dto.tripId,
        vehicleId: dto.vehicleId,
        plate,
        driverId,
        tipificacion: dto.tipificacion,
        notes: dto.notes,
        lat: dto.lat,
        lng: dto.lng,
        voipInitiated: voip,
        smsToCustomer: sms,
        alarmTriggered: true,
        status: "OPEN",
        tipificadoById: operatorId,
        meta: {
          popup: true,
          sonicAlarm: true,
          driverPhone,
          customerPhone,
        },
      },
    });

    if (voip) {
      await this.kafka.emit("watchtower.voip.driver", {
        organizationId,
        deviationId: deviation.id,
        code,
        driverId,
        driverPhone,
        plate,
        reason: dto.tipificacion,
      });
    }
    if (sms) {
      await this.kafka.emit("watchtower.sms.customer", {
        organizationId,
        deviationId: deviation.id,
        code,
        customerPhone,
        plate,
        message: `Unidad ${plate || "N/D"} fuera de tubo virtual — verificación en curso.`,
      });
    }

    await this.kafka.emit("watchtower.desvio.tipificado", {
      organizationId,
      deviationId: deviation.id,
      code,
      tipificacion: dto.tipificacion,
      plate,
    });

    this.logger.warn(
      `Desvío ${code} · ${dto.tipificacion} · placa=${plate ?? "n/a"} · VoIP=${voip}`,
    );

    return {
      deviation,
      alarm: { sonic: true, popup: true },
      voip: { initiated: voip, target: driverPhone },
      sms: { sent: sms, target: customerPhone },
      message: `Desvío tipificado (${code}) — alarma activa`,
    };
  }

  /**
   * Activar War Room / SOS → DEFCON 1.
   */
  async activarSos(
    organizationId: string,
    operatorId: string,
    dto: ActivarSosDto,
  ) {
    const count = await this.prisma.watchtowerSosSession.count({
      where: { organizationId },
    });
    const code = `SOS-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;

    let plate = dto.plate;
    if (!plate && dto.vehicleId) {
      const v = await this.prisma.vehicle.findFirst({
        where: { id: dto.vehicleId, organizationId },
      });
      plate = v?.plate;
    }

    const checklist = {
      contactPolice: dto.contactPolice !== false,
      notifyDirector: dto.notifyDirector !== false,
      ambientListen: dto.enableAmbientListen !== false,
      cabinStream: dto.enableCabinStream !== false,
      engineShutdownAuthorized: dto.authorizeEngineShutdown === true,
      steps: [
        "Contactar cuadrante de policía cercano",
        "Escucha ambiental silenciosa",
        "Streaming cámaras IP cabina (si existen)",
        "Notificar Dirección Operativa",
        "Apagado remoto motor (solo con autorización)",
      ],
    };

    const session = await this.prisma.watchtowerSosSession.create({
      data: {
        organizationId,
        code,
        tripId: dto.tripId,
        vehicleId: dto.vehicleId,
        plate,
        driverId: dto.driverId,
        activatedById: operatorId,
        defconLevel: 1,
        status: "ACTIVE",
        ambientListen: dto.enableAmbientListen !== false,
        cabinStream: dto.enableCabinStream !== false,
        policeContacted: dto.contactPolice !== false,
        directorNotified: dto.notifyDirector !== false,
        engineShutdownAuthorized: dto.authorizeEngineShutdown === true,
        confirmedAt: new Date(),
        notes: dto.notes,
        checklist,
        meta: { uiMode: "DEFCON_1_RED", warRoom: true },
      },
    });

    if (dto.contactPolice !== false) {
      await this.kafka.emit("watchtower.sos.police", {
        organizationId,
        sosId: session.id,
        code,
        plate,
        lat: null,
        lng: null,
      });
    }
    if (dto.notifyDirector !== false) {
      await this.kafka.emit("watchtower.sos.director", {
        organizationId,
        sosId: session.id,
        code,
        plate,
        targetRole: "DIRECTOR_OPERATIVO",
        priority: "CRITICAL",
      });
    }

    await this.kafka.emit("watchtower.sos.activated", {
      organizationId,
      sosId: session.id,
      code,
      defcon: 1,
      plate,
    });

    this.logger.error(
      `SOS ${code} DEFCON 1 · placa=${plate ?? "n/a"} · war room activo`,
    );

    return {
      session,
      ui: { mode: "DEFCON_1_RED", warRoom: true },
      checklist,
      message: `Protocolo SOS activado (${code}) — Modo Rojo DEFCON 1`,
    };
  }

  /**
   * Apagado remoto IoT — solo con SOS activo + confirmación de protocolo.
   */
  async apagadoRemoto(
    organizationId: string,
    operatorId: string,
    dto: ApagadoRemotoDto,
  ) {
    const sos = await this.prisma.watchtowerSosSession.findFirst({
      where: { id: dto.sosSessionId, organizationId },
    });
    if (!sos) throw new NotFoundException("Sesión SOS no encontrada");

    const gate = canTransmitEngineShutdown({
      sosStatus: sos.status,
      engineShutdownAuthorized: sos.engineShutdownAuthorized,
      confirmProtocol: dto.confirmProtocol === true,
    });
    if (!gate.ok) {
      throw new ForbiddenException(gate.reason);
    }

    const vehicleId = dto.vehicleId || sos.vehicleId || undefined;
    let plate = dto.plate || sos.plate || undefined;
    if (!plate && vehicleId) {
      const v = await this.prisma.vehicle.findFirst({
        where: { id: vehicleId, organizationId },
      });
      plate = v?.plate;
    }

    const transmittedAt = new Date();
    const cmd = await this.prisma.watchtowerIotCommand.create({
      data: {
        organizationId,
        sosSessionId: sos.id,
        vehicleId,
        plate,
        command: "ENGINE_SHUTDOWN",
        status: "SENT",
        requestedById: operatorId,
        confirmedProtocol: true,
        transmittedAt,
        payload: {
          reason: dto.reason || "SOS_PROTOCOL",
          channel: "IOT_MQTT",
          topic: `fleet/${organizationId}/${vehicleId || plate}/engine/shutdown`,
        },
      },
    });

    await this.kafka.emit("watchtower.iot.engine_shutdown", {
      organizationId,
      commandId: cmd.id,
      sosSessionId: sos.id,
      vehicleId,
      plate,
      transmittedAt: transmittedAt.toISOString(),
    });

    this.logger.error(
      `IoT ENGINE_SHUTDOWN enviado · cmd=${cmd.id} · SOS=${sos.code} · placa=${plate ?? "n/a"}`,
    );

    return {
      command: cmd,
      transmitted: true,
      message: `Comando IoT apagado remoto transmitido (${cmd.id})`,
    };
  }

  /**
   * Intervención fatiga — zona amarilla → parada 15 km → QHSE si se ignora.
   */
  async intervencionFatiga(
    organizationId: string,
    operatorId: string,
    dto: FatigaIntervencionDto,
  ) {
    if (!isFatigueYellowZone(dto.fatigueScore)) {
      throw new BadRequestException(
        `Score ${dto.fatigueScore} fuera de Zona Amarilla (${HARD_RULES.FATIGUE_YELLOW_MIN}–${HARD_RULES.FATIGUE_YELLOW_MAX})`,
      );
    }

    const stopKm =
      dto.distanceKmToStop ?? HARD_RULES.FATIGUE_STOP_INSTRUCTION_KM;

    const alert = await this.prisma.watchtowerFatigueAlert.create({
      data: {
        organizationId,
        driverId: dto.driverId,
        vehicleId: dto.vehicleId,
        plate: dto.plate,
        tripId: dto.tripId,
        fatigueScore: dto.fatigueScore,
        zone: "YELLOW",
        stopInstructionKm: stopKm,
        stopInstructedAt: new Date(),
        ignored: dto.ignoredStop === true,
        qhseEscalated: false,
        status: "OPEN",
        meta: { operatorId },
      },
    });

    await this.kafka.emit("watchtower.fatigue.stop_instruction", {
      organizationId,
      alertId: alert.id,
      driverId: dto.driverId,
      plate: dto.plate,
      stopKm,
      fatigueScore: dto.fatigueScore,
    });

    let qhseTicket: {
      id: string;
      kind: string;
      title: string;
      status: string;
    } | null = null;
    if (dto.ignoredStop) {
      qhseTicket = await this.prisma.qualityEvent.create({
        data: {
          organizationId,
          kind: "FALTA_GRAVE_FATIGA",
          title: `Falta Grave · Fatiga ignorada · score ${dto.fatigueScore}`,
          status: "OPEN",
          npsScore: null,
        },
      });
      await this.prisma.watchtowerFatigueAlert.update({
        where: { id: alert.id },
        data: {
          qhseEscalated: true,
          qhseTicketId: qhseTicket.id,
          ignored: true,
          status: "ESCALATED",
        },
      });
      await this.kafka.emit("watchtower.fatigue.qhse_escalated", {
        organizationId,
        alertId: alert.id,
        ticketId: qhseTicket.id,
        driverId: dto.driverId,
      });
    }

    return {
      alert: {
        ...alert,
        ignored: dto.ignoredStop === true,
        qhseEscalated: Boolean(qhseTicket),
        qhseTicketId: qhseTicket?.id ?? null,
      },
      stopInstruction: { km: stopKm, sent: true },
      qhseTicket,
      message: qhseTicket
        ? "Parada ignorada — Falta Grave elevada a QHSE"
        : `Instrucción de parada activa a ${stopKm} km enviada`,
    };
  }

  async dashboard(organizationId: string) {
    const [deviations, sosActive, fatigueOpen, recentIot] = await Promise.all([
      this.prisma.watchtowerDeviation.findMany({
        where: { organizationId, status: "OPEN" },
        orderBy: { createdAt: "desc" },
        take: 40,
      }),
      this.prisma.watchtowerSosSession.findMany({
        where: { organizationId, status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      this.prisma.watchtowerFatigueAlert.findMany({
        where: {
          organizationId,
          status: { in: ["OPEN", "ESCALATED"] },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      this.prisma.watchtowerIotCommand.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

    const drivers = await this.prisma.driver.findMany({
      where: {
        organizationId,
        fatigueScore: {
          gte: HARD_RULES.FATIGUE_YELLOW_MIN,
        },
        active: true,
      },
      select: {
        id: true,
        name: true,
        phone: true,
        fatigueScore: true,
        document: true,
      },
      take: 30,
      orderBy: { fatigueScore: "desc" },
    });

    const anomalies = [
      ...deviations.map((d) => ({
        kind: "DESVIO" as const,
        id: d.id,
        plate: d.plate,
        label: d.tipificacion,
        severity: "HIGH" as const,
        at: d.createdAt,
      })),
      ...sosActive.map((s) => ({
        kind: "SOS" as const,
        id: s.id,
        plate: s.plate,
        label: `DEFCON ${s.defconLevel}`,
        severity: "CRITICAL" as const,
        at: s.createdAt,
      })),
      ...fatigueOpen.map((f) => ({
        kind: "FATIGA" as const,
        id: f.id,
        plate: f.plate,
        label: `Score ${f.fatigueScore}`,
        severity: f.qhseEscalated ? ("CRITICAL" as const) : ("WARN" as const),
        at: f.createdAt,
      })),
    ].sort((a, b) => +new Date(b.at) - +new Date(a.at));

    return {
      anomalies,
      deviations,
      sosActive,
      fatigueOpen,
      recentIot,
      voipDirectory: drivers.map((d) => ({
        driverId: d.id,
        name: d.name,
        phone: d.phone,
        fatigueScore: d.fatigueScore,
        zone: isFatigueYellowZone(d.fatigueScore) ? "YELLOW" : "OTHER",
      })),
      ui: {
        theme: "video_wall_dark",
        defcon: sosActive.length > 0 ? 1 : 0,
        warRoom: sosActive.length > 0,
      },
      rules: {
        fatigueYellowMin: HARD_RULES.FATIGUE_YELLOW_MIN,
        fatigueYellowMax: HARD_RULES.FATIGUE_YELLOW_MAX,
        stopInstructionKm: HARD_RULES.FATIGUE_STOP_INSTRUCTION_KM,
      },
    };
  }
}
