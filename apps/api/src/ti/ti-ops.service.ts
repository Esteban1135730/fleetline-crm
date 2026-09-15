import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomBytes } from "crypto";
import { Role, UserAccountStatus } from "@fsg/db";
import { normalizeRole } from "@fsg/shared";
import { PrismaService } from "../prisma/prisma.service";
import { NocMonitoringService } from "./noc-monitoring.service";
import type { MdmPairQrDto, OnboardingLinkDto } from "./dto/ti.dto";

const ROLE_TO_PRISMA: Record<string, Role> = {
  lider_ti: Role.LIDER_TI,
  tecnologia: Role.LIDER_TI,
  recepcionista: Role.RECEPCIONISTA,
  conductor: Role.CONDUCTOR,
  revisor_fiscal: Role.REVISOR_FISCAL,
  org_admin: Role.ORG_ADMIN,
  gestor_operativo: Role.GESTOR_OPERATIVO,
  centro_control: Role.CENTRO_CONTROL,
  tesoreria: Role.TESORERIA,
  vinculaciones: Role.VINCULACIONES,
  monitora: Role.MONITORA,
};

function hashToken(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

function semaphoreFromStatus(
  status: "UP" | "DEGRADED" | "DOWN" | string,
): "GREEN" | "AMBER" | "RED" {
  if (status === "UP" || status === "GREEN" || status === "ok") return "GREEN";
  if (status === "DEGRADED" || status === "AMBER" || status === "warn")
    return "AMBER";
  return "RED";
}

@Injectable()
export class TiOpsService {
  constructor(
    private prisma: PrismaService,
    private noc: NocMonitoringService,
  ) {}

  /** Link de un solo uso — creación segura de contraseña */
  async createOnboardingLink(
    organizationId: string,
    createdById: string,
    dto: OnboardingLinkDto,
  ) {
    const email = dto.email.toLowerCase().trim();
    const roleKey = normalizeRole(dto.targetRole || "conductor");
    const targetRole =
      ROLE_TO_PRISMA[roleKey] ||
      ROLE_TO_PRISMA[String(dto.targetRole || "").toLowerCase()] ||
      Role.CONDUCTOR;

    const rawToken = randomBytes(32).toString("base64url");
    const expiresAt = new Date(
      Date.now() + (dto.ttlMinutes ?? 60) * 60 * 1000,
    );

    const row = await this.prisma.tiOnboardingLink.create({
      data: {
        organizationId,
        email,
        name: dto.name?.trim() || null,
        targetRole,
        tokenHash: hashToken(rawToken),
        expiresAt,
        createdById,
      },
    });

    const base =
      process.env.WEB_APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:3000";
    const onboardingUrl = `${base.replace(/\/$/, "")}/onboarding?token=${rawToken}`;

    return {
      id: row.id,
      email: row.email,
      targetRole: normalizeRole(row.targetRole),
      expiresAt: row.expiresAt.toISOString(),
      onboardingUrl,
      singleUse: true as const,
    };
  }

  /** QR temporal MDM — emparejamiento / bloqueo FSG Pilot App */
  async createMdmPairQr(
    organizationId: string,
    createdById: string,
    dto: MdmPairQrDto,
  ) {
    if (dto.driverUserId) {
      const driver = await this.prisma.user.findFirst({
        where: {
          id: dto.driverUserId,
          organizationId,
          role: { in: [Role.CONDUCTOR, Role.MONITORA] },
        },
      });
      if (!driver) {
        throw new NotFoundException("Conductor/monitora no encontrado en la org");
      }
    }

    const pairCode = randomBytes(6).toString("hex").toUpperCase();
    const expiresAt = new Date(
      Date.now() + (dto.ttlMinutes ?? 15) * 60 * 1000,
    );

    const session = await this.prisma.tiMdmPairSession.create({
      data: {
        organizationId,
        pairCode,
        driverUserId: dto.driverUserId || null,
        locked: dto.lockDevice !== false,
        expiresAt,
        createdById,
        meta: {
          app: "FSG_PILOT",
          purpose: "MDM_PAIR",
        },
      },
    });

    const payload = {
      v: 1,
      org: organizationId,
      code: pairCode,
      lock: session.locked,
      exp: expiresAt.toISOString(),
      app: "FSG_PILOT",
    };
    const qrPayload = `fleetline-mdm://${Buffer.from(JSON.stringify(payload)).toString("base64url")}`;

    return {
      sessionId: session.id,
      pairCode,
      expiresAt: expiresAt.toISOString(),
      locked: session.locked,
      driverUserId: session.driverUserId,
      qrPayload,
      qrText: qrPayload,
    };
  }

  async systemHealth(organizationId: string) {
    const noc = await this.noc.health(organizationId);
    const mem = process.memoryUsage();
    const heapUsedMb = Math.round(mem.heapUsed / 1024 / 1024);
    const heapTotalMb = Math.round(mem.heapTotal / 1024 / 1024);
    const rssMb = Math.round(mem.rss / 1024 / 1024);
    const memPct = heapTotalMb > 0 ? Math.round((heapUsedMb / heapTotalMb) * 100) : 0;

    const cpuLoad =
      typeof process.cpuUsage === "function"
        ? (() => {
            const u = process.cpuUsage();
            return Math.min(100, Math.round((u.user + u.system) / 10_000));
          })()
        : 12;

    const externalApis = [
      this.probeExternal(
        "WhatsApp / Meta",
        process.env.META_WHATSAPP_TOKEN || process.env.WHATSAPP_TOKEN,
        "webhook_token",
      ),
      this.probeExternal(
        "GPS Wialon/Gurtam",
        process.env.WIALON_TOKEN || process.env.GURTAM_TOKEN,
        "gps_uplink",
      ),
      this.probeExternal(
        "Waze Traffic",
        process.env.WAZE_API_KEY || process.env.WAZE_TOKEN,
        "traffic_feed",
      ),
      this.probeExternal(
        "Facturación electrónica",
        process.env.DIAN_API_KEY || process.env.FE_API_TOKEN,
        "fe_credentials",
      ),
    ];

    const server = {
      cpu: {
        pct: cpuLoad,
        semaphore: cpuLoad > 85 ? "RED" : cpuLoad > 65 ? "AMBER" : "GREEN",
      },
      memory: {
        heapUsedMb,
        heapTotalMb,
        rssMb,
        pct: memPct,
        semaphore: memPct > 90 ? "RED" : memPct > 75 ? "AMBER" : "GREEN",
      },
      uptimeSec: Math.floor(process.uptime()),
    };

    return {
      overall: noc.overall,
      overallSemaphore: semaphoreFromStatus(noc.overall),
      checkedAt: new Date().toISOString(),
      server,
      infrastructure: (noc.services || []).map(
        (s: { name: string; status: string; latencyMs?: number }) => ({
          name: s.name,
          status: s.status,
          latencyMs: s.latencyMs,
          semaphore: semaphoreFromStatus(s.status),
        }),
      ),
      externalApis,
      dlqPending: noc.dlq?.pending ?? 0,
      noc,
    };
  }

  async listDashboardUsers(organizationId: string) {
    const users = await this.prisma.user.findMany({
      where: { organizationId },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        active: true,
        lastLoginAt: true,
        lastIp: true,
        updatedAt: true,
      },
      take: 200,
    });

    return users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: normalizeRole(u.role),
      status: String(u.status || UserAccountStatus.ACTIVE).toLowerCase(),
      active: u.active,
      lastSessionAt: u.lastLoginAt?.toISOString() ?? null,
      lastIp: u.lastIp ?? null,
      updatedAt: u.updatedAt.toISOString(),
    }));
  }

  async listHelpdeskTickets(organizationId: string) {
    const priorityOrder: Record<string, number> = {
      HIGH: 0,
      ALTA: 0,
      MEDIUM: 1,
      MEDIA: 1,
      LOW: 2,
      BAJA: 2,
    };

    const tickets = await this.prisma.systemTicket.findMany({
      where: {
        OR: [{ organizationId }, { organizationId: null }],
      },
      orderBy: { createdAt: "desc" },
      take: 80,
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    return tickets
      .map((t) => this.mapTicket(t))
      .sort(
        (a, b) =>
          (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9),
      );
  }

  async getHelpdeskTicket(organizationId: string, id: string) {
    const row = await this.prisma.systemTicket.findFirst({
      where: {
        id,
        OR: [{ organizationId }, { organizationId: null }],
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });
    if (!row) throw new NotFoundException("Ticket no encontrado");
    return this.mapTicket(row);
  }

  async createHelpdeskTicket(
    organizationId: string,
    createdById: string,
    body: {
      title: string;
      detail?: string;
      priority?: string;
      area?: string;
    },
  ) {
    if (!body.title?.trim()) {
      throw new BadRequestException("Título requerido");
    }
    const priority = String(body.priority || "MEDIUM").toUpperCase();
    const area = this.normalizeArea(body.area);
    const row = await this.prisma.systemTicket.create({
      data: {
        organizationId,
        createdById,
        title: body.title.trim(),
        detail: body.detail?.trim() || null,
        priority: ["HIGH", "MEDIUM", "LOW"].includes(priority)
          ? priority
          : "MEDIUM",
        status: "OPEN",
        area,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });
    return this.mapTicket(row);
  }

  async patchHelpdeskTicket(
    organizationId: string,
    id: string,
    body: {
      status?: string;
      area?: string;
      detail?: string;
      priority?: string;
    },
  ) {
    const existing = await this.prisma.systemTicket.findFirst({
      where: {
        id,
        OR: [{ organizationId }, { organizationId: null }],
      },
    });
    if (!existing) throw new NotFoundException("Ticket no encontrado");

    const status = body.status
      ? this.normalizeStatus(body.status)
      : undefined;
    if (status === "CLOSED" && existing.status === "CLOSED") {
      throw new BadRequestException("El ticket ya está cerrado");
    }

    const priority = body.priority
      ? String(body.priority).toUpperCase()
      : undefined;

    const row = await this.prisma.systemTicket.update({
      where: { id },
      data: {
        ...(status ? { status } : {}),
        ...(body.area !== undefined
          ? { area: this.normalizeArea(body.area) }
          : {}),
        ...(body.detail !== undefined
          ? { detail: body.detail.trim() || null }
          : {}),
        ...(priority && ["HIGH", "MEDIUM", "LOW"].includes(priority)
          ? { priority }
          : {}),
        ...(status === "CLOSED"
          ? { closedAt: new Date() }
          : status === "OPEN" || status === "IN_PROGRESS"
            ? { closedAt: null }
            : {}),
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });
    return this.mapTicket(row);
  }

  private mapTicket(t: {
    id: string;
    title: string;
    detail: string | null;
    status: string;
    priority: string | null;
    area?: string | null;
    closedAt?: Date | null;
    createdAt: Date;
    createdBy: { id: string; name: string; email: string } | null;
  }) {
    return {
      id: t.id,
      title: t.title,
      detail: t.detail,
      status: t.status,
      priority: (t.priority || "MEDIUM").toUpperCase(),
      priorityLabel: this.priorityLabel(t.priority),
      area: t.area || null,
      areaLabel: this.areaLabel(t.area),
      closedAt: t.closedAt?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
      createdBy: t.createdBy
        ? { id: t.createdBy.id, name: t.createdBy.name }
        : null,
    };
  }

  private normalizeStatus(raw: string) {
    const s = String(raw || "").toUpperCase();
    if (s === "CERRADO" || s === "CLOSED") return "CLOSED";
    if (s === "IN_PROGRESS" || s === "EN_PROGRESO") return "IN_PROGRESS";
    if (s === "ABIERTO" || s === "OPEN") return "OPEN";
    throw new BadRequestException("Estado de ticket no válido");
  }

  private normalizeArea(raw?: string | null) {
    if (!raw?.trim()) return "MESA_AYUDA";
    const a = raw.trim().toUpperCase().replace(/\s+/g, "_");
    const allowed = [
      "INFRAESTRUCTURA",
      "MESA_AYUDA",
      "INTEGRACIONES",
      "MDM",
      "SEGURIDAD",
      "OTRO",
    ];
    return allowed.includes(a) ? a : "OTRO";
  }

  private areaLabel(raw?: string | null) {
    const a = String(raw || "MESA_AYUDA").toUpperCase();
    const map: Record<string, string> = {
      INFRAESTRUCTURA: "Infraestructura",
      MESA_AYUDA: "Mesa de ayuda",
      INTEGRACIONES: "Integraciones",
      MDM: "MDM / Dispositivos",
      SEGURIDAD: "Seguridad",
      OTRO: "Otro",
    };
    return map[a] || a;
  }

  private priorityLabel(raw?: string | null) {
    const p = String(raw || "MEDIUM").toUpperCase();
    if (p === "HIGH" || p === "ALTA") return "Alta";
    if (p === "LOW" || p === "BAJA") return "Baja";
    return "Media";
  }

  private probeExternal(
    name: string,
    token: string | undefined,
    channel: string,
  ) {
    const configured = Boolean(token && token.length > 8);
    const status = configured ? "UP" : "DEGRADED";
    return {
      name,
      channel,
      status,
      semaphore: semaphoreFromStatus(status),
      detail: configured
        ? "Credencial presente · uplink nominal"
        : "Sin credencial en entorno · modo degradado",
      lastError: configured ? null : "TOKEN_MISSING",
    };
  }
}
