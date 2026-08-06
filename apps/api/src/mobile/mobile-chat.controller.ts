import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ModulesGuard, RequireModule } from "../auth/modules.guard";
import { MobileChatService } from "./mobile-chat.service";
import { PrismaService } from "../prisma/prisma.service";

type AuthReq = {
  user: {
    organizationId: string;
    userId: string;
    role: string;
    email?: string;
  };
};

const MessageSchema = z.object({
  body: z.string().min(1).max(4000),
});

@Controller(["api/v1/chat", "chat"])
@UseGuards(JwtAuthGuard, ModulesGuard)
@RequireModule("logistica", "apps")
export class MobileChatController {
  constructor(
    private chat: MobileChatService,
    private prisma: PrismaService,
  ) {}

  private async author(req: AuthReq) {
    const user = await this.prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { name: true },
    });
    return {
      userId: req.user.userId,
      name: user?.name ?? req.user.email ?? "Usuario",
      role: req.user.role,
    };
  }

  @Get("viaje/:tripId")
  listTrip(@Req() req: AuthReq, @Param("tripId") tripId: string) {
    return this.chat.listTripChat(req.user.organizationId, tripId);
  }

  @Post("viaje/:tripId")
  async postTrip(
    @Req() req: AuthReq,
    @Param("tripId") tripId: string,
    @Body() body: unknown,
  ) {
    const dto = MessageSchema.parse(body ?? {});
    return this.chat.postTripChat(
      req.user.organizationId,
      tripId,
      await this.author(req),
      dto.body,
    );
  }

  @Get("soporte-general")
  listSupport(@Req() req: AuthReq) {
    return this.chat.listSupport(req.user.organizationId);
  }

  @Post("soporte-general")
  async postSupport(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = MessageSchema.parse(body ?? {});
    return this.chat.postSupport(
      req.user.organizationId,
      await this.author(req),
      dto.body,
    );
  }
}
