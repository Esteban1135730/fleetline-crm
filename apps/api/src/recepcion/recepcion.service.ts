import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  CustomerSegment,
  NotificationKind,
  PqrsType,
  QuoteStatus,
  Role,
  TicketChannel,
  TicketPriority,
  TicketStatus,
  TripStatus,
  VisitBoardStatus,
  VisitClass,
  VisitorKind,
} from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";
import { KafkaEventsService } from "../logistics/kafka-events.service";
import { LogisticsGateway } from "../logistics/logistics.gateway";
import { NotificationsService } from "../notifications/notifications.service";
import { buildVisitorPass } from "../pqrs/pqrs.calc";
import type {
  ConvertLeadDto,
  QuickPqrsDto,
  RadarQuery,
  RecepcionCheckInDto,
} from "./dto/recepcion.dto";

const OMNICANAL_TAGS = [
  "COTIZACION_B2B",
  "ATENCION_PADRES",
  "SOPORTE_RUTA",
  "PROVEEDORES",
] as const;

@Injectable()
export class RecepcionService {
  private readonly logger = new Logger(RecepcionService.name);

  constructor(
    private prisma: PrismaService,
    private kafka: KafkaEventsService,
    private gateway: LogisticsGateway,
    private notifications: NotificationsService,
  ) {}

  /** Autocompletado por cédula — último registro del documento */
  async lookupByDocument(organizationId: string, document: string) {
    const doc = document.trim();
    if (doc.length < 4) return null;
    const prev = await this.prisma.visitor.findFirst({
      where: { organizationId, document: doc },
      orderBy: { checkedInAt: "desc" },
    });
    if (!prev) return null;
    return {
      name: prev.name,
      document: prev.document,
      company: prev.company,
      phone: prev.phone,
      hostName: prev.hostName,
      visitClass: prev.visitClass,
      kind: prev.kind,
    };
  }

