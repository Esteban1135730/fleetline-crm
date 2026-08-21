import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  ConnectedSocket,
  WsException,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { LogisticsService } from "./logistics.service";

type SocketUser = {
  userId: string;
  email: string;
  role: string;
  organizationId: string;
};

@WebSocketGateway({
  cors: {
    origin: (
      process.env.CORS_ORIGINS ||
      "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001,http://localhost:8081,http://localhost:19006"
    )
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    credentials: true,
  },
  namespace: "/logistics",
})
export class LogisticsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  constructor(
    private logistics: LogisticsService,
    private jwt: JwtService,
  ) {}

  afterInit() {
    console.log("Logistics WebSocket gateway ready (/logistics)");
  }

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ||
        (client.handshake.headers.authorization || "")
          .replace(/^Bearer\s+/i, "")
          .trim();
      if (!token) throw new Error("Sin token");

      const payload = await this.jwt.verifyAsync<{
        sub: string;
        email: string;
        role: string;
        organizationId: string;
      }>(token, {
        secret: process.env.JWT_SECRET!,
      });

      const user: SocketUser = {
        userId: payload.sub,
        email: payload.email,
        role: payload.role,
        organizationId: payload.organizationId,
      };
      client.data.user = user;
      client.join(`org:${user.organizationId}`);
      client.join(`user:${user.userId}`);
    } catch {
      client.emit("error", { message: "WebSocket no autorizado" });
      client.disconnect(true);
    }
  }

  handleDisconnect(_client: Socket) {
    /* room cleanup automatic */
  }

  @SubscribeMessage("join")
  async handleJoin(@ConnectedSocket() client: Socket) {
    const user = client.data.user as SocketUser | undefined;
    if (!user?.organizationId) {
      throw new WsException("No autorizado");
    }

    const [trips, gps] = await Promise.all([
      this.logistics.listTrips(user.organizationId),
      this.logistics.getGps(user.organizationId),
    ]);
    client.emit("snapshot", { trips, gps });
    return { ok: true, room: `org:${user.organizationId}` };
  }

  emitUpdate(organizationId: string) {
    void this.pushSnapshot(organizationId);
  }

  emitGps(organizationId: string) {
    void this.logistics.getGps(organizationId).then((gps) => {
      this.server.to(`org:${organizationId}`).emit("gps", gps);
    });
  }

  emitReassign(
    organizationId: string,
    payload: {
      tripId: string;
      code: string;
      fromDriverId: string | null;
      toDriverId: string;
      notify: Array<{
        role: string;
        driverId: string | null;
        message: string;
      }>;
    },
  ) {
    this.server.to(`org:${organizationId}`).emit("trip.reassigned", payload);
  }

  emitDeviationAlert(
    organizationId: string,
    payload: {
      deviationId: string;
      tripId: string;
      code: string;
      action: string;
      reasonDetail: string;
      reasonCodes: string[];
      lat: number;
      lng: number;
      serverTime: string;
    },
  ) {
    this.server
      .to(`org:${organizationId}`)
      .emit("trip.deviation.pending", payload);
  }

  emitDeviationResolved(
    organizationId: string,
    payload: {
      deviationId: string;
      tripId: string;
      decision: string;
      action: string;
    },
  ) {
    this.server
      .to(`org:${organizationId}`)
      .emit("trip.deviation.resolved", payload);
  }

  emitFieldIncident(
    organizationId: string,
    payload: {
      incidentId: string;
      tripId: string;
      code: string;
      category: string;
      notes: string | null;
      serverTime: string;
    },
  ) {
    this.server.to(`org:${organizationId}`).emit("trip.incident", payload);
  }

  emitTripChat(organizationId: string, tripId: string, message: unknown) {
    this.server.to(`org:${organizationId}`).emit("chat.trip", {
      tripId,
      message,
    });
    this.server.to(`trip:${tripId}`).emit("chat.trip", { tripId, message });
  }

  emitSupportChat(organizationId: string, message: unknown) {
    this.server.to(`org:${organizationId}`).emit("chat.support", { message });
  }

  emitUserNotification(
    organizationId: string,
    userId: string,
    notification: unknown,
  ) {
    this.server
      .to(`user:${userId}`)
      .emit("notification", { notification });
    this.server
      .to(`org:${organizationId}`)
      .emit("notification.org", { userId, notification });
  }

  @SubscribeMessage("joinTrip")
  handleJoinTrip(
    @ConnectedSocket() client: Socket,
    payload: { tripId?: string },
  ) {
    const user = client.data.user as SocketUser | undefined;
    if (!user?.organizationId || !payload?.tripId) {
      throw new WsException("No autorizado");
    }
    client.join(`trip:${payload.tripId}`);
    return { ok: true, room: `trip:${payload.tripId}` };
  }

  @SubscribeMessage("joinUser")
  handleJoinUser(@ConnectedSocket() client: Socket) {
    const user = client.data.user as SocketUser | undefined;
    if (!user?.userId) throw new WsException("No autorizado");
    client.join(`user:${user.userId}`);
    return { ok: true, room: `user:${user.userId}` };
  }

  private async pushSnapshot(organizationId: string) {
    const [trips, gps] = await Promise.all([
      this.logistics.listTrips(organizationId),
      this.logistics.getGps(organizationId),
    ]);
    this.server.to(`org:${organizationId}`).emit("snapshot", { trips, gps });
  }
}
