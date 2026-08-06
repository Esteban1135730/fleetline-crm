import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { TripAuditAction } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { LogisticsGateway } from "../logistics/logistics.gateway";

@Injectable()
export class MobileChatService {
  constructor(
    private prisma: PrismaService,
    private gateway: LogisticsGateway,
  ) {}

  async listTripChat(organizationId: string, tripId: string) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, organizationId },
      select: { id: true },
    });
    if (!trip) throw new NotFoundException("Viaje no encontrado");
    return this.prisma.tripChatMessage.findMany({
      where: { tripId, organizationId },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
  }

  async postTripChat(
    organizationId: string,
    tripId: string,
    author: { userId: string; name: string; role: string },
    body: string,
  ) {
    const text = body.trim();
    if (!text) throw new ForbiddenException("Mensaje vacío");
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, organizationId },
      select: { id: true, code: true },
    });
    if (!trip) throw new NotFoundException("Viaje no encontrado");

    const msg = await this.prisma.tripChatMessage.create({
      data: {
        organizationId,
        tripId,
        authorUserId: author.userId,
        authorName: author.name,
        authorRole: author.role,
        body: text,
        serverTime: new Date(),
      },
    });

    await this.prisma.tripAuditLog.create({
      data: {
        organizationId,
        tripId,
        action: TripAuditAction.CHAT,
        message: `Chat viaje: ${text.slice(0, 120)}`,
        actorUserId: author.userId,
        serverTime: msg.serverTime,
        meta: { messageId: msg.id },
      },
    });

    this.gateway.emitTripChat(organizationId, tripId, msg);
    return msg;
  }

  async listSupport(organizationId: string) {
    return this.prisma.supportChatMessage.findMany({
      where: { organizationId },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
  }

  async postSupport(
    organizationId: string,
    author: { userId: string; name: string; role: string },
    body: string,
  ) {
    const text = body.trim();
    if (!text) throw new ForbiddenException("Mensaje vacío");
    const msg = await this.prisma.supportChatMessage.create({
      data: {
        organizationId,
        authorUserId: author.userId,
        authorName: author.name,
        authorRole: author.role,
        body: text,
        serverTime: new Date(),
      },
    });
    this.gateway.emitSupportChat(organizationId, msg);
    return msg;
  }
}
