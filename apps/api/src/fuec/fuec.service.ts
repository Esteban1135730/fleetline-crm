import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ComplianceDocType,
  DocStatus,
  Prisma,
} from "@fsg/db";
import { isDocCalendarExpired } from "@fsg/shared";
import { readFile } from "fs/promises";
import { join, resolve } from "path";
import { PrismaService } from "../prisma/prisma.service";
import { FuecPdfService } from "./fuec-pdf.service";
import type {
  CreateFuecBody,
  FuecDocCheck,
  FuecDriverSnap,
  FuecPayload,
} from "./fuec.types";

const UPLOADS_DIR = resolve(__dirname, "../../../../uploads/fuec");

const DOC_LABELS: Record<string, string> = {
  SOAT: "SOAT",
  RCC: "RCC",
  RCE: "RCE",
  RCC_RCE: "RCC-RCE",
  TARJETA_OPERACION: "Tarjeta operación",
  POLIZA_CONTRACTUAL: "Contrato afiliación",
};

@Injectable()
export class FuecService {
  constructor(
    private prisma: PrismaService,
    private pdf: FuecPdfService,
  ) {}

  async list(organizationId: string) {
    const rows = await this.prisma.fuecDocument.findMany({
      where: { organizationId },
      include: { vehicle: { select: { plate: true, brand: true, model: true } } },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => this.toListItem(r));
  }

  async getFormOptions(organizationId: string) {
    const [org, vehicles, drivers, customers] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({
        where: { id: organizationId },
        select: { name: true, nit: true },
      }),
      this.prisma.vehicle.findMany({
        where: { organizationId },
        select: {
          id: true,
          plate: true,
          brand: true,
          model: true,
          year: true,
          capacity: true,
        },
        orderBy: { plate: "asc" },
      }),
      this.prisma.driver.findMany({
        where: { organizationId, active: true },
        select: {
          id: true,
          name: true,
          document: true,
          phone: true,
          licenseNumber: true,
          licenseExpiresAt: true,
          dispatchBlocked: true,
          blockReason: true,
        },
        orderBy: { name: "asc" },
      }),
      this.prisma.customer.findMany({
        where: { organizationId },
        select: { id: true, name: true, nit: true, phone: true },
        orderBy: { name: "asc" },
        take: 200,
      }),
    ]);
    const nextNumber = await this.suggestExtractNumber(organizationId);
    return { organization: org, vehicles, drivers, customers, nextNumber };
  }

  async vehicleContext(organizationId: string, vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      include: {
        complianceDocs: {
          orderBy: { expiresAt: "desc" },
        },
      },
    });
    if (!vehicle) throw new NotFoundException("Vehículo no encontrado");

    const importantDocs = this.buildImportantDocs(vehicle.complianceDocs);
    const blocked = importantDocs.some((d) => d.expired || d.missing);
    const operationCard =
      this.latestDoc(vehicle.complianceDocs, ComplianceDocType.TARJETA_OPERACION)
        ?.reference ?? "";

    return {
      vehicle: {
        id: vehicle.id,
        plate: vehicle.plate,
        brand: vehicle.brand,
        model: vehicle.model,
        year: vehicle.year,
        vehicleClass: "Automotor especial",
        internalNumber: vehicle.plate.slice(-3),
        operationCard,
      },
      importantDocs,
      blocked,
      blockMessage: blocked
        ? "Error! No se puede crear el FUEC ya que existen fechas de vencimiento caducas!."
        : null,
    };
  }

  async create(organizationId: string, body: CreateFuecBody) {
    this.assertCreateBody(body);

    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
    });

    const ctx = await this.vehicleContext(organizationId, body.vehicleId);
    if (ctx.blocked) {
      throw new BadRequestException({
        ok: false,
        message: ctx.blockMessage,
        docs: ctx.importantDocs,
      });
    }

    const driverIds = (body.driverIds ?? []).filter(Boolean).slice(0, 3);
    if (driverIds.length < 1) {
      throw new BadRequestException("Debe seleccionar al menos un conductor");
    }

    const driversDb = await this.prisma.driver.findMany({
      where: { organizationId, id: { in: driverIds } },
    });
    if (driversDb.length !== driverIds.length) {
      throw new BadRequestException("Conductor(es) inválidos");
    }

    const drivers: FuecDriverSnap[] = driverIds.map((id, i) => {
      const d = driversDb.find((x) => x.id === id)!;
      const licenseExpired = isDocCalendarExpired(d.licenseExpiresAt);
      return {
        driverId: d.id,
        index: i + 1,
        name: d.name,
        document: d.document,
        licenseNumber: d.licenseNumber,
        licenseExpiresAt: d.licenseExpiresAt?.toISOString() ?? null,
        licenseExpired,
        dispatchBlocked: d.dispatchBlocked,
      };
    });

    const badDriver = drivers.find(
      (d) => d.licenseExpired || d.dispatchBlocked || !d.licenseExpiresAt,
    );
    if (badDriver) {
      throw new BadRequestException({
        ok: false,
        message: `No se puede generar FUEC: conductor ${badDriver.name} con licencia vencida, sin vigencia o bloqueado.`,
        docs: ctx.importantDocs,
        drivers,
      });
    }

    const extractNumber =
      body.number?.trim() || (await this.suggestExtractNumber(organizationId));
    const routeLabel = `${body.origin.trim()} → ${body.destination.trim()}`;
    const issuedAt = new Date().toISOString();

    const payload: FuecPayload = {
      organizationName: org.name,
      organizationNit: org.nit,
      extractNumber,
      contractNumber: body.contractNumber.trim(),
      contractorName: body.contractorName.trim(),
      contractorNit: (body.contractorNit ?? "").trim(),
      contractorAddress: (body.contractorAddress ?? "").trim(),
      contractorPhone: (body.contractorPhone ?? "").trim(),
      contractObject: body.contractObject.trim(),
      origin: body.origin.trim(),
      destination: body.destination.trim(),
      routeDescription: body.routeDescription.trim(),
      consortium: (body.consortium ?? "").trim(),
      validFrom: new Date(body.validFrom).toISOString(),
      validTo: new Date(body.validTo).toISOString(),
      responsibleName: (body.responsibleName ?? "").trim(),
      responsibleDocument: (body.responsibleDocument ?? "").trim(),
      responsiblePhone: (body.responsiblePhone ?? "").trim(),
      responsibleAddress: (body.responsibleAddress ?? "").trim(),
      vehicle: {
        vehicleId: ctx.vehicle.id,
        plate: ctx.vehicle.plate,
        model: String(ctx.vehicle.model),
        brand: ctx.vehicle.brand,
        vehicleClass: ctx.vehicle.vehicleClass,
        internalNumber: ctx.vehicle.internalNumber,
        operationCard: ctx.vehicle.operationCard,
      },
      owner: {
        firstName: body.owner?.firstName?.trim() || "",
        lastNamePaternal: body.owner?.lastNamePaternal?.trim() || "",
        lastNameMaternal: body.owner?.lastNameMaternal?.trim() || "",
        document: body.owner?.document?.trim() || "",
        phone: body.owner?.phone?.trim() || "",
      },
      drivers,
      importantDocs: ctx.importantDocs,
      issuedAt,
    };

    const created = await this.prisma.fuecDocument.create({
      data: {
        organizationId,
        number: extractNumber,
        contractorName: payload.contractorName,
        routeLabel,
        validFrom: new Date(body.validFrom),
        validTo: new Date(body.validTo),
        status: DocStatus.VALID,
        vehicleId: body.vehicleId,
        tripId: body.tripId || null,
        contractNumber: payload.contractNumber,
        origin: payload.origin,
        destination: payload.destination,
        payload: payload as unknown as Prisma.InputJsonValue,
      },
      include: { vehicle: { select: { plate: true } } },
    });

    const stored = await this.pdf.renderAndStore(created.id, payload);
    const updated = await this.prisma.fuecDocument.update({
      where: { id: created.id },
      data: {
        pdfUrl: stored.pdfUrl,
        cryptoHash: stored.cryptoHash,
        qrPayload: stored.qrPayload,
      },
      include: { vehicle: { select: { plate: true } } },
    });

    return {
      ...this.toListItem(updated),
      payload,
      pdfUrl: stored.pdfUrl,
      cryptoHash: stored.cryptoHash,
    };
  }

  async update(
    organizationId: string,
    id: string,
    body: { status?: string; route?: string; routeLabel?: string; validTo?: string },
  ) {
    const existing = await this.prisma.fuecDocument.findFirst({
      where: { id, organizationId },
    });
    if (!existing) throw new NotFoundException("FUEC no encontrado");

    const data: Prisma.FuecDocumentUpdateInput = {};
    if (body.status) data.status = body.status as DocStatus;
    const route = body.routeLabel ?? body.route;
    if (route !== undefined) data.routeLabel = route;
    if (body.validTo) data.validTo = new Date(body.validTo);

    const updated = await this.prisma.fuecDocument.update({
      where: { id },
      data,
      include: { vehicle: { select: { plate: true } } },
    });
    return this.toListItem(updated);
  }

  async getPdfBuffer(organizationId: string, id: string): Promise<{
    buffer: Buffer;
    filename: string;
  }> {
    const row = await this.prisma.fuecDocument.findFirst({
      where: { id, organizationId },
    });
    if (!row) throw new NotFoundException("FUEC no encontrado");

    const filename = `FUEC-${row.number}.pdf`;
    if (row.pdfUrl) {
      try {
        const buffer = await readFile(join(UPLOADS_DIR, `${id}.pdf`));
        return { buffer, filename };
      } catch {
        /* regenerate */
      }
    }

    const payload = row.payload as FuecPayload | null;
    if (!payload) {
      throw new BadRequestException("FUEC sin payload para regenerar PDF");
    }
    const qr =
      row.qrPayload ||
      `FUEC:${row.number}|${payload.organizationNit}|${row.validTo.toISOString()}`;
    const buffer = await this.pdf.renderPdf(payload, qr);
    return { buffer, filename };
  }

  async myFuec(organizationId: string, userId: string) {
    const driver = await this.prisma.driver.findFirst({
      where: { organizationId, userId },
    });
    if (!driver) {
      return { driver: null, items: [] as ReturnType<FuecService["toListItem"]>[] };
    }

    const rows = await this.prisma.fuecDocument.findMany({
      where: {
        organizationId,
        status: { in: [DocStatus.VALID, DocStatus.EXPIRING] },
      },
      include: {
        vehicle: { select: { plate: true, brand: true, model: true } },
      },
      orderBy: { validTo: "desc" },
      take: 150,
    });

    const filtered = rows.filter((r) => {
      const p = r.payload as FuecPayload | null;
      if (p?.drivers?.some((d) => d.driverId === driver.id)) return true;
      return false;
    });

    return {
      driver: { id: driver.id, name: driver.name },
      items: filtered.map((r) => this.toListItem(r)),
    };
  }

  private toListItem(r: {
    id: string;
    number: string;
    contractorName: string;
    routeLabel: string;
    status: string;
    validFrom: Date;
    validTo: Date;
    pdfUrl: string | null;
    cryptoHash: string | null;
    contractNumber: string | null;
    origin: string | null;
    destination: string | null;
    vehicleId: string | null;
    vehicle?: { plate: string; brand?: string; model?: string } | null;
  }) {
    return {
      id: r.id,
      number: r.number,
      contractor: r.contractorName,
      contractorName: r.contractorName,
      route: r.routeLabel,
      routeLabel: r.routeLabel,
      status: r.status,
      validFrom: r.validFrom.toISOString(),
      validTo: r.validTo.toISOString(),
      pdfUrl: r.pdfUrl,
      cryptoHash: r.cryptoHash,
      contractNumber: r.contractNumber,
      origin: r.origin,
      destination: r.destination,
      vehicleId: r.vehicleId,
      vehicle: r.vehicle ?? null,
    };
  }

  private assertCreateBody(body: CreateFuecBody) {
    const required: Array<[keyof CreateFuecBody, string]> = [
      ["contractNumber", "Contrato N°"],
      ["contractorName", "Contratante"],
      ["contractObject", "Objeto contrato"],
      ["origin", "Ciudad origen"],
      ["destination", "Ciudad destino"],
      ["routeDescription", "Descripción del recorrido"],
      ["validFrom", "Fecha inicial"],
      ["validTo", "Fecha vencimiento"],
      ["vehicleId", "Placa / vehículo"],
    ];
    for (const [key, label] of required) {
      const v = body[key];
      if (typeof v !== "string" || !v.trim()) {
        throw new BadRequestException(`${label} es obligatorio`);
      }
    }
    if (new Date(body.validTo) < new Date(body.validFrom)) {
      throw new BadRequestException(
        "La fecha de vencimiento debe ser posterior a la inicial",
      );
    }
  }

  private async suggestExtractNumber(organizationId: string): Promise<string> {
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { nit: true },
    });
    const nitDigits = org.nit.replace(/\D/g, "").slice(0, 9).padStart(9, "0");
    const y = new Date().getFullYear();
    const count = await this.prisma.fuecDocument.count({
      where: { organizationId },
    });
    const seq = String(count + 1).padStart(5, "0");
    // 20-ish digit extract style
    return `${nitDigits}${y}${seq}`.slice(0, 20);
  }

  private latestDoc(
    docs: Array<{
      type: ComplianceDocType;
      reference: string | null;
      expiresAt: Date | null;
      status: DocStatus;
      issuedAt?: Date | null;
    }>,
    type: ComplianceDocType,
  ) {
    return docs
      .filter((d) => d.type === type)
      .sort((a, b) => {
        const ae = a.expiresAt?.getTime() ?? 0;
        const be = b.expiresAt?.getTime() ?? 0;
        return be - ae;
      })[0];
  }

  private buildImportantDocs(
    docs: Array<{
      type: ComplianceDocType;
      reference: string | null;
      expiresAt: Date | null;
      status: DocStatus;
      issuedAt?: Date | null;
    }>,
  ): FuecDocCheck[] {
    const soat = this.latestDoc(docs, ComplianceDocType.SOAT);
    const to = this.latestDoc(docs, ComplianceDocType.TARJETA_OPERACION);
    const rcc = this.latestDoc(docs, ComplianceDocType.RCC);
    const rce = this.latestDoc(docs, ComplianceDocType.RCE);
    const afil = this.latestDoc(docs, ComplianceDocType.POLIZA_CONTRACTUAL);

    const rccRce = [rcc, rce]
      .filter(Boolean)
      .sort(
        (a, b) =>
          (b!.expiresAt?.getTime() ?? 0) - (a!.expiresAt?.getTime() ?? 0),
      )[0];

    const asCheck = (
      label: string,
      type: string,
      doc:
        | {
            reference: string | null;
            expiresAt: Date | null;
          }
        | undefined,
      required: boolean,
    ): FuecDocCheck => {
      if (!doc) {
        return {
          type,
          label,
          number: null,
          expiresAt: null,
          expired: required,
          missing: true,
        };
      }
      const expired = isDocCalendarExpired(doc.expiresAt);
      return {
        type,
        label,
        number: doc.reference,
        expiresAt: doc.expiresAt?.toISOString() ?? null,
        expired,
        missing: false,
      };
    };

    return [
      asCheck(DOC_LABELS.SOAT, "SOAT", soat, true),
      asCheck(
        DOC_LABELS.RCC_RCE,
        "RCC_RCE",
        rccRce
          ? { reference: rccRce.reference, expiresAt: rccRce.expiresAt }
          : undefined,
        true,
      ),
      asCheck(DOC_LABELS.TARJETA_OPERACION, "TARJETA_OPERACION", to, true),
      asCheck(DOC_LABELS.POLIZA_CONTRACTUAL, "POLIZA_CONTRACTUAL", afil, true),
    ];
  }
}
