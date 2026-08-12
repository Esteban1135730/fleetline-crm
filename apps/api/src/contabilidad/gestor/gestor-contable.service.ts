import { createHash, randomBytes } from "crypto";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  InvoiceStatus,
  InvoiceType,
  RouteExpenseStatus,
  TripStatus,
  WorkOrderStatus,
} from "@fsg/db";
import { PrismaService } from "../../prisma/prisma.service";
import { AccountingLedgerService } from "../accounting-ledger.service";
import type {
  AprobarGastoRutaDto,
  EmitirDianDto,
  SincronizarTallerDto,
} from "./dto/gestor.dto";

function num(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  return Number(v);
}

function monthBounds(now = new Date()) {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59),
  );
  return { from, to };
}

@Injectable()
export class GestorContableService {
  constructor(
    private prisma: PrismaService,
    private ledger: AccountingLedgerService,
  ) {}

  /** Timbrado DIAN (mock proveedor) — puro / testeable */
  buildDianStamp(input: {
    organizationId: string;
    invoiceNumber: string;
    nit: string;
    amount: number;
    customerNit?: string;
  }) {
    const nonce = randomBytes(8).toString("hex");
    const raw = [
      input.organizationId,
      input.invoiceNumber,
      input.nit,
      input.customerNit || "",
      String(input.amount),
      nonce,
      process.env.DIAN_API_KEY || "DIAN_MOCK_KEY",
    ].join("|");
    const cufe = createHash("sha256").update(raw).digest("hex").toUpperCase();
    return {
      cufe,
      provider: process.env.DIAN_API_KEY ? "DIAN_LIVE" : "DIAN_MOCK",
      xmlRef: `dian://xml/${input.invoiceNumber}.xml`,
      pdfRef: `dian://pdf/${input.invoiceNumber}.pdf`,
      stampedAt: new Date().toISOString(),
    };
  }

  async aprobarGastoRuta(
    organizationId: string,
    approverId: string,
    dto: AprobarGastoRutaDto,
  ) {
    const expense = await this.prisma.routeExpense.findFirst({
      where: { id: dto.expenseId, organizationId },
    });
    if (!expense) throw new NotFoundException("Gasto de ruta no encontrado");
    if (
      expense.status === RouteExpenseStatus.APPROVED ||
      expense.status === RouteExpenseStatus.POSTED
    ) {
      throw new BadRequestException("Gasto ya aprobado/contabilizado");
    }

    if (!dto.approve) {
      return this.prisma.routeExpense.update({
        where: { id: expense.id },
        data: {
          status: RouteExpenseStatus.REJECTED,
          rejectReason: dto.rejectReason || "Rechazado en auditoría",
          approvedById: approverId,
          approvedAt: new Date(),
        },
      });
    }

    const plate = (expense.plate || "SIN-PLACA").toUpperCase();
    await this.ensureCostCenter(organizationId, plate, expense.vehicleId);

    const kind = String(expense.kind || "").toUpperCase();
    const debitCode =
      kind === "TANQUEO" || kind === "COMBUSTIBLE"
        ? "5150"
        : kind === "PEAJE"
          ? "5145"
          : "5105";

    const entry = await this.ledger.postDoubleEntry({
      organizationId,
      memo: `Smart Wallet ${expense.kind} ${plate} — aprobar y contabilizar`,
      debitCode,
      creditCode: "1110",
      amount: num(expense.amount),
      sourceEvent: "route_expense.approved",
      costCenterPlate: plate,
      meta: {
        expenseId: expense.id,
        kind: expense.kind,
        plate,
      },
    });

    return this.prisma.routeExpense.update({
      where: { id: expense.id },
      data: {
        status: RouteExpenseStatus.POSTED,
        approvedById: approverId,
        approvedAt: new Date(),
        journalEntryId: entry?.id || null,
      },
    });
  }

