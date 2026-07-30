import { Injectable, NotFoundException } from "@nestjs/common";
import {
  ContractStatus,
  CustomerSegment,
  QuoteStatus,
} from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  listCustomers(organizationId: string) {
    return this.prisma.customer.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
      include: { _count: { select: { quotes: true, trips: true } } },
    });
  }

  createCustomer(
    organizationId: string,
    data: {
      name: string;
      nit: string;
      email?: string;
      phone?: string;
      segment?: "B2B" | "ESCOLAR" | "TURISMO";
    },
  ) {
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

  listQuotes(organizationId: string) {
    return this.prisma.quote.findMany({
      where: { customer: { organizationId } },
      include: { customer: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async createQuote(
    organizationId: string,
    data: { customerId: string; amount: number; notes?: string },
  ) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: data.customerId, organizationId },
    });
    if (!customer) throw new NotFoundException("Cliente no encontrado");

    const count = await this.prisma.quote.count({
      where: { customer: { organizationId } },
    });
    return this.prisma.quote.create({
      data: {
        code: `COT-2026-${String(count + 1).padStart(3, "0")}`,
        customerId: data.customerId,
        amount: data.amount,
        notes: data.notes,
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
    });
    if (!q) throw new NotFoundException("Cotización no encontrada");
    return this.prisma.quote.update({
      where: { id },
      data: { status: status.toUpperCase() as QuoteStatus },
      include: { customer: true },
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
    return this.prisma.transportContract.create({
      data: {
        code: `CTR-2026-${String(count + 1).padStart(3, "0")}`,
        name: data?.name || `Contrato desde ${q.code}`,
        customerId: q.customerId,
        channel: "PRIVATE",
        route: data?.route || q.notes || undefined,
        startDate: start,
        endDate: end,
        monthlyValue: q.amount,
        organizationId,
        status: ContractStatus.ACTIVE,
      },
      include: {
        customer: { select: { name: true } },
        _count: { select: { trips: true } },
      },
    });
  }

  listContracts(organizationId: string) {
    return this.prisma.transportContract.findMany({
      where: { organizationId },
      include: {
        customer: { select: { name: true, nit: true } },
        _count: { select: { trips: true } },
      },
      orderBy: { startDate: "desc" },
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
        route: data.route,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        monthlyValue: data.monthlyValue,
        organizationId,
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
        route: data.route,
        monthlyValue: data.monthlyValue,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
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
