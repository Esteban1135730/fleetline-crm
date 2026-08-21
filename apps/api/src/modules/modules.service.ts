import { createHash, randomUUID } from "crypto";
import { readFile } from "fs/promises";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  ArchiveCategory,
  ComplianceDocType,
  DocStatus,
  EmployeeStatus,
  InvoiceStatus,
  InvoiceType,
  PurchaseStatus,
  SarlaftRisk,
  TicketChannel,
  TicketPriority,
  TicketStatus,
} from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";
import { buildVisitorPass } from "../pqrs/pqrs.calc";

@Injectable()
export class ModulesService {
  constructor(private prisma: PrismaService) {}

  private sha256Hex(buf: Buffer) {
    return createHash("sha256").update(buf).digest("hex");
  }

  // —— RRHH (legacy Modules — preferir apps/api/src/rrhh) ——
  listEmployees(organizationId: string) {
    return this.prisma.employee.findMany({
      where: { organizationId },
      include: {
        driver: {
          select: {
            id: true,
            licenseNumber: true,
            licenseCategory: true,
            licenseExpiresAt: true,
            fatigueScore: true,
            dispatchBlocked: true,
            blockReason: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });
  }

  createEmployee(
    organizationId: string,
    data: {
      name: string;
      document: string;
      position?: string;
      title?: string;
      area: string;
      phone?: string;
      email?: string;
      fatigueScore?: number;
    },
  ) {
    return this.prisma.employee.create({
      data: {
        organizationId,
        name: data.name,
        document: data.document,
        title: data.title || data.position || "Sin cargo",
        area: data.area,
        phone: data.phone,
        email: data.email,
        fatigueScore: data.fatigueScore,
        status: EmployeeStatus.ACTIVE,
      },
    });
  }

  async updateEmployeeStatus(
    organizationId: string,
    id: string,
    status: string,
  ) {
    const e = await this.prisma.employee.findFirst({
      where: { id, organizationId },
    });
    if (!e) throw new NotFoundException();
    return this.prisma.employee.update({
      where: { id },
      data: { status: status.toUpperCase() as EmployeeStatus },
    });
  }

  async updateEmployee(
    organizationId: string,
    id: string,
    data: {
      name?: string;
      position?: string;
      title?: string;
      area?: string;
      phone?: string;
      email?: string;
      fatigueScore?: number;
      status?: string;
    },
  ) {
    const e = await this.prisma.employee.findFirst({
      where: { id, organizationId },
    });
    if (!e) throw new NotFoundException();
    return this.prisma.employee.update({
      where: { id },
      data: {
        name: data.name,
        title: data.title ?? data.position,
        area: data.area,
        phone: data.phone,
        email: data.email,
        fatigueScore: data.fatigueScore,
        status: data.status
          ? (data.status.toUpperCase() as EmployeeStatus)
          : undefined,
      },
      include: {
        driver: {
          select: {
            id: true,
            licenseExpiresAt: true,
            licenseCategory: true,
            fatigueScore: true,
            dispatchBlocked: true,
          },
        },
      },
    });
  }

  // —— Atención ——
  listTickets(organizationId: string) {
    return this.prisma.ticket.findMany({
      where: { organizationId },
      include: { assignee: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async createTicket(
    organizationId: string,
    data: {
      subject: string;
      requester: string;
      message: string;
      channel?: string;
      priority?: string;
    },
  ) {
    if (!data.subject?.trim() || !data.requester?.trim() || !data.message?.trim()) {
      throw new BadRequestException(
        "Ticket requiere subject, requester y message",
      );
    }
    const count = await this.prisma.ticket.count({ where: { organizationId } });
    const rawPriority = (data.priority || "MEDIUM").toUpperCase();
    const priority =
      rawPriority === "NORMAL"
        ? TicketPriority.MEDIUM
        : ((["LOW", "MEDIUM", "HIGH", "URGENT"].includes(rawPriority)
            ? rawPriority
            : "MEDIUM") as TicketPriority);
    return this.prisma.ticket.create({
      data: {
        code: `TK-${1000 + count + 1}`,
        subject: data.subject,
        requester: data.requester,
        message: data.message,
        channel: (data.channel as TicketChannel) || TicketChannel.WHATSAPP,
        priority,
        organizationId,
      },
    });
  }

  async updateTicketStatus(organizationId: string, id: string, status: string) {
    const t = await this.prisma.ticket.findFirst({
      where: { id, organizationId },
    });
    if (!t) throw new NotFoundException();
    return this.prisma.ticket.update({
      where: { id },
      data: { status: status.toUpperCase() as TicketStatus },
      include: { assignee: { select: { id: true, name: true } } },
    });
  }

  async updateTicket(
    organizationId: string,
    id: string,
    data: { priority?: string; status?: string; assigneeId?: string | null },
  ) {
    const t = await this.prisma.ticket.findFirst({
      where: { id, organizationId },
    });
    if (!t) throw new NotFoundException();
    return this.prisma.ticket.update({
      where: { id },
      data: {
        priority: data.priority
          ? ((data.priority.toUpperCase() === "NORMAL"
              ? "MEDIUM"
              : data.priority.toUpperCase()) as TicketPriority)
          : undefined,
        status: data.status
          ? (data.status.toUpperCase() as TicketStatus)
          : undefined,
        assigneeId:
          data.assigneeId === undefined ? undefined : data.assigneeId,
      },
      include: { assignee: { select: { id: true, name: true } } },
    });
  }

  // —— Calidad ——
  private mapQualityRow(e: {
    id: string;
    kind: string;
    title: string;
    status: string;
    npsScore: number | null;
    createdAt: Date;
  }) {
    return {
      id: e.id,
      type: e.kind,
      title: e.title,
      status: e.status,
      score: e.npsScore,
      description: null as string | null,
      createdAt: e.createdAt,
    };
  }

  async listQuality(organizationId: string) {
    const rows = await this.prisma.qualityEvent.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((e) => this.mapQualityRow(e));
  }

  async createQuality(
    organizationId: string,
    data: {
      type?: string;
      title?: string;
      description?: string;
      score?: number;
    },
  ) {
    const kind = String(data.type || "INCIDENT").trim().toUpperCase() || "INCIDENT";
    const title = String(data.title || data.description || "").trim();
    if (title.length < 3) {
      throw new BadRequestException(
        "Indique la descripción del reporte QHSE (mínimo 3 caracteres)",
      );
    }
    const scoreRaw = data.score;
    const npsScore =
      kind === "NPS" && scoreRaw != null && Number.isFinite(Number(scoreRaw))
        ? Math.max(0, Math.min(10, Math.round(Number(scoreRaw))))
        : null;

    const created = await this.prisma.qualityEvent.create({
      data: {
        organizationId,
        kind,
        title,
        npsScore,
        status: "OPEN",
      },
    });
    return this.mapQualityRow(created);
  }

  async updateQuality(
    organizationId: string,
    id: string,
    data: {
      status?: string;
      title?: string;
      score?: number;
      description?: string;
    },
  ) {
    const e = await this.prisma.qualityEvent.findFirst({
      where: { id, organizationId },
    });
    if (!e) throw new NotFoundException();
    const updated = await this.prisma.qualityEvent.update({
      where: { id },
      data: {
        status: data.status,
        title: data.title,
        npsScore: data.score,
      },
    });
    return this.mapQualityRow(updated);
  }

  async qualitySummary(organizationId: string) {
    const events = await this.prisma.qualityEvent.findMany({
      where: { organizationId },
    });
    const npsEvents = events.filter((e) => e.kind === "NPS" && e.npsScore != null);
    const npsAvg =
      npsEvents.length > 0
        ? npsEvents.reduce((s, e) => s + Number(e.npsScore), 0) /
          npsEvents.length
        : null;
    return {
      total: events.length,
      open: events.filter((ev) => ev.status === "OPEN").length,
      nps: npsAvg != null ? Number(npsAvg.toFixed(1)) : null,
      npsSamples: npsEvents.length,
      incidents: events.filter((ev) => ev.kind === "INCIDENT").length,
    };
  }

  // —— Jurídico FUEC ——
  listFuec(organizationId: string) {
    return this.prisma.fuecDocument.findMany({
      where: { organizationId },
      include: { vehicle: { select: { plate: true } } },
      orderBy: { validTo: "asc" },
    });
  }

  createFuec(
    organizationId: string,
    data: {
      number: string;
      contractor: string;
      route: string;
      validFrom: string;
      validTo: string;
      vehicleId?: string;
    },
  ) {
    if (!data.number?.trim() || !data.contractor?.trim() || !data.route?.trim() || !data.validTo) {
      throw new BadRequestException(
        "FUEC requiere number, contractor, route y validTo",
      );
    }
    return this.prisma.fuecDocument.create({
      data: {
        organizationId,
        number: data.number,
        contractor: data.contractor,
        route: data.route,
        validFrom: new Date(data.validFrom || Date.now()),
        validTo: new Date(data.validTo),
        vehicleId: data.vehicleId,
        status: DocStatus.VALID,
      },
      include: { vehicle: { select: { plate: true } } },
    });
  }

  async updateFuec(
    organizationId: string,
    id: string,
    data: { status?: string; route?: string; validTo?: string },
  ) {
    const d = await this.prisma.fuecDocument.findFirst({
      where: { id, organizationId },
    });
    if (!d) throw new NotFoundException();
    return this.prisma.fuecDocument.update({
      where: { id },
      data: {
        status: data.status
          ? (data.status.toUpperCase() as DocStatus)
          : undefined,
        route: data.route,
        validTo: data.validTo ? new Date(data.validTo) : undefined,
      },
      include: { vehicle: { select: { plate: true } } },
    });
  }

  // —— SARLAFT ——
  private async loadSarlaftEvidenceRows(
    organizationId: string,
    checkId?: string,
  ) {
    type Row = {
      id: string;
      checkId: string;
      source: string;
      title: string;
      fileRef: string | null;
      originalName: string | null;
      createdAt: Date;
    };
    try {
      if (checkId) {
        return await this.prisma.$queryRaw<Row[]>`
          SELECT id, "checkId", source::text AS source, title, "fileRef",
                 "originalName", "createdAt"
          FROM "SarlaftEvidence"
          WHERE "organizationId" = ${organizationId} AND "checkId" = ${checkId}
          ORDER BY "createdAt" DESC
        `;
      }
      return await this.prisma.$queryRaw<Row[]>`
        SELECT id, "checkId", source::text AS source, title, "fileRef",
               "originalName", "createdAt"
        FROM "SarlaftEvidence"
        WHERE "organizationId" = ${organizationId}
        ORDER BY "createdAt" DESC
      `;
    } catch {
      return [] as Row[];
    }
  }

  async listSarlaft(organizationId: string) {
    const rows = await this.prisma.sarlaftCheck.findMany({
      where: { organizationId },
      include: { customer: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
    const evidenceRows = await this.loadSarlaftEvidenceRows(organizationId);
    const byCheck = new Map<string, typeof evidenceRows>();
    for (const ev of evidenceRows) {
      const list = byCheck.get(ev.checkId) ?? [];
      list.push(ev);
      byCheck.set(ev.checkId, list);
    }
    return rows.map((r) => {
      const evidences = byCheck.get(r.id) ?? [];
      return {
        ...r,
        subjectDoc: r.document,
        checkedAt: r.createdAt.toISOString(),
        evidences,
        evidenceCount: evidences.length,
      };
    });
  }

  createSarlaft(
    organizationId: string,
    data: {
      subjectName: string;
      subjectDoc: string;
      risk?: string;
      notes?: string;
      customerId?: string;
    },
  ) {
    if (!data.subjectName?.trim() || !data.subjectDoc?.trim()) {
      throw new BadRequestException("SARLAFT requiere subjectName y subjectDoc");
    }
    return this.prisma.sarlaftCheck
      .create({
        data: {
          organizationId,
          subjectName: data.subjectName,
          document: data.subjectDoc,
          risk: (data.risk as SarlaftRisk) || SarlaftRisk.LOW,
          notes: data.notes,
          customerId: data.customerId,
        },
        include: { customer: { select: { name: true } } },
      })
      .then((r) => ({
        ...r,
        subjectDoc: r.document,
        checkedAt: r.createdAt.toISOString(),
        evidences: [],
        evidenceCount: 0,
      }));
  }

  async updateSarlaft(
    organizationId: string,
    id: string,
    data: { risk?: string; notes?: string; customerId?: string },
  ) {
    const s = await this.prisma.sarlaftCheck.findFirst({
      where: { id, organizationId },
    });
    if (!s) throw new NotFoundException();
    return this.prisma.sarlaftCheck.update({
      where: { id },
      data: {
        risk: data.risk ? (data.risk as SarlaftRisk) : undefined,
        notes: data.notes,
        customerId: data.customerId,
      },
      include: { customer: { select: { name: true } } },
    });
  }

  async listSarlaftEvidence(organizationId: string, checkId: string) {
    const check = await this.prisma.sarlaftCheck.findFirst({
      where: { id: checkId, organizationId },
      select: { id: true },
    });
    if (!check) throw new NotFoundException("Consulta SARLAFT no encontrada");
    return this.loadSarlaftEvidenceRows(organizationId, checkId);
  }

  async createSarlaftEvidence(
    organizationId: string,
    checkId: string,
    data: {
      source: string;
      title: string;
      storedName: string;
      originalName: string;
      mimeType?: string;
      absolutePath: string;
      byteSize?: number;
    },
    actorUserId?: string,
  ) {
    const check = await this.prisma.sarlaftCheck.findFirst({
      where: { id: checkId, organizationId },
      select: { id: true },
    });
    if (!check) throw new NotFoundException("Consulta SARLAFT no encontrada");

    const allowed = [
      "POLICIA",
      "PROCURADURIA",
      "REGISTRADURIA",
      "ANTECEDENTES",
      "LISTAS",
      "OTHER",
    ];
    const source = allowed.includes(data.source) ? data.source : "OTHER";

    let contentHash: string | null = null;
    try {
      const buf = await readFile(data.absolutePath);
      contentHash = this.sha256Hex(buf);
    } catch {
      throw new BadRequestException(
        "Fallo de sellado criptográfico — reintentar uplink",
      );
    }

    const id = randomUUID().replace(/-/g, "").slice(0, 24);
    const title = data.title || data.originalName;
    const fileRef = `/uploads/${data.storedName}`;

    await this.prisma.$executeRaw`
      INSERT INTO "SarlaftEvidence" (
        id, "checkId", source, title, "fileRef", "originalName",
        "mimeType", "byteSize", "contentHash", "uploadedById",
        "organizationId", "createdAt"
      ) VALUES (
        ${id},
        ${checkId},
        ${source}::"SarlaftEvidenceSource",
        ${title},
        ${fileRef},
        ${data.originalName},
        ${data.mimeType ?? null},
        ${data.byteSize ?? null},
        ${contentHash},
        ${actorUserId ?? null},
        ${organizationId},
        NOW()
      )
    `;

    await this.prisma.auditLog.create({
      data: {
        action: "SARLAFT_EVIDENCE",
        entity: "SarlaftEvidence",
        entityId: id,
        userId: actorUserId,
        meta: {
          organizationId,
          checkId,
          source,
          title,
          contentHash,
        },
      },
    });

    return {
      id,
      checkId,
      source,
      title,
      fileRef,
      originalName: data.originalName,
      mimeType: data.mimeType ?? null,
      byteSize: data.byteSize ?? null,
      contentHash,
      createdAt: new Date().toISOString(),
    };
  }

  // —— Archivo ——
  listArchive(
    organizationId: string,
    filters?: { category?: string; q?: string },
  ) {
    const q = filters?.q?.trim();
    return this.prisma.archiveDocument.findMany({
      where: {
        organizationId,
        ...(filters?.category
          ? { category: filters.category as ArchiveCategory }
          : {}),
        ...(q
          ? {
              OR: [
                { title: { contains: q, mode: "insensitive" } },
                { tags: { has: q } },
                { contentHash: { contains: q, mode: "insensitive" } },
                { fileRef: { contains: q, mode: "insensitive" } },
                { plate: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: {
        uploadedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  listArchiveAudit(organizationId: string, take = 50) {
    return this.prisma.auditLog.findMany({
      where: {
        entity: "ArchiveDocument",
        meta: { path: ["organizationId"], equals: organizationId },
      },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: Math.min(take, 200),
    });
  }

  createArchive(
    organizationId: string,
    data: {
      title: string;
      category?: string;
      fileRef?: string;
      tags?: string;
    },
    actorUserId?: string,
  ) {
    return this.prisma.archiveDocument
      .create({
        data: {
          organizationId,
          title: data.title,
          category: (data.category as ArchiveCategory) || ArchiveCategory.OTHER,
          fileRef: data.fileRef,
          tags: Array.isArray(data.tags)
            ? data.tags
            : data.tags
              ? String(data.tags)
                  .split(/[,;]/)
                  .map((t) => t.trim())
                  .filter(Boolean)
              : [],
          uploadedById: actorUserId,
        },
      })
      .then(async (doc) => {
        await this.prisma.auditLog.create({
          data: {
            action: "ARCHIVE_INDEX",
            entity: "ArchiveDocument",
            entityId: doc.id,
            userId: actorUserId,
            meta: {
              organizationId,
              title: doc.title,
              category: doc.category,
            },
          },
        });
        return doc;
      });
  }

  async createArchiveWithFile(
    organizationId: string,
    data: {
      title: string;
      category?: string;
      tags?: string;
      storedName: string;
      originalName: string;
      absolutePath: string;
      byteSize?: number;
    },
    actorUserId?: string,
  ) {
    let contentHash: string | null = null;
    try {
      const buf = await readFile(data.absolutePath);
      contentHash = this.sha256Hex(buf);
    } catch {
      throw new BadRequestException(
        "Fallo de sellado criptográfico — reintentar uplink",
      );
    }

    const doc = await this.prisma.archiveDocument.create({
      data: {
        organizationId,
        title: data.title || data.originalName,
        category: (data.category as ArchiveCategory) || ArchiveCategory.OTHER,
        fileRef: `/uploads/${data.storedName}`,
        tags: data.tags
          ? String(data.tags)
              .split(/[,;]/)
              .map((t) => t.trim())
              .filter(Boolean)
          : [],
        contentHash,
        byteSize: data.byteSize ?? null,
        uploadedById: actorUserId,
      },
      include: {
        uploadedBy: { select: { id: true, name: true, email: true } },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        action: "ARCHIVE_VAULT",
        entity: "ArchiveDocument",
        entityId: doc.id,
        userId: actorUserId,
        meta: {
          organizationId,
          title: doc.title,
          category: doc.category,
          contentHash,
          byteSize: doc.byteSize,
          fileRef: doc.fileRef,
        },
      },
    });

    return doc;
  }

  async updateArchive(
    organizationId: string,
    id: string,
    data: { title?: string; category?: string; tags?: string },
  ) {
    const d = await this.prisma.archiveDocument.findFirst({
      where: { id, organizationId },
    });
    if (!d) throw new NotFoundException();
    return this.prisma.archiveDocument.update({
      where: { id },
      data: {
        title: data.title,
        category: data.category
          ? (data.category as ArchiveCategory)
          : undefined,
        tags: data.tags
          ? String(data.tags)
              .split(/[,;]/)
              .map((t) => t.trim())
              .filter(Boolean)
          : undefined,
      },
    });
  }

  async deleteArchive(
    organizationId: string,
    id: string,
    actorUserId?: string,
  ) {
    const d = await this.prisma.archiveDocument.findFirst({
      where: { id, organizationId },
    });
    if (!d) throw new NotFoundException();
    await this.prisma.archiveDocument.delete({ where: { id } });
    await this.prisma.auditLog.create({
      data: {
        action: "ARCHIVE_DELETE",
        entity: "ArchiveDocument",
        entityId: id,
        userId: actorUserId,
        meta: {
          organizationId,
          title: d.title,
          contentHash: d.contentHash,
        },
      },
    });
    return { ok: true };
  }

  // —— Recepción ——
  listVisitors(organizationId: string) {
    return this.prisma.visitor.findMany({
      where: { organizationId },
      orderBy: { checkedInAt: "desc" },
      take: 100,
    });
  }

  createVisitor(
    organizationId: string,
    data: {
      name: string;
      document: string;
      purpose: string;
      hostName: string;
      company?: string;
    },
  ) {
    if (!data.name?.trim() || !data.document?.trim() || !data.purpose?.trim() || !data.hostName?.trim()) {
      throw new BadRequestException(
        "Visitante requiere name, document, purpose y hostName",
      );
    }
    const { passCode, qrPayload } = buildVisitorPass({
      organizationId,
      document: data.document.trim(),
      name: data.name.trim(),
    });
    return this.prisma.visitor.create({
      data: {
        organizationId,
        name: data.name.trim(),
        document: data.document.trim(),
        reason: data.purpose.trim(),
        hostName: data.hostName.trim(),
        company: data.company,
        passCode,
        qrPayload,
        badgeIssuedAt: new Date(),
      },
    });
  }

  async checkoutVisitor(organizationId: string, id: string) {
    const v = await this.prisma.visitor.findFirst({
      where: { id, organizationId },
    });
    if (!v) throw new NotFoundException();
    return this.prisma.visitor.update({
      where: { id },
      data: { checkedOutAt: new Date() },
    });
  }

  // —— Sistemas ——
  listAlerts(organizationId: string) {
    return this.prisma.systemAlert.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    });
  }

  async resolveAlert(organizationId: string, id: string) {
    const a = await this.prisma.systemAlert.findFirst({
      where: { id, organizationId },
    });
    if (!a) throw new NotFoundException();
    return this.prisma.systemAlert.update({
      where: { id },
      data: { resolved: true },
    });
  }

  async systemsHealth(organizationId: string) {
    const started = Date.now();
    let db: "ok" | "error" = "ok";
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      db = "error";
    }
    const latencyMs = Date.now() - started;

    const [open, users, trips, vehicles] = await Promise.all([
      this.prisma.systemAlert.count({
        where: { organizationId, resolved: false },
      }),
      this.prisma.user.count({ where: { organizationId, active: true } }),
      this.prisma.trip.count({ where: { organizationId } }),
      this.prisma.vehicle.count({ where: { organizationId } }),
    ]);

    const uptimeSec = Math.floor(process.uptime());
    const h = Math.floor(uptimeSec / 3600);
    const m = Math.floor((uptimeSec % 3600) / 60);

    return {
      api: "ok",
      db,
      dbLatencyMs: latencyMs,
      openAlerts: open,
      activeUsers: users,
      tripsIndexed: trips,
      vehicles: vehicles,
      uptime: `${h}h ${m}m`,
      checkedAt: new Date().toISOString(),
    };
  }

  // —— Revisoría ——
  private serializeFinding<
    T extends { amount?: { toString(): string } | number | null },
  >(row: T) {
    return {
      ...row,
      amount:
        row.amount == null || row.amount === undefined
          ? null
          : Number(row.amount),
    };
  }

  async listForensic(organizationId: string) {
    const rows = await this.prisma.forensicFinding.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row) => this.serializeFinding(row));
  }

  async createForensic(
    organizationId: string,
    data: {
      title: string;
      detail: string;
      severity?: string;
      amount?: number;
    },
  ) {
    const count = await this.prisma.forensicFinding.count({
      where: { organizationId },
    });
    const created = await this.prisma.forensicFinding.create({
      data: {
        organizationId,
        code: `RF-${String(count + 1).padStart(3, "0")}`,
        title: data.title,
        detail: data.detail,
        severity: data.severity || "MEDIUM",
        amount: data.amount,
      },
    });
    return this.serializeFinding(created);
  }

  async updateForensic(
    organizationId: string,
    id: string,
    data: { status?: string; detail?: string; severity?: string },
  ) {
    const f = await this.prisma.forensicFinding.findFirst({
      where: { id, organizationId },
    });
    if (!f) throw new NotFoundException();
    const updated = await this.prisma.forensicFinding.update({
      where: { id },
      data,
    });
    return this.serializeFinding(updated);
  }

  async createAlert(
    organizationId: string,
    data: { severity?: string; source: string; message: string },
  ) {
    return this.prisma.systemAlert.create({
      data: {
        organizationId,
        severity: data.severity || "INFO",
        source: data.source,
        message: data.message,
      },
    });
  }

  async updateVisitor(
    organizationId: string,
    id: string,
    data: { purpose?: string; hostName?: string; company?: string },
  ) {
    const v = await this.prisma.visitor.findFirst({
      where: { id, organizationId },
    });
    if (!v) throw new NotFoundException();
    return this.prisma.visitor.update({
      where: { id },
      data: {
        reason: data.purpose,
        hostName: data.hostName,
        company: data.company,
      },
    });
  }

  // —— Apps (métricas reales del CRM; sin apps móviles aún) ——
  appsOverview(organizationId: string) {
    return Promise.all([
      this.prisma.trip.count({
        where: { organizationId, status: { in: ["IN_TRANSIT", "ASSIGNED"] } },
      }),
      this.prisma.ticket.count({
        where: { organizationId, status: { in: ["OPEN", "IN_PROGRESS"] } },
      }),
      this.prisma.visitor.count({
        where: { organizationId, checkedOutAt: null },
      }),
      this.prisma.driver.count({
        where: { organizationId, active: true },
      }),
      this.prisma.customer.count({ where: { organizationId } }),
      this.prisma.employee.count({
        where: { organizationId, area: "Operaciones", status: "ACTIVE" },
      }),
    ]).then(
      ([viajes, tickets, visitantes, conductores, clientes, operativos]) => ({
        channels: [
          {
            id: "conductores",
            name: "Conductores activos",
            status: "crm",
            metric: `${conductores} en nómina operativa`,
          },
          {
            id: "clientes",
            name: "Clientes registrados",
            status: "crm",
            metric: `${clientes} en comercial`,
          },
          {
            id: "operativos",
            name: "Personal operaciones",
            status: "crm",
            metric: `${operativos} activos`,
          },
          {
            id: "viajes",
            name: "Viajes en curso",
            status: "crm",
            metric: `${viajes} asignados / en ruta`,
          },
        ],
        openTickets: tickets,
        visitorsOnSite: visitantes,
        note: "Las apps móviles aún no están conectadas. Estas cifras salen del CRM.",
      }),
    );
  }

  // —— Compras ——
  private purchaseUiMeta(meta: unknown): {
    supplierName?: string;
    category?: string;
    requestedBy?: string | null;
  } {
    if (meta && typeof meta === "object" && !Array.isArray(meta)) {
      return meta as {
        supplierName?: string;
        category?: string;
        requestedBy?: string | null;
      };
    }
    return {};
  }

  private mapPurchaseRow(po: {
    id: string;
    code: string;
    description: string | null;
    status: PurchaseStatus;
    totalEstimated: { toString(): string } | number;
    meta: unknown;
    createdAt: Date;
    supplier?: { name: string } | null;
  }) {
    const meta = this.purchaseUiMeta(po.meta);
    return {
      id: po.id,
      code: po.code,
      description: po.description,
      supplier: po.supplier?.name || meta.supplierName || "",
      amount: Number(po.totalEstimated),
      category: meta.category || "GENERAL",
      requestedBy: meta.requestedBy ?? null,
      status: po.status,
      createdAt: po.createdAt,
    };
  }

  async listPurchases(organizationId: string) {
    const rows = await this.prisma.purchaseOrder.findMany({
      where: { organizationId },
      include: { supplier: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((po) => this.mapPurchaseRow(po));
  }

  async createPurchase(
    organizationId: string,
    data: {
      description: string;
      supplier?: string;
      supplierId?: string;
      amount: number;
      category?: string;
      requestedBy?: string;
      quantity?: number;
    },
  ) {
    let supplierId = data.supplierId?.trim() || undefined;
    let supplierName = (data.supplier || "").trim();

    if (supplierId) {
      const supplier = await this.prisma.supplier.findFirst({
        where: { id: supplierId, organizationId, active: true },
      });
      if (!supplier) {
        throw new NotFoundException("Proveedor no encontrado en el directorio");
      }
      if (supplier.sarlaftBlocked) {
        throw new BadRequestException(
          "Hard lock SARLAFT: proveedor bloqueado — no puede emitir OC",
        );
      }
      supplierName = supplier.name;
    } else if (supplierName) {
      const byName = await this.prisma.supplier.findFirst({
        where: {
          organizationId,
          active: true,
          name: { equals: supplierName, mode: "insensitive" },
        },
      });
      if (byName) {
        if (byName.sarlaftBlocked) {
          throw new BadRequestException(
            "Hard lock SARLAFT: proveedor bloqueado — no puede emitir OC",
          );
        }
        supplierId = byName.id;
        supplierName = byName.name;
      }
    }

    if (!supplierId && !supplierName) {
      throw new BadRequestException("Seleccione un proveedor del directorio");
    }

    const count = await this.prisma.purchaseOrder.count({
      where: { organizationId },
    });
    const year = new Date().getFullYear();
    let code = `OC-${year}-${String(count + 1).padStart(4, "0")}`;
    const clash = await this.prisma.purchaseOrder.findFirst({
      where: { organizationId, code },
    });
    if (clash) {
      code = `OC-${year}-${String(Date.now()).slice(-6)}`;
    }
    const amount = Number(data.amount) || 0;
    const qty = Math.max(1, Number(data.quantity) || 1);
    const unitCost = Number((amount / qty).toFixed(2));
    const created = await this.prisma.purchaseOrder.create({
      data: {
        organizationId,
        code,
        description: data.description,
        status: PurchaseStatus.REQUESTED,
        totalEstimated: amount,
        currency: "COP",
        supplierId: supplierId ?? null,
        meta: {
          supplierName,
          category: data.category || "GENERAL",
          requestedBy: data.requestedBy ?? null,
        },
        lines: {
          create: [
            {
              description: data.description,
              quantity: qty,
              unitCost,
              lineTotal: amount,
            },
          ],
        },
      },
      include: { supplier: { select: { name: true } } },
    });
    return this.mapPurchaseRow(created);
  }

  async updatePurchaseStatus(
    organizationId: string,
    id: string,
    status: string,
  ) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, organizationId },
      include: { supplier: { select: { name: true } } },
    });
    if (!po) throw new NotFoundException();
    const next = status.toUpperCase() as PurchaseStatus;
    const updated = await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: next },
      include: { supplier: { select: { name: true } } },
    });

    if (next === PurchaseStatus.RECEIVED && po.status !== PurchaseStatus.RECEIVED) {
        const existing = await this.prisma.invoice.findFirst({
        where: {
          organizationId,
          type: InvoiceType.PAYABLE,
          number: { contains: po.code },
        },
      });
      if (!existing) {
        const count = await this.prisma.invoice.count({
          where: { organizationId },
        });
        const due = new Date();
        due.setDate(due.getDate() + 30);
        const meta = this.purchaseUiMeta(po.meta);
        const year = new Date().getFullYear();
        await this.prisma.invoice.create({
          data: {
            number: `FC-${year}-${String(count + 1).padStart(3, "0")}`,
            type: InvoiceType.PAYABLE,
            status: InvoiceStatus.ISSUED,
            amount: Number(po.totalEstimated),
            dueDate: due,
            counterparty: po.supplier?.name || meta.supplierName || "Proveedor",
            organizationId,
            prefacturaAnnex: {
              description: `Compra ${po.code}: ${po.description}`,
            },
          },
        });
      }
    }

    return this.mapPurchaseRow(updated);
  }

  async updatePurchase(
    organizationId: string,
    id: string,
    data: {
      description?: string;
      supplier?: string;
      amount?: number;
      status?: string;
    },
  ) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, organizationId },
    });
    if (!po) throw new NotFoundException();
    const prevMeta = this.purchaseUiMeta(po.meta);
    const updated = await this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        description: data.description,
        totalEstimated:
          data.amount === undefined ? undefined : Number(data.amount),
        status: data.status
          ? (data.status.toUpperCase() as PurchaseStatus)
          : undefined,
        meta: {
          ...prevMeta,
          supplierName: data.supplier ?? prevMeta.supplierName,
        },
      },
      include: { supplier: { select: { name: true } } },
    });
    return this.mapPurchaseRow(updated);
  }

  // —— Trámites vehículo (ComplianceDocument) ——
  private mapProcedureRow(d: {
    id: string;
    type: ComplianceDocType;
    reference: string | null;
    status: DocStatus;
    expiresAt: Date | null;
    issuedAt: Date | null;
    notes: string | null;
    vehicle: { plate: string; brand: string; model: string } | null;
  }) {
    return {
      id: d.id,
      type: d.type,
      reference: d.reference,
      status: d.status,
      validTo: d.expiresAt?.toISOString() ?? null,
      validFrom: d.issuedAt?.toISOString() ?? null,
      notes: d.notes,
      vehicle: d.vehicle ?? { plate: "—", brand: "", model: "" },
    };
  }

  async listProcedures(organizationId: string) {
    const rows = await this.prisma.complianceDocument.findMany({
      where: {
        organizationId,
        vehicleId: { not: null },
      },
      include: {
        vehicle: { select: { plate: true, brand: true, model: true } },
      },
      orderBy: [{ expiresAt: "asc" }, { createdAt: "desc" }],
    });
    return rows.map((d) => this.mapProcedureRow(d));
  }

  async createProcedure(
    organizationId: string,
    data: {
      vehicleId: string;
      type: string;
      reference?: string;
      validFrom?: string;
      validTo: string;
      notes?: string;
    },
  ) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: data.vehicleId, organizationId },
    });
    if (!vehicle) throw new NotFoundException("Vehículo no encontrado");

