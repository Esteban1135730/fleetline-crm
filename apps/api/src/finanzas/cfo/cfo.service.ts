import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  InvoiceStatus,
  InvoiceType,
  PaymentScheduleStatus,
  QuoteStatus,
  RouteExpenseStatus,
  TripStatus,
  WorkOrderStatus,
} from "@fsg/db";
import { PrismaService } from "../../prisma/prisma.service";
import { MfaService } from "../../tesoreria/mfa.service";
import { TesoreriaService } from "../../tesoreria/tesoreria.service";
import {
  cfoMfaThresholdCop,
  requiresCfoMfa,
  simulateRentability,
} from "./cfo-rentabilidad.calc";
import type {
  CfoDispersarMfaDto,
  SimularRentabilidadDto,
} from "./dto/cfo.dto";

function num(v: unknown): number {
  if (v == null) return 0;
  return Number(v);
}

@Injectable()
export class CfoService {
  constructor(
    private prisma: PrismaService,
    private mfa: MfaService,
    private tesoreria: TesoreriaService,
  ) {}

  /**
   * Doble candado CFO: lotes > umbral (20M) requieren OTP válido
   * antes de liberar dispersión Host-to-Host.
   */
  async dispersarConMfa(
    organizationId: string,
    userId: string,
    userEmail: string | undefined,
    dto: CfoDispersarMfaDto,
  ) {
    const schedules = await this.prisma.paymentSchedule.findMany({
      where: {
        organizationId,
        id: { in: dto.paymentScheduleIds },
        status: {
          in: [PaymentScheduleStatus.QUEUED, PaymentScheduleStatus.PENDING],
        },
      },
    });
    if (schedules.length !== dto.paymentScheduleIds.length) {
      throw new NotFoundException(
        "Uno o más schedules no existen o no están en cola",
      );
    }

    const total = schedules.reduce((s, p) => s + num(p.amount), 0);
    const threshold = cfoMfaThresholdCop();

    if (!requiresCfoMfa(total)) {
      throw new ForbiddenException({
        error: "CFO_MFA_NOT_REQUIRED",
        message: `Lote ${total} COP ≤ tope CFO ${threshold} — use dispersión de Tesorería`,
        amount: total,
        thresholdCop: threshold,
      });
    }

    if (!this.mfa.validateToken(dto.mfaToken, userEmail)) {
      throw new ForbiddenException({
        error: "MFA_INVALID",
        message: "OTP CFO inválido — dispersión bloqueada",
        amount: total,
        thresholdCop: threshold,
      });
    }

    const cashProjection = await this.projectCashflow7d(organizationId, total);

    const result = await this.tesoreria.disburse(
      organizationId,
      userId,
      userEmail,
      {
        paymentScheduleIds: dto.paymentScheduleIds,
        mfaToken: dto.mfaToken,
        bankRef: dto.bankRef || `CFO-H2H-${Date.now()}`,
      },
    );

    return {
      ...result,
      cfoApproved: true,
      thresholdCop: threshold,
      cashProjection7d: cashProjection,
    };
  }

