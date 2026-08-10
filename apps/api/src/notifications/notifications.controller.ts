import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { DevicePlatform } from "@fsg/db";
import { z } from "zod";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { NotificationsService } from "./notifications.service";

type AuthReq = {
  user: { organizationId: string; userId: string; role: string };
};

const WebPushSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  userAgent: z.string().optional(),
});

const DeviceTokenSchema = z.object({
  token: z.string().min(8),
  platform: z.nativeEnum(DevicePlatform).default(DevicePlatform.EXPO),
});

@Controller(["notificaciones", "api/v1/notificaciones"])
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private notifications: NotificationsService) {}

  @Get()
  list(@Req() req: AuthReq, @Query("take") take?: string) {
    return this.notifications.listForUser(
      req.user.userId,
      take ? Number(take) : 40,
    );
  }

  @Get("unread-count")
  async unread(@Req() req: AuthReq) {
    const count = await this.notifications.unreadCount(req.user.userId);
    return { count };
  }

  @Get("vapid-public-key")
  vapid() {
    return { publicKey: this.notifications.vapidPublicKey() };
  }

  @Patch(":id/read")
  markRead(@Req() req: AuthReq, @Param("id") id: string) {
    return this.notifications.markRead(req.user.userId, id);
  }

  @Post("read-all")
  markAll(@Req() req: AuthReq) {
    return this.notifications.markAllRead(req.user.userId);
  }

  @Post("web-push/subscribe")
  webPush(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = WebPushSchema.parse(body ?? {});
    return this.notifications.saveWebPush(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  @Post("device-token")
  device(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = DeviceTokenSchema.parse(body ?? {});
    return this.notifications.saveDeviceToken(
      req.user.organizationId,
      req.user.userId,
      dto.platform,
      dto.token,
    );
  }
}