  async listTodayVisitors(
    organizationId: string,
    boardStatus?: VisitBoardStatus,
  ) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return this.prisma.visitor.findMany({
      where: {
        organizationId,
        checkedInAt: { gte: start },
        ...(boardStatus ? { boardStatus } : {}),
      },
      orderBy: { checkedInAt: "desc" },
      take: 200,
    });
  }

  async checkIn(
    organizationId: string,
    actorUserId: string,
    dto: RecepcionCheckInDto,
  ) {
    const visitClass = (dto.visitClass as VisitClass) || VisitClass.OTHER;
    const kind = (dto.kind as VisitorKind) || VisitorKind.VISITOR;
    const boardStatus =
      (dto.boardStatus as VisitBoardStatus) || VisitBoardStatus.CHECKED_IN;
    const siteLabel = dto.siteLabel || "SEDE_PRINCIPAL";

    if (kind === VisitorKind.CONTRACTOR) {
      const arlOk =
        dto.arlValid === true &&
        (!dto.arlExpiresAt || dto.arlExpiresAt.getTime() > Date.now());
      if (!arlOk) {
        throw new BadRequestException(
          "Contratista requiere ARL vigente para check-in",
        );
      }
    }

    const open = await this.prisma.visitor.findFirst({
      where: {
        organizationId,
        document: dto.document.trim(),
        checkedOutAt: null,
        boardStatus: { not: VisitBoardStatus.CHECKED_OUT },
      },
    });
    if (open) {
      throw new BadRequestException(
        `Visitante ya en sede (pase ${open.passCode || open.id})`,
      );
    }

    const { passCode, qrPayload } = buildVisitorPass({
      organizationId,
      document: dto.document.trim(),
      name: dto.name.trim(),
      siteLabel,
    });

    const visitor = await this.prisma.visitor.create({
      data: {
        organizationId,
        name: dto.name.trim(),
        document: dto.document.trim(),
        reason: dto.reason.trim(),
        hostName: dto.hostName.trim(),
        company: dto.company,
        kind,
        visitClass,
        boardStatus,
        badgeRfid: dto.badgeRfid?.trim() || null,
        hostUserId: dto.hostUserId || null,
        siteLabel,
        phone: dto.phone,
        arlValid: dto.arlValid ?? kind === VisitorKind.VISITOR,
        arlExpiresAt: dto.arlExpiresAt,
        passCode,
        qrPayload,
        badgeIssuedAt: dto.badgeRfid ? new Date() : null,
        checkedInAt: new Date(),
      },
    });

    const eventPayload = {
      visitorId: visitor.id,
      organizationId,
      visitorName: visitor.name,
      document: visitor.document,
      company: visitor.company,
      hostName: visitor.hostName,
      hostUserId: visitor.hostUserId,
      visitClass: visitor.visitClass,
      badgeRfid: visitor.badgeRfid,
      passCode,
      actorUserId,
      at: new Date().toISOString(),
    };

    await this.kafka.emit("visitor.checked_in", eventPayload);
    await this.kafka.emit("frontdesk.visitor.cleared", eventPayload);

    this.gateway.server
      ?.to(`org:${organizationId}`)
      .emit("visitor.checked_in", eventPayload);

    await this.notifyByVisitClass(organizationId, visitor);
    await this.notifyHost(organizationId, visitor);

    this.logger.log(
      `[RECEPCION] check-in ${visitor.name} class=${visitClass} badge=${visitor.badgeRfid || "—"}`,
    );

    return {
      ...visitor,
      pass: { passCode, qrPayload },
      kafkaEvents: ["visitor.checked_in", "frontdesk.visitor.cleared"],
    };
  }

  async updateVisitorBoard(
    organizationId: string,
    id: string,
    data: { boardStatus?: VisitBoardStatus; badgeRfid?: string },
  ) {
    const existing = await this.prisma.visitor.findFirst({
      where: { id, organizationId },
    });
    if (!existing) throw new NotFoundException("Visita no encontrada");

    const boardStatus = data.boardStatus;
    return this.prisma.visitor.update({
      where: { id },
      data: {
        boardStatus,
        badgeRfid: data.badgeRfid ?? undefined,
        badgeIssuedAt: data.badgeRfid ? new Date() : undefined,
        checkedOutAt:
          boardStatus === VisitBoardStatus.CHECKED_OUT
            ? new Date()
            : undefined,
      },
    });
  }

  /** Radar solo lectura — GPS básico de buses en ruta */
  async radarStatus(organizationId: string, query: RadarQuery) {
    const q = (query.q || query.school || query.route || "").trim();
    const trips = await this.prisma.trip.findMany({
      where: {
        organizationId,
        status: {
          in: [
            TripStatus.IN_TRANSIT,
            TripStatus.ASSIGNED,
            TripStatus.AWAITING_PREOP,
          ],
        },
        ...(q
          ? {
              OR: [
                { code: { contains: q, mode: "insensitive" } },
                { origin: { contains: q, mode: "insensitive" } },
                { destination: { contains: q, mode: "insensitive" } },
                { customer: { name: { contains: q, mode: "insensitive" } } },
                { vehicle: { plate: { contains: q, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      include: {
        vehicle: { select: { id: true, plate: true, lat: true, lng: true } },
        driver: { select: { id: true, name: true, phone: true } },
        customer: { select: { id: true, name: true } },
      },
      orderBy: { departAt: "asc" },
      take: 40,
    });

    return {
      readOnly: true,
      canReassign: false,
      canDispatch: false,
      items: trips.map((t) => ({
        tripId: t.id,
        code: t.code,
        status: t.status,
        origin: t.origin,
        destination: t.destination,
        departAt: t.departAt,
        schoolOrRoute: t.customer?.name || t.destination || t.code,
        vehicle: t.vehicle
          ? {
              plate: t.vehicle.plate,
              lat: t.vehicle.lat,
              lng: t.vehicle.lng,
            }
          : null,
        driver: t.driver,
        etaHint: "Estimación operativa — consulta Torre de Control para despacho",
      })),
    };
  }

  async omnicanalInbox(organizationId: string) {
    const tickets = await this.prisma.ticket.findMany({
      where: {
        organizationId,
        status: { in: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS] },
        channel: {
          in: [
            TicketChannel.WHATSAPP,
            TicketChannel.EMAIL,
            TicketChannel.PHONE,
            TicketChannel.VOICE_AI,
          ],
        },
      },
      orderBy: { createdAt: "desc" },
      take: 80,
      include: {
        assignee: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    const inbox = tickets.filter((t) => {
      const meta = (t.meta || {}) as Record<string, unknown>;
      if (meta.assignedAwayFromReception === true) return false;
      if (meta.receptionInbox === false) return false;
      return true;
    });

    return inbox.map((t) => {
      const meta = (t.meta || {}) as Record<string, unknown>;
      const tag =
        typeof meta.omnicanalTag === "string"
          ? meta.omnicanalTag
          : this.inferTag(t.subject, t.message);
      return {
        id: t.id,
        code: t.code,
        subject: t.subject,
        requester: t.requester,
        channel: t.channel,
        message: t.message,
        status: t.status,
        priority: t.priority,
        tag,
        tagLabel: this.tagLabel(tag),
        createdAt: t.createdAt,
        assignee: t.assignee,
      };
    });
  }

  async convertLead(
    organizationId: string,
    actorUserId: string,
    dto: ConvertLeadDto,
  ) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: dto.ticketId, organizationId },
    });
    if (!ticket) throw new NotFoundException("Chat/ticket no encontrado");

    const nit =
      dto.nit?.trim() ||
      `LEAD-${Date.now().toString().slice(-8)}`;

    let customer = await this.prisma.customer.findFirst({
      where: { organizationId, nit },
    });
    if (!customer) {
      customer = await this.prisma.customer.create({
        data: {
          organizationId,
          name: dto.companyName.trim(),
          nit,
          email: dto.email.toLowerCase(),
          phone: dto.phone,
          segment: CustomerSegment.B2B,
        },
      });
    }

    const quoteCode = `LD-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;
    const quote = await this.prisma.quote.create({
      data: {
        code: quoteCode,
        customerId: customer.id,
        amount: 0,
        status: QuoteStatus.DRAFT,
        notes: [
          "FROM_RECEPTION",
          dto.notes || "",
          dto.serviceDate
            ? `Fecha servicio: ${dto.serviceDate.toISOString().slice(0, 10)}`
            : "",
          `Origen chat: ${ticket.code}`,
        ]
          .filter(Boolean)
          .join(" · "),
        calcJson: {
          source: "recepcion_convert_lead",
          ticketId: ticket.id,
          serviceDate: dto.serviceDate?.toISOString() ?? null,
          createdBy: actorUserId,
        },
      },
    });

    let assigneeId = dto.assigneeId;
    if (!assigneeId && dto.assigneeEmail) {
      const u = await this.prisma.user.findFirst({
        where: {
          organizationId,
          email: dto.assigneeEmail.toLowerCase(),
          active: true,
        },
      });
      assigneeId = u?.id;
    }
    if (!assigneeId) {
      const comercial = await this.prisma.user.findFirst({
        where: {
          organizationId,
          active: true,
          role: {
            in: [
              Role.GESTOR_COMERCIAL,
              Role.COORDINADOR_COMERCIAL,
              Role.COMERCIAL,
            ],
          },
        },
        orderBy: { name: "asc" },
      });
      assigneeId = comercial?.id;
    }

    const prevMeta = (ticket.meta || {}) as Record<string, unknown>;
    await this.prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        status: TicketStatus.IN_PROGRESS,
        customerId: customer.id,
        assigneeId: assigneeId ?? null,
        meta: {
          ...prevMeta,
          receptionInbox: false,
          assignedAwayFromReception: true,
          convertedLeadId: quote.id,
          customerId: customer.id,
          omnicanalTag: "COTIZACION_B2B",
        },
      },
    });

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const dailyLeads = await this.prisma.quote.count({
      where: {
        createdAt: { gte: start },
        customer: { organizationId },
        notes: { contains: "FROM_RECEPTION" },
      },
    });

    await this.kafka.emit("recepcion.lead.converted", {
      organizationId,
      ticketId: ticket.id,
      quoteId: quote.id,
      customerId: customer.id,
      assigneeId,
      dailyLeads,
    });

    if (assigneeId) {
      await this.notifications.notify({
        organizationId,
        userIds: [assigneeId],
        kind: NotificationKind.SUPPORT,
        title: "Lead desde Recepción",
        body: `${dto.companyName} — pase de balón omnicanal (${ticket.code})`,
        href: "/comercial",
        payload: { quoteId: quote.id, ticketId: ticket.id },
      });
    }

    return {
      customer,
      quote,
      ticketId: ticket.id,
      assignedAwayFromReception: true,
      dailyLeadMetrics: dailyLeads,
      message: "Chat convertido a Lead · asignado a gestor comercial",
    };
  }

  async quickPqrs(
    organizationId: string,
    actorUserId: string,
    dto: QuickPqrsDto,
  ) {
    const year = new Date().getFullYear();
    const count = await this.prisma.ticket.count({
      where: {
        organizationId,
        createdAt: { gte: new Date(`${year}-01-01`) },
      },
    });
    const code = `PQRS-${year}-${String(count + 1).padStart(4, "0")}`;

    const message = [
      dto.message,
      dto.routeLabel ? `Ruta: ${dto.routeLabel}` : "",
      dto.schoolName ? `Colegio: ${dto.schoolName}` : "",
      dto.vehiclePlate ? `Placa: ${dto.vehiclePlate}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const ticket = await this.prisma.ticket.create({
      data: {
        organizationId,
        code,
        subject: dto.subject || "Retraso en ruta",
        requester: dto.requester,
        message,
        channel: (dto.channel as TicketChannel) || TicketChannel.PHONE,
        status: TicketStatus.OPEN,
        priority: TicketPriority.HIGH,
        pqrsType: PqrsType.COMPLAINT,
        meta: {
          source: "recepcion_quick_ticket",
          tripId: dto.tripId,
          routeLabel: dto.routeLabel,
          schoolName: dto.schoolName,
          createdBy: actorUserId,
          notifyTorre: true,
          notifyQhse: true,
        },
      },
    });

    await this.kafka.emit("recepcion.pqrs.quick_ticket", {
      organizationId,
      ticketId: ticket.id,
      code: ticket.code,
      subject: ticket.subject,
    });

    this.gateway.server
      ?.to(`org:${organizationId}`)
      .emit("recepcion.pqrs.quick_ticket", {
        ticketId: ticket.id,
        code: ticket.code,
      });

    await this.notifications.notify({
      organizationId,
      roles: [
        Role.CENTRO_CONTROL,
        Role.GESTOR_OPERATIVO,
        Role.DIRECTOR_OPERATIVO,
        Role.QHSE,
        Role.SUPERVISOR,
        Role.DESPACHO,
      ],
      kind: NotificationKind.INCIDENT,
      title: "PQRS rápido — Retraso en ruta",
      body: `${ticket.code}: ${ticket.subject}`,
      href: "/qhse",
      payload: { ticketId: ticket.id },
    });

    return ticket;
  }

  async dailyMetrics(organizationId: string) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const [visitors, leads, pqrs] = await Promise.all([
      this.prisma.visitor.count({
        where: { organizationId, checkedInAt: { gte: start } },
      }),
      this.prisma.quote.count({
        where: {
          createdAt: { gte: start },
          customer: { organizationId },
          notes: { contains: "FROM_RECEPTION" },
        },
      }),
      this.prisma.ticket.count({
        where: {
          organizationId,
          createdAt: { gte: start },
          pqrsType: { not: null },
        },
      }),
    ]);
    return { visitors, leadsConverted: leads, pqrsQuick: pqrs };
  }

  private inferTag(subject: string, message: string): string {
    const text = `${subject} ${message}`.toLowerCase();
    if (/cotiz|b2b|empresarial|servicio especial/.test(text))
      return "COTIZACION_B2B";
    if (/padre|colegio|escolar|monitora|ruta escolar/.test(text))
      return "ATENCION_PADRES";
    if (/retraso|bus|placa|gps|ruta|conductor/.test(text))
      return "SOPORTE_RUTA";
    if (/proveedor|factura|pedido|repuesto/.test(text)) return "PROVEEDORES";
    return OMNICANAL_TAGS[0];
  }

  private tagLabel(tag: string) {
    switch (tag) {
      case "COTIZACION_B2B":
        return "Cotización B2B";
      case "ATENCION_PADRES":
        return "Atención a Padres/Colegios";
      case "SOPORTE_RUTA":
        return "Soporte en Ruta";
      case "PROVEEDORES":
        return "Proveedores";
      default:
        return tag;
    }
  }

  private async notifyByVisitClass(
    organizationId: string,
    visitor: {
      name: string;
      company: string | null;
      visitClass: VisitClass;
      passCode: string | null;
    },
  ) {
    const body = `${visitor.name}${visitor.company ? ` (${visitor.company})` : ""} · pase ${visitor.passCode || "—"}`;
    if (visitor.visitClass === VisitClass.DRIVER_CANDIDATE) {
      await this.notifications.notify({
        organizationId,
        roles: [Role.VINCULACIONES, Role.RRHH],
        kind: NotificationKind.SUPPORT,
        title: "Candidato a conductor en recepción",
        body,
        href: "/rrhh",
      });
    } else if (visitor.visitClass === VisitClass.SUPPLIER) {
      await this.notifications.notify({
        organizationId,
        roles: [Role.COMPRAS, Role.COORDINADOR_TALLER, Role.TALLER],
        kind: NotificationKind.SUPPORT,
        title: "Proveedor/contratista en sede",
        body,
        href: "/compras",
      });
    } else if (visitor.visitClass === VisitClass.B2B_MEETING) {
      await this.notifications.notify({
        organizationId,
        roles: [
          Role.GESTOR_COMERCIAL,
          Role.COORDINADOR_COMERCIAL,
          Role.GERENTE_GENERAL,
          Role.COMERCIAL,
        ],
        kind: NotificationKind.SUPPORT,
        title: "Cliente B2B / reunión en lobby",
        body,
        href: "/comercial",
      });
    }
  }

  private async notifyHost(
    organizationId: string,
    visitor: {
      name: string;
      company: string | null;
      hostName: string;
      hostUserId: string | null;
      badgeRfid: string | null;
    },
  ) {
    const title = "Visita ingresó al lobby";
    const body = `${visitor.name}${visitor.company ? ` (${visitor.company})` : ""} · gafete ${visitor.badgeRfid || "sin RFID"}`;
    if (visitor.hostUserId) {
      await this.notifications.notify({
        organizationId,
        userIds: [visitor.hostUserId],
        kind: NotificationKind.SYSTEM,
        title,
        body,
        href: "/recepcion/dashboard",
      });
      return;
    }
    await this.notifications.notify({
      organizationId,
      roles: [Role.RECEPCIONISTA, Role.RECEPCION, Role.ATENCION],
      kind: NotificationKind.SYSTEM,
      title: `${title} · anfitrión ${visitor.hostName}`,
      body,
      href: "/recepcion/dashboard",
    });
  }
}