  async projectCashflow7d(organizationId: string, outboundAmount: number) {
    const now = new Date();
    const in7 = new Date(now.getTime() + 7 * 86400000);

    const [cxc, cxpQueued, bankHint] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: {
          organizationId,
          type: InvoiceType.RECEIVABLE,
          status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.OVERDUE] },
          dueDate: { lte: in7 },
        },
        _sum: { amount: true },
      }),
      this.prisma.paymentSchedule.aggregate({
        where: {
          organizationId,
          status: {
            in: [PaymentScheduleStatus.QUEUED, PaymentScheduleStatus.PENDING],
          },
        },
        _sum: { amount: true },
      }),
      this.prisma.account.findFirst({
        where: { organizationId, code: { in: ["1110", "1105"] } },
        orderBy: { code: "asc" },
      }),
    ]);

    const inflow = num(cxc._sum.amount);
    const queuedOut = num(cxpQueued._sum.amount);
    const opening = 0;
    const closing = opening + inflow - queuedOut - outboundAmount;

    return {
      horizonDays: 7,
      expectedInflowCxc: inflow,
      queuedOutflow: queuedOut,
      thisDisbursement: outboundAmount,
      projectedBalance: closing,
      bankAccountHint: bankHint?.name || "Bancos",
      alert:
        closing < 0
          ? "Proyección negativa a 7 días tras liberar el lote"
          : "Flujo nominal a 7 días",
    };
  }

  async simularRentabilidad(
    organizationId: string,
    dto: SimularRentabilidadDto,
  ) {
    const sim = simulateRentability(dto);
    let quote: { id: string; code: string; status: string } | null = null;
    if (dto.quoteId) {
      const q = await this.prisma.quote.findFirst({
        where: {
          id: dto.quoteId,
          customer: { organizationId },
        },
        select: { id: true, code: true, status: true },
      });
      if (q) quote = { id: q.id, code: q.code, status: String(q.status) };
    }

    return {
      organizationId,
      contractCode: dto.contractCode || null,
      quote,
      simulation: sim,
      message: sim.canSign
        ? "Margen dentro de política — firma financiera habilitada"
        : "EBITDA bajo umbral — firma bloqueada; contraoferta sugerida",
    };
  }

  async costeoPlaca(organizationId: string, placaRaw: string) {
    const plate = placaRaw.trim().toUpperCase();
    if (plate.length < 3) {
      throw new NotFoundException("Placa inválida");
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { organizationId, plate },
      select: { id: true, plate: true, status: true },
    });

    type WoRow = {
      requiredParts: Array<{
        quantity: number;
        inventoryItem: { unitCost: unknown; name: string } | null;
      }>;
    };

    const [routeExpenses, workOrders, trips] = await Promise.all([
      this.prisma.routeExpense.findMany({
        where: {
          organizationId,
          plate,
          status: {
            in: [RouteExpenseStatus.APPROVED, RouteExpenseStatus.POSTED],
          },
        },
        select: { kind: true, amount: true },
      }),
      (vehicle
        ? this.prisma.workOrder.findMany({
            where: {
              organizationId,
              vehicleId: vehicle.id,
              status: {
                in: [
                  WorkOrderStatus.DONE,
                  WorkOrderStatus.IN_PROGRESS,
                  WorkOrderStatus.OPEN,
                  WorkOrderStatus.WAITING_PARTS,
                ],
              },
            },
            include: {
              requiredParts: {
                include: {
                  inventoryItem: { select: { unitCost: true, name: true } },
                },
              },
            },
          })
        : Promise.resolve([] as WoRow[])) as Promise<WoRow[]>,
      this.prisma.trip.findMany({
        where: {
          organizationId,
          status: TripStatus.COMPLETED,
          OR: [
            { vehicle: { plate } },
            ...(vehicle ? [{ vehicleId: vehicle.id }] : []),
          ],
        },
        select: {
          id: true,
          code: true,
          invoices: {
            where: { type: InvoiceType.RECEIVABLE },
            select: { amount: true, status: true, number: true },
          },
        },
        take: 200,
      }),
    ]);

    const fuelAndRoute = routeExpenses.reduce((s, e) => s + num(e.amount), 0);
    const partsCost = workOrders.reduce((s, wo) => {
      const line = (wo.requiredParts || []).reduce(
        (a, p) => a + num(p.quantity) * num(p.inventoryItem?.unitCost),
        0,
      );
      return s + line;
    }, 0);
    const revenue = trips.reduce(
      (s, t) =>
        s +
        t.invoices.reduce(
          (a, inv) =>
            a +
            (inv.status === InvoiceStatus.CANCELLED ? 0 : num(inv.amount)),
          0,
        ),
      0,
    );
    const totalCost = fuelAndRoute + partsCost;
    const contribution = revenue - totalCost;
    const margin = revenue > 0 ? contribution / revenue : 0;

    return {
      plate,
      vehicle: vehicle
        ? { id: vehicle.id, status: String(vehicle.status) }
        : null,
      revenue,
      costs: {
        routeAndFuel: fuelAndRoute,
        partsAndWorkshop: partsCost,
        total: totalCost,
      },
      contribution,
      margin,
      semaphore:
        margin >= 0.2 ? "GREEN" : margin >= 0.1 ? "AMBER" : ("RED" as const),
      fleetDecisionHint:
        margin < 0.05 && revenue > 0
          ? "Evaluar baja de flota / reasignación — margen crítico"
          : "Unidad dentro de banda operativa",
      tripsCompleted: trips.length,
      workOrders: workOrders.length,
    };
  }

  async dashboard(organizationId: string) {
    const [queued, issuedCxc, routePending, quotesSent] = await Promise.all([
      this.prisma.paymentSchedule.findMany({
        where: {
          organizationId,
          status: {
            in: [PaymentScheduleStatus.QUEUED, PaymentScheduleStatus.PENDING],
          },
        },
        include: {
          invoice: {
            select: { number: true, counterparty: true, amount: true },
          },
        },
        orderBy: { amount: "desc" },
        take: 12,
      }),
      this.prisma.invoice.aggregate({
        where: {
          organizationId,
          type: InvoiceType.RECEIVABLE,
          status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.OVERDUE] },
        },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.routeExpense.aggregate({
        where: {
          organizationId,
          status: RouteExpenseStatus.PENDING,
        },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.quote.findMany({
        where: {
          status: { in: [QuoteStatus.SENT, QuoteStatus.DRAFT] },
          customer: { organizationId },
        },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          code: true,
          amount: true,
          status: true,
          customer: { select: { name: true } },
        },
      }),
    ]);

    const threshold = cfoMfaThresholdCop();
    const approvalQueue = queued.map((s) => {
      const amount = num(s.amount);
      return {
        id: s.id,
        amount,
        counterparty: s.counterparty,
        invoiceNumber: s.invoice?.number,
        requiresCfoMfa: amount > threshold,
        status: String(s.status),
      };
    });

    const highValue = approvalQueue.filter((a) => a.requiresCfoMfa);
    const cash = await this.projectCashflow7d(organizationId, 0);

    const monthLabels = ["Ene", "Feb", "Mar", "Abr", "May", "Jun"];
    const ebitdaSeries = monthLabels.map((label, i) => ({
      label,
      ebitda: Math.round(8000000 + i * 1200000 + (i % 2) * 500000),
      revenue: Math.round(22000000 + i * 2500000),
    }));

    return {
      kpis: {
        carteraAbierta: num(issuedCxc._sum.amount),
        carteraCount: issuedCxc._count,
        gastosRutaPendientes: num(routePending._sum.amount),
        gastosRutaCount: routePending._count,
        lotesCfoPendientes: highValue.length,
        cfoMfaThreshold: threshold,
      },
      approvalTray: approvalQueue,
      highValueLots: highValue,
      quotesPending: quotesSent.map((q) => ({
        id: q.id,
        code: q.code,
        amount: num(q.amount),
        status: String(q.status),
        customer: q.customer?.name || "—",
      })),
      cashProjection7d: cash,
      ebitdaSeries,
      alerts: [
        ...(num(routePending._sum.amount) > 2_000_000
          ? [
              {
                kind: "FUEL_COST_SPIKE",
                message: "Gastos de ruta pendientes elevados — revisar fugas",
                severity: "AMBER",
              },
            ]
          : []),
        ...(highValue.length
          ? [
              {
                kind: "CFO_MFA_QUEUE",
                message: `${highValue.length} lote(s) > ${threshold.toLocaleString("es-CO")} COP requieren OTP CFO`,
                severity: "RED",
              },
            ]
          : []),
        {
          kind: "CARTERA",
          message: `Cartera abierta ${num(issuedCxc._sum.amount).toLocaleString("es-CO")} COP`,
          severity: "INFO",
        },
      ],
    };
  }
}
