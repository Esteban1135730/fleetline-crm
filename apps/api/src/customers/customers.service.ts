import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Inject,
  forwardRef,
} from "@nestjs/common";
import {
  ContractStatus,
  CustomerSegment,
  QuoteStatus,
  Prisma,
} from "@fsg/db";
import {
  QuoteCalculateInputSchema,
  calculateQuotePrice,
  type QuoteCostBreakdown,
} from "@fsg/shared";
import { PrismaService } from "../prisma/prisma.service";
import { LogisticsService } from "../logistics/logistics.service";
import { SarlaftGuardService } from "../sarlaft/sarlaft-guard.service";

function isWinStatus(status: string) {
  const s = status.toUpperCase();
  return s === "APPROVED" || s === "WON";
}

function parseCalc(raw: unknown): QuoteCostBreakdown | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as QuoteCostBreakdown;
  if (
    typeof o.origen !== "string" ||
    typeof o.destino !== "string" ||
    typeof o.precioSugerido !== "number"
  ) {
    return null;
  }
  return o;
}

@Injectable()
export class CustomersService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => LogisticsService))
    private logistics: LogisticsService,
    private sarlaft: SarlaftGuardService,
  ) {}

  listCustomers(organizationId: string) {
    return this.prisma.customer.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        nit: true,
        email: true,
        phone: true,
        segment: true,
        sarlaftBlocked: true,
        sarlaftRiskScore: true,
        _count: { select: { quotes: true, trips: true, contracts: true } },
      },
    });
  }

  async createCustomer(
    organizationId: string,
    data: {
      name: string;
      nit: string;
      email?: string;
      phone?: string;
      segment?: "B2B" | "ESCOLAR" | "TURISMO";
      forceDespiteSarlaft?: boolean;
    },
    actor?: { userId?: string; role?: string },
  ) {
    await this.sarlaft.assertClear({
      organizationId,
      subjectDoc: data.nit,
      context: "CUSTOMER_CREATE",
      forceDespiteSarlaft: data.forceDespiteSarlaft,
      actorUserId: actor?.userId,
      actorRole: actor?.role,
    });

    return this.prisma.customer.create({
      data: {
        organizationId,
        name: data.name,
        nit: data.nit,
        email: data.email,
        phone: data.phone,
        segment: (data.segment as CustomerSegment) || CustomerSegment.B2B,
      },
    });
  }

  async updateCustomer(
    organizationId: string,
    id: string,
    data: {
      name?: string;
      email?: string;
      phone?: string;
      segment?: "B2B" | "ESCOLAR" | "TURISMO";
    },
  ) {
    const c = await this.prisma.customer.findFirst({
      where: { id, organizationId },
    });
    if (!c) throw new NotFoundException("Cliente no encontrado");
    return this.prisma.customer.update({
      where: { id },
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        segment: data.segment as CustomerSegment | undefined,
      },
    });
  }

  async listQuotes(organizationId: string) {
    const quotes = await this.prisma.quote.findMany({
      where: { customer: { organizationId } },
      include: { customer: true },
      orderBy: { createdAt: "desc" },
    });
    const trips = await this.prisma.trip.findMany({
      where: { organizationId },
      select: { id: true, code: true, status: true, meta: true },
      orderBy: { createdAt: "desc" },
      take: 300,
    });
    const byQuote = new Map<string, { id: string; code: string; status: string }>();
    for (const t of trips) {
      const meta = t.meta as { quoteCode?: string; notes?: string } | null;
      const fromMeta = meta?.quoteCode;
      const blob = `${meta?.notes ?? ""}`;
      const fromNotes = blob.match(/cotizaci[oó]n\s+(COT-[\w-]+)/i)?.[1];
      const qCode = fromMeta || fromNotes;
      if (qCode && !byQuote.has(qCode)) {
        byQuote.set(qCode, { id: t.id, code: t.code, status: t.status });
      }
    }
    return quotes.map((q) => ({
      ...q,
      draftTrip: byQuote.get(q.code) ?? null,
    }));
  }

  calculateQuote(body: unknown) {
    const parsed = QuoteCalculateInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        "Cotizador: origen, destino, tipoVehiculo y distanciaKm son obligatorios",
      );
    }
    return calculateQuotePrice(parsed.data);
  }

  async createQuote(
    organizationId: string,
    data: {
      customerId: string;
      amount?: number;
      notes?: string;
      calc?: unknown;
    },
  ) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: data.customerId, organizationId },
    });
    if (!customer) throw new NotFoundException("Cliente no encontrado");

    let breakdown: QuoteCostBreakdown | null = null;
    let amount = data.amount;
    if (data.calc) {
      breakdown = this.calculateQuote(data.calc);
      amount = breakdown.precioSugerido;
    }
    if (amount == null || Number.isNaN(Number(amount))) {
      throw new BadRequestException(
        "Indique amount o parámetros de cálculo (calc)",
      );
    }

    const routeNote = breakdown
      ? `${breakdown.origen} → ${breakdown.destino} · ${breakdown.tipoVehiculoLabel}`
      : undefined;

    const count = await this.prisma.quote.count({
      where: { customer: { organizationId } },
    });
    return this.prisma.quote.create({
      data: {
        code: `COT-2026-${String(count + 1).padStart(3, "0")}`,
        customerId: data.customerId,
        amount,
        notes: data.notes || routeNote,
        calcJson: breakdown
          ? (breakdown as unknown as Prisma.InputJsonValue)
          : undefined,
        status: QuoteStatus.DRAFT,
      },
      include: { customer: true },
    });
  }

  async updateQuoteStatus(
    organizationId: string,
    id: string,
    status: string,
  ) {
    const q = await this.prisma.quote.findFirst({
      where: { id, customer: { organizationId } },
      include: { customer: true },
    });
    if (!q) throw new NotFoundException("Cotización no encontrada");

    const mapped = status.toUpperCase() as QuoteStatus;
    const willWin = isWinStatus(mapped);

    const updated = await this.prisma.quote.update({
      where: { id },
      data: { status: mapped },
      include: { customer: true },
    });

    let draftTrip: Awaited<
      ReturnType<LogisticsService["createDraftTripFromQuote"]>
    > | null = null;
    let tripError: string | null = null;
    if (willWin) {
      draftTrip = await this.logistics.findTripByQuoteCode(
        organizationId,
        updated.code,
      );
      if (!draftTrip) {
        try {
          draftTrip = await this.createTripFromWonQuote(organizationId, updated);
        } catch (err) {
          tripError =
            err instanceof Error
              ? err.message
              : "No se pudo generar el viaje en Logística";
        }
      }
    }

    return { ...updated, draftTrip, tripError };
  }

  private async createTripFromWonQuote(
    organizationId: string,
    q: {
      id: string;
      code: string;
      customerId: string;
      amount: Prisma.Decimal | number;
      notes: string | null;
      calcJson: unknown;
    },
  ) {
    const calc = parseCalc(q.calcJson);
    let origin = calc?.origen || "Origen";
    let destination = calc?.destino || "Destino";
    if (!calc && q.notes) {
      const parts = q.notes.split(/→|->/);
      if (parts.length >= 2) {
        origin = parts[0].trim() || origin;
        destination = (parts[1].split("·")[0] || parts[1]).trim() || destination;
      }
    }

    return this.logistics.createDraftTripFromQuote(organizationId, {
      customerId: q.customerId,
      origin,
      destination,
      fareAmount: Number(q.amount),
      quoteCode: q.code,
      notes: `Auto desde cotización ${q.code} (APPROVED/WON) — tarifa ${Number(q.amount).toLocaleString("es-CO")} COP`,
    });
  }

  async quoteToContract(
    organizationId: string,
    quoteId: string,
    data?: { name?: string; route?: string; startDate?: string; endDate?: string },
  ) {
    const q = await this.prisma.quote.findFirst({
      where: { id: quoteId, customer: { organizationId } },
      include: { customer: true },
    });
    if (!q) throw new NotFoundException("Cotización no encontrada");

    await this.prisma.quote.update({
      where: { id: q.id },
      data: { status: QuoteStatus.APPROVED },
    });

    const start = data?.startDate ? new Date(data.startDate) : new Date();
    const end = data?.endDate
      ? new Date(data.endDate)
      : new Date(start.getTime() + 365 * 24 * 60 * 60 * 1000);

    const count = await this.prisma.transportContract.count({
      where: { organizationId },
    });
    const contract = await this.prisma.transportContract.create({
      data: {
        code: `CTR-2026-${String(count + 1).padStart(3, "0")}`,
        name: data?.name || `Contrato desde ${q.code}`,
        customerId: q.customerId,
        channel: "PRIVATE",
        routeLabel: data?.route || q.notes || "Ruta cotizada",
        startsAt: start,
        endsAt: end,
        monthlyValue: q.amount,
        fixedFare: Number(q.amount),
        rateType: "FIXED",
        organizationId,
        status: ContractStatus.ACTIVE,
      },
      include: {
        customer: { select: { name: true } },
        _count: { select: { trips: true } },
      },
    });

    const routeParts = (contract.routeLabel || "Origen → Destino").split(
      /→|->|-/,
    );
    const origin = (routeParts[0] || "Origen").trim() || "Origen";
    const destination =
      (routeParts[1] || routeParts[0] || "Destino").trim() || "Destino";

    const draftTrip = await this.logistics.createDraftTripFromContract(
      organizationId,
      {
        contractId: contract.id,
        customerId: q.customerId,
        origin,
        destination,
        fareAmount: Number(q.amount),
        notes: `Auto desde cotización ${q.code} → contrato ${contract.code}`,
      },
    );

    return { ...contract, draftTrip };
  }

  listContracts(organizationId: string) {
    return this.prisma.transportContract.findMany({
      where: { organizationId },
      include: {
        customer: { select: { name: true, nit: true } },
        _count: { select: { trips: true } },
      },
      orderBy: { startsAt: "desc" },
    });
  }

  async createContract(
    organizationId: string,
    data: {
      name: string;
      customerId: string;
      channel?: "PRIVATE" | "PUBLIC_TENDER";
      route?: string;
      startDate: string;
      endDate: string;
      monthlyValue?: number;
    },
  ) {
    const count = await this.prisma.transportContract.count({
      where: { organizationId },
    });
    return this.prisma.transportContract.create({
      data: {
        code: `CTR-2026-${String(count + 1).padStart(3, "0")}`,
        name: data.name,
        customerId: data.customerId,
        channel: data.channel || "PRIVATE",
        routeLabel: data.route || "Ruta contratada",
        startsAt: new Date(data.startDate),
        endsAt: new Date(data.endDate),
        monthlyValue: data.monthlyValue ?? 0,
        fixedFare: data.monthlyValue ?? null,
        rateType: "FIXED",
        organizationId,
        status: ContractStatus.ACTIVE,
      },
      include: { customer: { select: { name: true } } },
    });
  }

  async updateContract(
    organizationId: string,
    id: string,
    data: {
      name?: string;
      route?: string;
      status?: string;
      monthlyValue?: number;
      endDate?: string;
    },
  ) {
    const c = await this.prisma.transportContract.findFirst({
      where: { id, organizationId },
    });
    if (!c) throw new NotFoundException("Contrato no encontrado");
    return this.prisma.transportContract.update({
      where: { id },
      data: {
        name: data.name,
        routeLabel: data.route,
        monthlyValue: data.monthlyValue,
        endsAt: data.endDate ? new Date(data.endDate) : undefined,
        status: data.status
          ? (data.status.toUpperCase() as ContractStatus)
          : undefined,
      },
      include: {
        customer: { select: { name: true } },
        _count: { select: { trips: true } },
      },
    });
  }
}
