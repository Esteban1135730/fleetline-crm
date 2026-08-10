import { Injectable, Logger } from "@nestjs/common";
import {
  DevicePlatform,
  NotificationChannel,
  NotificationKind,
  RoleCode,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { LogisticsGateway } from "../logistics/logistics.gateway";

export type NotifyInput = {
  organizationId: string;
  /** Si vacío, se resuelve por roles */
  userIds?: string[];
  roles?: Array<RoleCode | string>;
  kind: NotificationKind;
  title: string;
  body: string;
  href?: string;
  payload?: Record<string, unknown>;
  channels?: NotificationChannel[];
};

@Injectable()
export class NotificationsService {
  private readonly log = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private gateway: LogisticsGateway,
  ) {}

  async listForUser(userId: string, take = 40) {
    return this.prisma.userNotification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take,
    });
  }

  async unreadCount(userId: string) {
    return this.prisma.userNotification.count({
      where: { userId, readAt: null },
    });
  }

  async markRead(userId: string, id: string) {
    return this.prisma.userNotification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string) {
    return this.prisma.userNotification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async saveWebPush(
    organizationId: string,
    userId: string,
    sub: {
      endpoint: string;
      keys: { p256dh: string; auth: string };
      userAgent?: string;
    },
  ) {
    return this.prisma.webPushSubscription.upsert({
      where: {
        userId_endpoint: { userId, endpoint: sub.endpoint },
      },
      create: {
        organizationId,
        userId,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        userAgent: sub.userAgent,
      },
      update: {
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        userAgent: sub.userAgent,
      },
    });
  }

  async saveDeviceToken(
    organizationId: string,
    userId: string,
    platform: DevicePlatform,
    token: string,
  ) {
    return this.prisma.devicePushToken.upsert({
      where: { userId_token: { userId, token } },
      create: { organizationId, userId, platform, token },
      update: { platform },
    });
  }

  vapidPublicKey() {
    return process.env.VAPID_PUBLIC_KEY || null;
  }

  async notify(input: NotifyInput) {
    const channels = input.channels?.length
      ? input.channels
      : [
          NotificationChannel.IN_APP,
          NotificationChannel.WEB_PUSH,
          NotificationChannel.REMOTE_PUSH,
        ];

    let userIds = input.userIds ?? [];
    if (!userIds.length && input.roles?.length) {
      const roles = input.roles.map((r) =>
        String(r).toUpperCase(),
      ) as RoleCode[];
      const users = await this.prisma.user.findMany({
        where: {
          organizationId: input.organizationId,
          active: true,
          role: { in: roles },
        },
        select: { id: true },
      });
      userIds = users.map((u) => u.id);
    }

    if (!userIds.length) return { created: 0 };

    const rows = await this.prisma.$transaction(
      userIds.map((userId) =>
        this.prisma.userNotification.create({
          data: {
            organizationId: input.organizationId,
            userId,
            kind: input.kind,
            title: input.title,
            body: input.body,
            href: input.href,
            payload: input.payload ?? undefined,
            channels,
          },
        }),
      ),
    );

    for (const row of rows) {
      this.gateway.emitUserNotification(input.organizationId, row.userId, {
        id: row.id,
        kind: row.kind,
        title: row.title,
        body: row.body,
        href: row.href,
        payload: row.payload,
        createdAt: row.createdAt.toISOString(),
        channels: row.channels,
      });
    }

    if (channels.includes(NotificationChannel.WEB_PUSH)) {
      void this.dispatchWebPush(userIds, input);
    }
    if (channels.includes(NotificationChannel.REMOTE_PUSH)) {
      void this.dispatchExpoPush(userIds, input);
    }

    return { created: rows.length };
  }

  private async dispatchWebPush(userIds: string[], input: NotifyInput) {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT || "mailto:ops@inretrans.co";
    if (!publicKey || !privateKey) {
      this.log.debug("Web Push omitido — faltan VAPID_PUBLIC_KEY/PRIVATE_KEY");
      return;
    }

    let webpush: typeof import("web-push");
    try {
      webpush = await import("web-push");
    } catch {
      return;
    }
    webpush.setVapidDetails(subject, publicKey, privateKey);

    const subs = await this.prisma.webPushSubscription.findMany({
      where: { userId: { in: userIds } },
    });
    const payload = JSON.stringify({
      title: input.title,
      body: input.body,
      href: input.href,
      kind: input.kind,
    });

    await Promise.allSettled(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: s.endpoint,
              keys: { p256dh: s.p256dh, auth: s.auth },
            },
            payload,
          );
        } catch (err) {
          this.log.warn(`Web Push falló ${s.endpoint.slice(0, 48)}…`);
          if (
            err &&
            typeof err === "object" &&
            "statusCode" in err &&
            (err as { statusCode?: number }).statusCode === 410
          ) {
            await this.prisma.webPushSubscription.delete({
              where: { id: s.id },
            });
          }
        }
      }),
    );
  }

  private async dispatchExpoPush(userIds: string[], input: NotifyInput) {
    const tokens = await this.prisma.devicePushToken.findMany({
      where: {
        userId: { in: userIds },
        platform: { in: [DevicePlatform.EXPO, DevicePlatform.ANDROID, DevicePlatform.IOS] },
      },
    });
    if (!tokens.length) return;

    const messages = tokens.map((t) => ({
      to: t.token,
      sound: "default" as const,
      title: input.title,
      body: input.body,
      data: {
        href: input.href ?? "",
        kind: input.kind,
        ...(input.payload ?? {}),
      },
      badge: 1,
    }));

    try {
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(messages),
      });
    } catch (e) {
      this.log.warn(`Expo Push falló: ${e instanceof Error ? e.message : e}`);
    }
  }

  /** Destinatarios típicos de operaciones / supervisor */
  static OPS_ROLES = [
    RoleCode.DESPACHO,
    RoleCode.SUPERVISOR,
    RoleCode.GERENCIA,
  ];
}