    const typeKey = data.type.toUpperCase() as ComplianceDocType;
    if (!(Object.values(ComplianceDocType) as string[]).includes(typeKey)) {
      throw new BadRequestException(`Tipo de trámite inválido: ${data.type}`);
    }

    const expiresAt = new Date(data.validTo);
    const daysLeft = (expiresAt.getTime() - Date.now()) / 86400000;
    let status: DocStatus = DocStatus.VALID;
    if (daysLeft < 0) status = DocStatus.EXPIRED;
    else if (daysLeft < 15) status = DocStatus.EXPIRING;

    const created = await this.prisma.complianceDocument.create({
      data: {
        organizationId,
        vehicleId: data.vehicleId,
        type: typeKey,
        reference: data.reference,
        issuedAt: data.validFrom ? new Date(data.validFrom) : new Date(),
        expiresAt,
        notes: data.notes,
        status,
        runtVerified: false,
      },
      include: {
        vehicle: { select: { plate: true, brand: true, model: true } },
      },
    });

    // Hard-Stop flags en unidad cuando aplica SOAT / Tecno
    if (typeKey === ComplianceDocType.SOAT) {
      await this.prisma.vehicle.update({
        where: { id: vehicle.id },
        data: {
          soatActivo: status === DocStatus.VALID || status === DocStatus.EXPIRING,
          complianceBlocked: status === DocStatus.EXPIRED,
          complianceReason:
            status === DocStatus.EXPIRED
              ? "HARD-STOP: SOAT vencido — unidad no despachable"
              : null,
        },
      });
    }
    if (typeKey === ComplianceDocType.TECNOMECANICA) {
      await this.prisma.vehicle.update({
        where: { id: vehicle.id },
        data: {
          tecnoActiva: status === DocStatus.VALID || status === DocStatus.EXPIRING,
        },
      });
    }

