import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  PqrsType,
  TicketChannel,
  TicketPriority,
  TicketStatus,
} from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";
import { KafkaEventsService } from "../logistics/kafka-events.service";
import type {
  CreatePqrsTicketDto,
  ListPqrsTicketsQuery,
  ResolvePqrsTicketDto,
} from "./dto/pqrs.dto";
import {
  computeSlaDueAt,
  isSlaBreached,
  resolveEscalationTarget,
  resolveSlaHours,
} from "./pqrs.calc";

const ticketInclude = {
  customer: { select: { id: true, name: true, nit: true } },
  vehicle: { select: { id: true, plate: true } },
  driver: { select: { id: true, name: true, document: true } },
  assignee: { select: { id: true, name: true } },
} as const;

@Injectable()
export class PqrsTicketService {
  private readonly logger = new Logger(PqrsTicketService.name);

  constructor(
    private prisma: PrismaService,
    private kafka: KafkaEventsService,
  ) {}

  list(organizationId: string, query: ListPqrsTicketsQuery) {
    return this.prisma.ticket.findMany({
      where: {
        organizationId,
        pqrsType: query.type
          ? (query.type as PqrsType)
          : { not: null },
        ...(query.status ? { status: query.status as TicketStatus } : {}),
        ...(query.priority
          ? { priority: query.priority as TicketPriority }
          : {}),
        ...(query.customerId ? { customerId: query.customerId } : {}),
        ...(query.q
          ? {
              OR: [
                { subject: { contains: query.q, mode: "insensitive" } },
                { requester: { contains: query.q, mode: "insensitive" } },
                { code: { contains: query.q, mode: "insensitive" } },
                { message: { contains: query.q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: ticketInclude,
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    });
  }

  async create(organizationId: string, dto: CreatePqrsTicketDto) {
    if (dto.customerId) {
      const c = await this.prisma.customer.findFirst({
        where: { id: dto.customerId, organizationId },
      });
      if (!c) throw new NotFoundException("Cliente no encontrado");
    }
    if (dto.vehicleId) {
      const v = await this.prisma.vehicle.findFirst({
        where: { id: dto.vehicleId, organizationId },
      });
      if (!v) throw new NotFoundException("Vehículo no encontrado");
    }
    if (dto.driverId) {
      const d = await this.prisma.driver.findFirst({
        where: { id: dto.driverId, organizationId },
      });
      if (!d) throw new NotFoundException("Conductor no encontrado");
    }

    const pqrsType = dto.type as PqrsType;
    const priority = (dto.priority as TicketPriority) || TicketPriority.MEDIUM;
    const slaHours = resolveSlaHours(pqrsType, priority);
    const createdAt = new Date();
    const slaDueAt = computeSlaDueAt(createdAt, slaHours);
    const escalation = resolveEscalationTarget({
      type: pqrsType,
      priority,
      driverId: dto.driverId,
      vehicleId: dto.vehicleId,
      message: dto.message,
    });

    const count = await this.prisma.ticket.count({ where: { organizationId } });
    const ticket = await this.prisma.ticket.create({
      data: {
        organizationId,
        code: `PQRS-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`,
        subject: dto.subject,
        requester: dto.requester,
        message: dto.message,
        pqrsType,
        priority,
        channel: (dto.channel as TicketChannel) || TicketChannel.WEB,
        customerId: dto.customerId,
        vehicleId: dto.vehicleId,
        driverId: dto.driverId,
        assigneeId: dto.assigneeId,
        slaHours,
        slaDueAt,
        status: TicketStatus.OPEN,
        escalatedToRrhh: escalation.rrhh,
        escalatedToHqse: escalation.hqse,
      },
      include: ticketInclude,
    });

    if (escalation.rrhh) {
      await this.kafka.emit("pqrs.ticket.escalated.rrhh", {
        organizationId,
        ticketId: ticket.id,
        code: ticket.code,
        driverId: dto.driverId,
        priority,
        pqrsType,
        subject: ticket.subject,
      });
      this.logger.warn(
        `[PQRS] escalado RRHH ${ticket.code} driver=${dto.driverId}`,
      );
    }
    if (escalation.hqse) {
      await this.kafka.emit("pqrs.ticket.escalated.hqse", {
        organizationId,
        ticketId: ticket.id,
        code: ticket.code,
        vehicleId: dto.vehicleId,
        driverId: dto.driverId,
        priority,
        pqrsType,
        subject: ticket.subject,
      });
      this.logger.warn(
        `[PQRS] escalado HQSE ${ticket.code} vehicle=${dto.vehicleId}`,
      );
    }

    return {
      ...ticket,
      sla: { hours: slaHours, dueAt: slaDueAt.toISOString() },
      escalation,
    };
  }

  async resolve(
    organizationId: string,
    id: string,
    dto: ResolvePqrsTicketDto,
  ) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id, organizationId },
    });
    if (!ticket) throw new NotFoundException("Ticket PQRS no encontrado");
    if (
      ticket.status === TicketStatus.CLOSED ||
      ticket.status === TicketStatus.RESOLVED
    ) {
      throw new BadRequestException("El ticket ya fue resuelto/cerrado");
    }

    const resolvedAt = new Date();
    const status = (dto.status as TicketStatus) || TicketStatus.RESOLVED;
    const slaBreached = isSlaBreached(ticket.slaDueAt, resolvedAt);

    const updated = await this.prisma.ticket.update({
      where: { id },
      data: {
        status,
        resolvedAt,
        resolutionNotes: dto.resolutionNotes,
        slaBreached,
      },
      include: ticketInclude,
    });

    const responseMs = resolvedAt.getTime() - ticket.createdAt.getTime();
    const slaMs = (ticket.slaHours || 0) * 3_600_000;

    return {
      ...updated,
      slaTracking: {
        slaHours: ticket.slaHours,
        slaDueAt: ticket.slaDueAt,
        resolvedAt,
        slaBreached,
        responseHours: Math.round((responseMs / 3_600_000) * 10) / 10,
        withinSla: !slaBreached && responseMs <= slaMs,
      },
    };
  }
}