  async emitirDian(
    organizationId: string,
    actorUserId: string,
    dto: EmitirDianDto,
  ) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, organizationId },
    });
    if (!customer) throw new NotFoundException("Cliente no encontrado");

    const from = new Date(dto.periodFrom);
    const to = new Date(dto.periodTo);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException("periodFrom/periodTo inválidos");
    }

    const trips = await this.prisma.trip.findMany({
      where: {
        organizationId,
        customerId: customer.id,
        status: TripStatus.COMPLETED,
        ...(dto.tripIds?.length ? { id: { in: dto.tripIds } } : {}),
        OR: [
          { arriveAt: { gte: from, lte: to } },
          { departAt: { gte: from, lte: to } },
          {
            AND: [
              { arriveAt: null },
              { createdAt: { gte: from, lte: to } },
            ],
          },
        ],
      },
      include: {
        vehicle: { select: { id: true, plate: true } },
        route: { select: { name: true, origin: true, destination: true } },
      },
      orderBy: { departAt: "asc" },
      take: 500,
    });

    if (!trips.length) {
      throw new BadRequestException(
        "Sin viajes FINALIZADO/COMPLETED en el periodo para el cliente",
      );
    }

    const annex = trips.map((t) => ({
      tripId: t.id,
      code: t.code,
      date: (t.arriveAt || t.departAt || t.createdAt).toISOString(),
      plate: t.vehicle?.plate || null,
      route:
        t.route?.name ||
        [t.route?.origin, t.route?.destination].filter(Boolean).join(" → ") ||
        null,
      fare: num(t.fareAmount),
    }));
    const total = annex.reduce((s, a) => s + a.fare, 0);
    if (total <= 0) {
      throw new BadRequestException("Total de prefactura en cero");
    }

    const count = await this.prisma.invoice.count({ where: { organizationId } });
    const number = `FE-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`;

    if (dto.draftOnly) {
      const draft = await this.prisma.invoice.create({
        data: {
          organizationId,
          number: `PRE-${number}`,
          type: InvoiceType.RECEIVABLE,
          status: InvoiceStatus.DRAFT,
          counterparty: customer.name,
          amount: total,
          customerId: customer.id,
          prefacturaAnnex: { periodFrom: dto.periodFrom, periodTo: dto.periodTo, annex },
        },
      });
      return {
        draft: true,
        invoiceId: draft.id,
        number: draft.number,
        amount: total,
        tripsCount: trips.length,
        annex,
        cxcCreated: false,
        dian: null,
      };
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { nit: true, name: true },
    });

    const stamp = this.buildDianStamp({
      organizationId,
      invoiceNumber: number,
      nit: org?.nit || "900000000",
      amount: total,
      customerNit: customer.nit,
    });

    const invoice = await this.prisma.invoice.create({
      data: {
        organizationId,
        number,
        type: InvoiceType.RECEIVABLE,
        status: InvoiceStatus.ISSUED,
        counterparty: customer.name,
        amount: total,
        customerId: customer.id,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        prefacturaAnnex: {
          periodFrom: dto.periodFrom,
          periodTo: dto.periodTo,
          annex,
          notes: dto.notes || null,
          emittedBy: actorUserId,
        },
        dianCufe: stamp.cufe,
        dianStampedAt: new Date(stamp.stampedAt),
        dianXmlRef: stamp.xmlRef,
        dianPdfRef: stamp.pdfRef,
      },
    });

    await this.prisma.dianEmission.create({
      data: {
        organizationId,
        invoiceId: invoice.id,
        cufe: stamp.cufe,
        provider: stamp.provider,
        xmlRef: stamp.xmlRef,
        pdfRef: stamp.pdfRef,
        stampedAt: new Date(stamp.stampedAt),
        payload: {
          customerId: customer.id,
          tripsCount: trips.length,
          amount: total,
        },
      },
    });

    // CxC → Debito Clientes 1305 / Credito Ingresos 4135
    const journal = await this.ledger.postDoubleEntry({
      organizationId,
      memo: `FE ${number} · CxC ${customer.name}`,
      debitCode: "1305",
      creditCode: "4135",
      amount: total,
      sourceEvent: "dian.invoice.issued",
      meta: {
        invoiceId: invoice.id,
        cufe: stamp.cufe,
        customerId: customer.id,
      },
    });

    return {
      draft: false,
      invoiceId: invoice.id,
      number: invoice.number,
      amount: total,
      tripsCount: trips.length,
      annex,
      cxcCreated: true,
      journalEntryId: journal?.id || null,
      dian: stamp,
      receivablesAccount: "1305",
    };
  }

  async sincronizarTaller(
    organizationId: string,
    dto: SincronizarTallerDto,
  ) {
    const { from: defaultFrom, to: defaultTo } = monthBounds();
    const from = dto.periodFrom ? new Date(dto.periodFrom) : defaultFrom;
    const to = dto.periodTo ? new Date(dto.periodTo) : defaultTo;
    const depPerKm = dto.depreciationPerKm ?? 120;

    const workOrders = await this.prisma.workOrder.findMany({
      where: {
        organizationId,
        status: WorkOrderStatus.DONE,
        OR: [
          { closedAt: { gte: from, lte: to } },
          { closedAt: null, updatedAt: { gte: from, lte: to } },
        ],
      },
      include: {
        vehicle: { select: { id: true, plate: true, odometerKm: true } },
        requiredParts: {
          include: { inventoryItem: { select: { unitCost: true, name: true } } },
        },
        dispatches: {
          include: { inventoryItem: { select: { unitCost: true } } },
        },
      },
      take: 200,
    });

    const byPlate = new Map<
      string,
      { parts: number; laborHours: number; vehicleId: string | null; odometerKm: number }
    >();

    for (const wo of workOrders) {
      const plate = (wo.vehicle?.plate || "SIN-PLACA").toUpperCase();
      const partsFromReq = wo.requiredParts.reduce(
        (s, p) => s + num(p.inventoryItem?.unitCost) * (p.quantity || 1),
        0,
      );
      const partsFromDisp = wo.dispatches.reduce(
        (s, d) => s + num(d.inventoryItem?.unitCost),
        0,
      );
      const parts = partsFromReq + partsFromDisp;
      // Horas mecánico estimadas: 2h por OT cerrada si no hay dato
      const laborHours = 2;
      const prev = byPlate.get(plate) || {
        parts: 0,
        laborHours: 0,
        vehicleId: wo.vehicleId,
        odometerKm: wo.vehicle?.odometerKm || 0,
      };
      prev.parts += parts;
      prev.laborHours += laborHours;
      byPlate.set(plate, prev);
    }

    const provisions: Array<Record<string, unknown>> = [];
    const depreciations: Array<Record<string, unknown>> = [];

    for (const [plate, agg] of byPlate) {
      await this.ensureCostCenter(organizationId, plate, agg.vehicleId);
      const maintenanceTotal = agg.parts + agg.laborHours * 45000;
      if (maintenanceTotal > 0) {
        const entry = await this.ledger.postDoubleEntry({
          organizationId,
          memo: `Provisión mantenimiento OT · ${plate}`,
          debitCode: "5105",
          creditCode: "2205",
          amount: maintenanceTotal,
          sourceEvent: "taller.maintenance.provision",
          costCenterPlate: plate,
          meta: { plate, parts: agg.parts, laborHours: agg.laborHours },
        });
        provisions.push({
          plate,
          amount: maintenanceTotal,
          journalEntryId: entry?.id,
        });
      }

      // Depreciación por km del periodo (delta simplificado: 500 km si no hay telemetría)
      const kmDelta = Math.max(500, Math.round(agg.odometerKm * 0.002));
      const depAmount = kmDelta * depPerKm;
      if (depAmount > 0) {
        const entry = await this.ledger.postDoubleEntry({
          organizationId,
          memo: `Depreciación flota ${plate} · ${kmDelta} km`,
          debitCode: "5160",
          creditCode: "1592",
          amount: depAmount,
          sourceEvent: "fleet.depreciation",
          costCenterPlate: plate,
          meta: { plate, kmDelta, depPerKm },
        });
        depreciations.push({
          plate,
          kmDelta,
          amount: depAmount,
          journalEntryId: entry?.id,
        });
      }
    }

    return {
      periodFrom: from.toISOString(),
      periodTo: to.toISOString(),
      workOrdersClosed: workOrders.length,
      platesCosted: byPlate.size,
      provisions,
      depreciations,
    };
  }

  async dashboard(organizationId: string) {
    const { from, to } = monthBounds();

    const [
      facturado,
      cartera,
      gastosPendientes,
      journal,
      peajesPending,
      customers,
    ] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: {
          organizationId,
          type: InvoiceType.RECEIVABLE,
          status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PAID, InvoiceStatus.CAUSED] },
          createdAt: { gte: from, lte: to },
        },
        _sum: { amount: true },
      }),
      this.prisma.invoice.aggregate({
        where: {
          organizationId,
          type: InvoiceType.RECEIVABLE,
          status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.OVERDUE] },
        },
        _sum: { amount: true },
      }),
      this.prisma.routeExpense.count({
        where: { organizationId, status: RouteExpenseStatus.PENDING },
      }),
      this.prisma.journalEntry.findMany({
        where: { organizationId, status: "POSTED" },
        orderBy: { postedAt: "desc" },
        take: 80,
        include: {
          lines: {
            include: {
              debitAccount: { select: { code: true, name: true } },
              creditAccount: { select: { code: true, name: true } },
            },
          },
        },
      }),
      this.prisma.routeExpense.findMany({
        where: { organizationId, status: RouteExpenseStatus.PENDING },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      this.prisma.customer.findMany({
        where: { organizationId },
        select: { id: true, name: true, nit: true },
        take: 50,
        orderBy: { name: "asc" },
      }),
    ]);

    const recurrentes = await this.prisma.customer.findMany({
      where: { organizationId, segment: { in: ["B2B", "ESCOLAR", "B2G"] } },
      take: 10,
      select: { id: true, name: true, nit: true, segment: true },
    });

    return {
      kpis: {
        totalFacturadoMes: num(facturado._sum.amount),
        totalCarteraCxc: num(cartera._sum.amount),
        gastosRutaPendientes: gastosPendientes,
      },
      libroDiario: journal.map((j) => ({
        id: j.id,
        memo: j.memo,
        postedAt: j.postedAt?.toISOString() || j.createdAt.toISOString(),
        lines: j.lines.map((l) => ({
          amount: num(l.amount),
          debit: l.debitAccount.code,
          debitName: l.debitAccount.name,
          credit: l.creditAccount.code,
          creditName: l.creditAccount.name,
          costCenterPlate: l.costCenterPlate,
        })),
      })),
      bandeja: {
        peajesPendientes: peajesPending.map((p) => ({
          id: p.id,
          plate: p.plate || "—",
          kind: p.kind,
          amount: num(p.amount),
          photoRef: p.photoRef || p.fileRef,
          aiExtracted: (p.aiExtracted || p.ocrPayload) as Record<
            string,
            unknown
          > | null,
          driverName: p.driverName,
          createdAt: p.createdAt.toISOString(),
        })),
        facturasRecurrentes: recurrentes,
      },
      customers,
    };
  }

  private async ensureCostCenter(
    organizationId: string,
    plate: string,
    vehicleId?: string | null,
  ) {
    const p = plate.toUpperCase();
    return this.prisma.costCenter.upsert({
      where: { organizationId_plate: { organizationId, plate: p } },
      create: {
        organizationId,
        plate: p,
        code: `CC-${p}`,
        vehicleId: vehicleId || null,
        name: `Centro costo ${p}`,
      },
      update: {
        vehicleId: vehicleId || undefined,
        active: true,
      },
    });
  }
}