    return this.mapProcedureRow(created);
  }

  async updateProcedure(
    organizationId: string,
    id: string,
    data: {
      validTo?: string;
      reference?: string;
      status?: string;
      notes?: string;
    },
  ) {
    const p = await this.prisma.complianceDocument.findFirst({
      where: { id, organizationId },
    });
    if (!p) throw new NotFoundException("Trámite no encontrado");

    let status = data.status
      ? (data.status.toUpperCase() as DocStatus)
      : undefined;
    if (data.validTo && !status) {
      const expiresAt = new Date(data.validTo);
      const daysLeft = (expiresAt.getTime() - Date.now()) / 86400000;
      status = DocStatus.VALID;
      if (daysLeft < 0) status = DocStatus.EXPIRED;
      else if (daysLeft < 15) status = DocStatus.EXPIRING;
    }

    const updated = await this.prisma.complianceDocument.update({
      where: { id },
      data: {
        expiresAt: data.validTo ? new Date(data.validTo) : undefined,
        reference: data.reference,
        notes: data.notes,
        status,
      },
      include: {
        vehicle: { select: { plate: true, brand: true, model: true } },
      },
    });
    return this.mapProcedureRow(updated);
  }

  // —— Parqueadero ——
  private mapParkingRow(log: {
    id: string;
    plate: string;
    driverName: string | null;
    guardName: string | null;
    checkedInAt: Date;
    checkedOutAt: Date | null;
    vehicle: { plate: string; brand: string } | null;
  }) {
    return {
      id: log.id,
      plate: log.plate,
      driverName: log.driverName,
      guardName: log.guardName ?? "Sistema",
      checkInAt: log.checkedInAt.toISOString(),
      checkOutAt: log.checkedOutAt?.toISOString() ?? null,
      vehicle: log.vehicle,
    };
  }

  async listParking(organizationId: string) {
    const rows = await this.prisma.parkingLog.findMany({
      where: { organizationId },
      include: { vehicle: { select: { plate: true, brand: true } } },
      orderBy: { checkedInAt: "desc" },
      take: 100,
    });
    return rows.map((r) => this.mapParkingRow(r));
  }

  async checkInParking(
    organizationId: string,
    data: {
      plate: string;
      driverName?: string;
      guardName: string;
      vehicleId?: string;
    },
  ) {
    if (!data.plate?.trim()) {
      throw new BadRequestException("Parqueadero requiere plate");
    }
    const vehicle = data.vehicleId
      ? await this.prisma.vehicle.findFirst({
          where: { id: data.vehicleId, organizationId },
        })
      : await this.prisma.vehicle.findFirst({
          where: { organizationId, plate: data.plate.toUpperCase() },
        });

    const created = await this.prisma.parkingLog.create({
      data: {
        organizationId,
        plate: (vehicle?.plate || data.plate).toUpperCase(),
        driverName: data.driverName,
        guardName: data.guardName?.trim() || "Sistema",
        vehicleId: vehicle?.id,
      },
      include: { vehicle: { select: { plate: true, brand: true } } },
    });
    return this.mapParkingRow(created);
  }

  async checkOutParking(organizationId: string, id: string) {
    const log = await this.prisma.parkingLog.findFirst({
      where: { id, organizationId, checkedOutAt: null },
    });
    if (!log) throw new NotFoundException("Ingreso no encontrado o ya cerrado");
    const updated = await this.prisma.parkingLog.update({
      where: { id },
      data: { checkedOutAt: new Date() },
      include: { vehicle: { select: { plate: true, brand: true } } },
    });
    return this.mapParkingRow(updated);
  }

  async parkingSummary(organizationId: string) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [inside, todayIn] = await Promise.all([
      this.prisma.parkingLog.count({
        where: { organizationId, checkedOutAt: null },
      }),
      this.prisma.parkingLog.count({
        where: {
          organizationId,
          checkedInAt: { gte: startOfDay },
        },
      }),
    ]);
    return { vehiclesInside: inside, checkInsToday: todayIn };
  }
}
