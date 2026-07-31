import { createHash } from "crypto";
import { readFile } from "fs/promises";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  ArchiveCategory,
  DocStatus,
  EmployeeStatus,
  InvoiceStatus,
  InvoiceType,
  PurchaseStatus,
  ProcedureType,
  SarlaftRisk,
  TicketChannel,
  TicketStatus,
} from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ModulesService {
  constructor(private prisma: PrismaService) {}

  private sha256Hex(buf: Buffer) {
    return createHash("sha256").update(buf).digest("hex");
  }

  // —— RRHH ——
  listEmployees(organizationId: string) {
    return this.prisma.employee.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
    });
  }

  createEmployee(
    organizationId: string,
    data: {
      name: string;
      document: string;
      position: string;
      area: string;
      phone?: string;
      email?: string;
      fatigueScore?: number;
    },
  ) {
    return this.prisma.employee.create({
      data: { organizationId, ...data, status: EmployeeStatus.ACTIVE },
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
        position: data.position,
        area: data.area,
        phone: data.phone,
        email: data.email,
        fatigueScore: data.fatigueScore,
        status: data.status
          ? (data.status.toUpperCase() as EmployeeStatus)
          : undefined,
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
    return this.prisma.ticket.create({
      data: {
        code: `TK-${1000 + count + 1}`,
        subject: data.subject,
        requester: data.requester,
        message: data.message,
        channel: (data.channel as TicketChannel) || TicketChannel.WHATSAPP,
        priority: data.priority || "NORMAL",
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
        priority: data.priority,
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
  listQuality(organizationId: string) {
    return this.prisma.qualityEvent.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    });
  }

  createQuality(
    organizationId: string,
    data: {
      type: string;
      title: string;
      description?: string;
      score?: number;
    },
  ) {
    return this.prisma.qualityEvent.create({
      data: { organizationId, ...data },
    });
  }

  async updateQuality(
    organizationId: string,
    id: string,
    data: { status?: string; title?: string; score?: number; description?: string },
  ) {
    const e = await this.prisma.qualityEvent.findFirst({
      where: { id, organizationId },
    });
    if (!e) throw new NotFoundException();
    return this.prisma.qualityEvent.update({
      where: { id },
      data,
    });
  }

  async qualitySummary(organizationId: string) {
    const events = await this.prisma.qualityEvent.findMany({
      where: { organizationId },
    });
    const npsEvents = events.filter((e) => e.type === "NPS" && e.score != null);
    const npsAvg =
      npsEvents.length > 0
        ? npsEvents.reduce((s, e) => s + Number(e.score), 0) / npsEvents.length
        : null;
    return {
      total: events.length,
      open: events.filter((e) => e.status === "OPEN").length,
      nps: npsAvg != null ? Number(npsAvg.toFixed(1)) : null,
      npsSamples: npsEvents.length,
      incidents: events.filter((e) => e.type === "INCIDENT").length,
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
  listSarlaft(organizationId: string) {
    return this.prisma.sarlaftCheck.findMany({
      where: { organizationId },
      include: { customer: { select: { name: true } } },
      orderBy: { checkedAt: "desc" },
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
    return this.prisma.sarlaftCheck.create({
      data: {
        organizationId,
        subjectName: data.subjectName,
        subjectDoc: data.subjectDoc,
        risk: (data.risk as SarlaftRisk) || SarlaftRisk.LOW,
        notes: data.notes,
        customerId: data.customerId,
      },
      include: { customer: { select: { name: true } } },
    });
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
                { tags: { contains: q, mode: "insensitive" } },
                { contentHash: { contains: q, mode: "insensitive" } },
                { fileRef: { contains: q, mode: "insensitive" } },
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
          tags: data.tags,
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
        tags: data.tags,
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
        tags: data.tags,
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
    return this.prisma.visitor.create({
      data: { organizationId, ...data },
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
  listForensic(organizationId: string) {
    return this.prisma.forensicFinding.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    });
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
    return this.prisma.forensicFinding.create({
      data: {
        organizationId,
        code: `RF-${String(count + 1).padStart(3, "0")}`,
        title: data.title,
        detail: data.detail,
        severity: data.severity || "MEDIUM",
        amount: data.amount,
      },
    });
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
    return this.prisma.forensicFinding.update({
      where: { id },
      data,
    });
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
    return this.prisma.visitor.update({ where: { id }, data });
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
  listPurchases(organizationId: string) {
    return this.prisma.purchaseOrder.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    });
  }

  async createPurchase(
    organizationId: string,
    data: {
      description: string;
      supplier: string;
      amount: number;
      category?: string;
      requestedBy?: string;
    },
  ) {
    const count = await this.prisma.purchaseOrder.count({
      where: { organizationId },
    });
    return this.prisma.purchaseOrder.create({
      data: {
        organizationId,
        code: `OC-${String(count + 1).padStart(4, "0")}`,
        description: data.description,
        supplier: data.supplier,
        amount: data.amount,
        category: data.category || "GENERAL",
        requestedBy: data.requestedBy,
        status: PurchaseStatus.REQUESTED,
      },
    });
  }

  async updatePurchaseStatus(
    organizationId: string,
    id: string,
    status: string,
  ) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, organizationId },
    });
    if (!po) throw new NotFoundException();
    const next = status.toUpperCase() as PurchaseStatus;
    const updated = await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: next },
    });

    if (next === PurchaseStatus.RECEIVED && po.status !== PurchaseStatus.RECEIVED) {
      const existing = await this.prisma.invoice.findFirst({
        where: {
          organizationId,
          type: InvoiceType.PAYABLE,
          description: { contains: po.code },
        },
      });
      if (!existing) {
        const count = await this.prisma.invoice.count({
          where: { organizationId },
        });
        const due = new Date();
        due.setDate(due.getDate() + 30);
        await this.prisma.invoice.create({
          data: {
            number: `FC-2026-${String(count + 1).padStart(3, "0")}`,
            type: InvoiceType.PAYABLE,
            status: InvoiceStatus.ISSUED,
            amount: po.amount,
            dueDate: due,
            supplierName: po.supplier,
            organizationId,
            description: `Compra ${po.code}: ${po.description}`,
          },
        });
      }
    }

    return updated;
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
    return this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        description: data.description,
        supplier: data.supplier,
        amount: data.amount,
        status: data.status
          ? (data.status.toUpperCase() as PurchaseStatus)
          : undefined,
      },
    });
  }

  // —— Trámites vehículo ——
  listProcedures(organizationId: string) {
    return this.prisma.vehicleProcedure.findMany({
      where: { organizationId },
      include: { vehicle: { select: { plate: true, brand: true, model: true } } },
      orderBy: { validTo: "asc" },
    });
  }

  createProcedure(
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
    const validTo = new Date(data.validTo);
    const daysLeft = (validTo.getTime() - Date.now()) / 86400000;
    let status: DocStatus = DocStatus.VALID;
    if (daysLeft < 0) status = DocStatus.EXPIRED;
    else if (daysLeft < 15) status = DocStatus.EXPIRING;

    return this.prisma.vehicleProcedure.create({
      data: {
        organizationId,
        vehicleId: data.vehicleId,
        type: data.type as ProcedureType,
        reference: data.reference,
        validFrom: data.validFrom ? new Date(data.validFrom) : undefined,
        validTo,
        notes: data.notes,
        status,
      },
      include: { vehicle: { select: { plate: true } } },
    });
  }

  async updateProcedure(
    organizationId: string,
    id: string,
    data: { validTo?: string; reference?: string; status?: string; notes?: string },
  ) {
    const p = await this.prisma.vehicleProcedure.findFirst({
      where: { id, organizationId },
    });
    if (!p) throw new NotFoundException();
    let status = data.status
      ? (data.status.toUpperCase() as DocStatus)
      : undefined;
    if (data.validTo && !status) {
      const validTo = new Date(data.validTo);
      const daysLeft = (validTo.getTime() - Date.now()) / 86400000;
      status = DocStatus.VALID;
      if (daysLeft < 0) status = DocStatus.EXPIRED;
      else if (daysLeft < 15) status = DocStatus.EXPIRING;
    }
    return this.prisma.vehicleProcedure.update({
      where: { id },
      data: {
        validTo: data.validTo ? new Date(data.validTo) : undefined,
        reference: data.reference,
        notes: data.notes,
        status,
      },
      include: { vehicle: { select: { plate: true } } },
    });
  }

  // —— Parqueadero ——
  listParking(organizationId: string) {
    return this.prisma.parkingLog.findMany({
      where: { organizationId },
      include: { vehicle: { select: { plate: true, brand: true } } },
      orderBy: { checkInAt: "desc" },
      take: 100,
    });
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
    const vehicle =
      data.vehicleId
        ? await this.prisma.vehicle.findFirst({
            where: { id: data.vehicleId, organizationId },
          })
        : await this.prisma.vehicle.findFirst({
            where: { organizationId, plate: data.plate.toUpperCase() },
          });

    return this.prisma.parkingLog.create({
      data: {
        organizationId,
        plate: (vehicle?.plate || data.plate).toUpperCase(),
        driverName: data.driverName,
        guardName: data.guardName?.trim() || "Sistema",
        vehicleId: vehicle?.id,
      },
      include: { vehicle: { select: { plate: true, brand: true } } },
    });
  }

  async checkOutParking(organizationId: string, id: string) {
    const log = await this.prisma.parkingLog.findFirst({
      where: { id, organizationId, checkOutAt: null },
    });
    if (!log) throw new NotFoundException();
    return this.prisma.parkingLog.update({
      where: { id },
      data: { checkOutAt: new Date() },
      include: { vehicle: { select: { plate: true } } },
    });
  }

  async parkingSummary(organizationId: string) {
    const [inside, todayIn] = await Promise.all([
      this.prisma.parkingLog.count({
        where: { organizationId, checkOutAt: null },
      }),
      this.prisma.parkingLog.count({
        where: {
          organizationId,
          checkInAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
    ]);
    return { vehiclesInside: inside, checkInsToday: todayIn };
  }
}
