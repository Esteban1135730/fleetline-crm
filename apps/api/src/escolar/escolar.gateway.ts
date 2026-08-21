import { Injectable, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";

/**
 * Canal WebSocket Padres/Monitora — namespace /escolar
 */
@WebSocketGateway({
  cors: {
    origin: (
      process.env.CORS_ORIGINS ||
      "http://localhost:3000,http://127.0.0.1:3000,http://localhost:8081,http://localhost:19006"
    )
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    credentials: true,
  },
  namespace: "/escolar",
})
@Injectable()
export class EscolarGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(EscolarGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private jwt: JwtService) {}

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
        organizationId: string;
        familyId?: string;
      }>(token, {
        secret: process.env.JWT_SECRET!,
      });

      client.data.organizationId = payload.organizationId;
      client.data.familyId = payload.familyId;
      client.join(`org:${payload.organizationId}`);
      if (payload.familyId) {
        client.join(`family:${payload.familyId}`);
      }
    } catch {
      client.emit("error", { message: "WebSocket escolar no autorizado" });
      client.disconnect(true);
    }
  }

  handleDisconnect(_client: Socket) {
    // no-op
  }

  emitToOrg(organizationId: string, event: string, payload: unknown) {
    if (!this.server) {
      this.logger.warn(`[WS] server no listo — skip ${event}`);
      return;
    }
    this.server.to(`org:${organizationId}`).emit(event, payload);
  }

  emitToFamily(familyId: string, event: string, payload: unknown) {
    if (!this.server) return;
    this.server.to(`family:${familyId}`).emit(event, payload);
  }
}
