import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ExpenseLegalizationStatus,
  InvoiceStatus,
  InvoiceType,
  BankReconciliationStatus,
} from "@fsg/db";
import { RBAC_FORBIDDEN_MESSAGE } from "@fsg/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { ThreeWayMatchingService } from "../../compras/three-way-matching.service";
import { ComprasService } from "../../compras/compras.service";
import type {
  ConciliacionAutoMatchDto,
  LegalizacionCerrarDto,
  ThreeWayMatchDto,
} from "./dto/auxiliar.dto";

function num(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  return Number(v);
}

function todayUtcDate() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

@Injectable()
export class AuxiliarContableService {
  constructor(
    private prisma: PrismaService,
    private threeWay: ThreeWayMatchingService,
    private compras: ComprasService,
  ) {}

  /**
   * Bloqueo de causación cuando el 3-Way presenta diferencias de valor.
   * Puro / testeable sin I/O.
   */
  canCausarFactura(evaluation: {
    outcome: string;
    priceDelta?: number;
    reasons?: string[];
  }): { allowed: boolean; blockReason: string | null } {
    if (evaluation.outcome !== "APPROVED") {
      return {
        allowed: false,
        blockReason:
          evaluation.reasons?.join("; ") ||
          "3-Way Match con discrepancia — causación bloqueada",
      };
    }
    return { allowed: true, blockReason: null };
  }

  async runThreeWayMatch(
    organizationId: string,
    userId: string,
    dto: ThreeWayMatchDto,
  ) {
    const result = await this.compras.processThreeWay(organizationId, {
      purchaseOrderId: dto.purchaseOrderId,
      goodsReceiptId: dto.goodsReceiptId,
      invoiceId: dto.invoiceId,
      invoiceNumber: dto.invoiceNumber,
      amount: dto.amount,
      counterparty: dto.counterparty,
      xmlHash: dto.xmlHash,
      dianPayload: dto.dianPayload,
    });

    const gate = this.canCausarFactura({
      outcome: String(result.status),
      priceDelta: num(result.priceDelta),
      reasons: result.reasons,
    });

    if (dto.action === "CAUSAR") {
      if (!gate.allowed) {
        throw new BadRequestException({
          message: "Causación bloqueada por discrepancia 3-Way Match",
          code: "THREE_WAY_CAUSAR_BLOCKED",
          reasons: result.reasons,
          priceDelta: result.priceDelta,
          qtyDelta: result.qtyDelta,
        });
      }
      const invoiceId = result.invoiceId || dto.invoiceId;
      if (!invoiceId) throw new BadRequestException("invoiceId requerido para causar");
      const caused = await this.causarFactura(
        organizationId,
        userId,
        invoiceId,
        result.matchId,
      );
      await this.bumpProductivity(organizationId, userId);
      return {
        ...result,
        causarEnabled: true,
        causarBlocked: false,
        caused: true,
        invoice: caused,
      };
    }

    if (dto.action === "DEVOLVER" || result.invoiceBlocked) {
      const invoiceId = result.invoiceId || dto.invoiceId;
      if (invoiceId) {
        await this.devolverProveedor(organizationId, invoiceId, result.reasons);
      }
      await this.bumpProductivity(organizationId, userId);
      return {
        ...result,
        causarEnabled: false,
        causarBlocked: true,
        returnedToVendor: true,
      };
    }

    await this.bumpProductivity(organizationId, userId);
    return {
      ...result,
      causarEnabled: gate.allowed,
      causarBlocked: !gate.allowed,
      blockReason: gate.blockReason,
    };
  }

  async causarFactura(
    organizationId: string,
    userId: string,
    invoiceId: string,
    matchId?: string,
  ) {
    if (!invoiceId) throw new BadRequestException("invoiceId requerido");
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, organizationId },
      include: {
        threeWayMatches: {
          where: { status: "APPROVED" },
          orderBy: { evaluatedAt: "desc" },
          take: 1,
        },
      },
    });
    if (!invoice) throw new NotFoundException("Factura no encontrada");

    const approved =
      invoice.threeWayMatches[0] ||
      (matchId
        ? await this.prisma.threeWayMatch.findFirst({
            where: { id: matchId, status: "APPROVED" },
          })
        : null);

    if (!approved) {
      throw new BadRequestException(
        "No hay 3-Way Match APPROVED — no se puede causar",
      );
    }

    return this.prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: InvoiceStatus.CAUSED,
        paymentApproved: false,
      },
    });
  }

  async devolverProveedor(
    organizationId: string,
    invoiceId: string,
    reasons?: string[],
  ) {
    return this.prisma.invoice.updateMany({
      where: { id: invoiceId, organizationId },
      data: {
        status: InvoiceStatus.RETURNED_TO_VENDOR,
        paymentApproved: false,
      },
    });
  }

  async cerrarLegalizacion(
    organizationId: string,
    reviewerId: string,
    dto: LegalizacionCerrarDto,
  ) {
    const row = await this.prisma.expenseLegalization.findFirst({
      where: { id: dto.legalizationId, organizationId },
      include: { lines: true },
    });
    if (!row) throw new NotFoundException("Legalización no encontrada");
    if (row.status === ExpenseLegalizationStatus.CLOSED) {
      throw new BadRequestException("Legalización ya cerrada");
    }

    if (dto.additionalExpenses?.length) {
      await this.prisma.expenseLegalizationLine.createMany({
        data: dto.additionalExpenses.map((e) => ({
          legalizationId: row.id,
          source: "MANUAL",
          description: e.description,
          amount: e.amount,
          receiptRef: e.receiptRef || null,
        })),
      });
    }

    const lines = await this.prisma.expenseLegalizationLine.findMany({
      where: { legalizationId: row.id },
    });
    const expensesTotal = lines.reduce((s, l) => s + num(l.amount), 0);
    const advance = num(row.advanceAmount);
    const balance = advance - expensesTotal;
    let settlementKind = "ZERO";
    let status: ExpenseLegalizationStatus = ExpenseLegalizationStatus.CLOSED;

    if (balance > 0.01) {
      settlementKind = "COMPANY_CREDIT";
      if (dto.applyPayrollDeduction !== false) {
        status = ExpenseLegalizationStatus.ADJUSTED_PAYROLL;
      } else {
        status = ExpenseLegalizationStatus.REFUND_PENDING;
      }
    } else if (balance < -0.01) {
      settlementKind = "DRIVER_CREDIT";
    }

    const updated = await this.prisma.expenseLegalization.update({
      where: { id: row.id },
      data: {
        expensesTotal,
        balance,
        settlementKind,
        status,
        notes: dto.notes?.trim() || row.notes,
        reviewedById: reviewerId,
        closedAt: new Date(),
      },
      include: { lines: true },
    });

    await this.bumpProductivity(organizationId, reviewerId);

    return {
      id: updated.id,
      code: updated.code,
      advanceAmount: num(updated.advanceAmount),
      expensesTotal: num(updated.expensesTotal),
      balance: num(updated.balance),
      settlementKind: updated.settlementKind,
      status: updated.status,
      payrollDeduction:
        settlementKind === "COMPANY_CREDIT" &&
        status === ExpenseLegalizationStatus.ADJUSTED_PAYROLL
          ? Math.abs(num(updated.balance))
          : 0,
      lines: updated.lines.map((l) => ({
        id: l.id,
        source: l.source,
        description: l.description,
        amount: num(l.amount),
      })),
    };
  }

  async autoMatchConciliacion(
    organizationId: string,
    userId: string,
    dto: ConciliacionAutoMatchDto,
  ) {
    let statementId = dto.statementId;

    if (!statementId) {
      if (!dto.rows?.length) {
        throw new BadRequestException("statementId o rows requerido");
      }
      const statement = await this.prisma.bankStatement.create({
        data: {
          organizationId,
          bankName: dto.bankName || null,
          periodDate: dto.periodDate ? new Date(dto.periodDate) : new Date(),
          fileName: "upload.csv",
          uploadedById: userId,
          rawRows: dto.rows,
          lines: {
            create: dto.rows.map((r) => ({
              externalRef: r.externalRef || null,
              description: r.description,
              amount: r.amount,
              bookedAt: r.bookedAt ? new Date(r.bookedAt) : null,
            })),
          },
        },
      });
      statementId = statement.id;
    }

    const statement = await this.prisma.bankStatement.findFirst({
      where: { id: statementId, organizationId },
      include: { lines: true },
    });
    if (!statement) throw new NotFoundException("Extracto no encontrado");

    const invoices = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        status: {
          in: [
            InvoiceStatus.ISSUED,
            InvoiceStatus.CLEARED_FOR_PAYMENT,
            InvoiceStatus.CAUSED,
            InvoiceStatus.PAID,
            InvoiceStatus.PENDING_MATCH,
          ],
        },
      },
      select: {
        id: true,
        number: true,
        amount: true,
        counterparty: true,
        type: true,
      },
      take: 500,
    });

    let matchedCount = 0;
    const matches: Array<{
      lineId: string;
      invoiceId: string;
      score: number;
    }> = [];

    for (const line of statement.lines.filter((l) => !l.matched)) {
      const amt = Math.abs(num(line.amount));
      const desc = line.description.toLowerCase();
      let best: { invoiceId: string; score: number } | null = null;

      for (const inv of invoices) {
        const invAmt = Math.abs(num(inv.amount));
        let score = 0;
        if (Math.abs(invAmt - amt) <= 1) score += 0.7;
        else if (Math.abs(invAmt - amt) / Math.max(invAmt, 1) < 0.01)
          score += 0.5;
        if (
          desc.includes(inv.number.toLowerCase()) ||
          (line.externalRef &&
            inv.number.toLowerCase().includes(line.externalRef.toLowerCase()))
        ) {
          score += 0.3;
        }
        if (
          inv.counterparty &&
          desc.includes(inv.counterparty.toLowerCase().slice(0, 8))
        ) {
          score += 0.15;
        }
        if (!best || score > best.score) best = { invoiceId: inv.id, score };
      }

      if (best && best.score >= 0.7) {
        await this.prisma.bankStatementLine.update({
          where: { id: line.id },
          data: {
            matched: true,
            invoiceId: best.invoiceId,
            matchScore: best.score,
          },
        });
        matchedCount += 1;
        matches.push({
          lineId: line.id,
          invoiceId: best.invoiceId,
          score: best.score,
        });
      }
    }

    const unmatchedCount = statement.lines.length - matchedCount;
    const status =
      unmatchedCount === 0
        ? BankReconciliationStatus.CLOSED
        : matchedCount > 0
          ? BankReconciliationStatus.PARTIAL
          : BankReconciliationStatus.OPEN;

    const recon = await this.prisma.bankReconciliation.upsert({
      where: { statementId: statement.id },
      create: {
        organizationId,
        statementId: statement.id,
        status: dto.closeDaily && unmatchedCount === 0
          ? BankReconciliationStatus.CLOSED
          : status,
        matchedCount,
        unmatchedCount,
        closedAt:
          dto.closeDaily && unmatchedCount === 0 ? new Date() : null,
        closedById:
          dto.closeDaily && unmatchedCount === 0 ? userId : null,
      },
      update: {
        matchedCount,
        unmatchedCount,
        status: dto.closeDaily && unmatchedCount === 0
          ? BankReconciliationStatus.CLOSED
          : status,
        closedAt:
          dto.closeDaily && unmatchedCount === 0 ? new Date() : undefined,
        closedById:
          dto.closeDaily && unmatchedCount === 0 ? userId : undefined,
      },
    });

    await this.bumpProductivity(organizationId, userId);

    return {
      statementId: statement.id,
      reconciliationId: recon.id,
      matchedCount,
      unmatchedCount,
      status: recon.status,
      matches,
      dailyCashClosed: recon.status === BankReconciliationStatus.CLOSED,
    };
  }

  async dashboard(organizationId: string, userId: string) {
    const [facturas, legalizaciones, conciliacionLines, productivity] =
      await Promise.all([
        this.prisma.invoice.findMany({
          where: {
            organizationId,
            type: {
              in: [InvoiceType.PAYABLE, InvoiceType.SUPPLIER_ELECTRONIC],
            },
            status: {
              in: [
                InvoiceStatus.DRAFT,
                InvoiceStatus.ISSUED,
                InvoiceStatus.PENDING_MATCH,
              ],
            },
          },
          orderBy: { createdAt: "desc" },
          take: 40,
        }),
        this.prisma.expenseLegalization.findMany({
          where: {
            organizationId,
            status: {
              in: [
                ExpenseLegalizationStatus.OPEN,
                ExpenseLegalizationStatus.IN_REVIEW,
              ],
            },
          },
          orderBy: { createdAt: "desc" },
          take: 40,
          include: { lines: true },
        }),
        this.prisma.bankStatementLine.findMany({
          where: {
            matched: false,
            statement: { organizationId },
          },
          orderBy: { createdAt: "desc" },
          take: 40,
          include: {
            statement: { select: { id: true, bankName: true, periodDate: true } },
          },
        }),
        this.prisma.auxiliarProductivityLog.findUnique({
          where: {
            organizationId_userId_workDate: {
              organizationId,
              userId,
              workDate: todayUtcDate(),
            },
          },
        }),
      ]);

    const cartera = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        type: InvoiceType.RECEIVABLE,
      },
      orderBy: { dueDate: "asc" },
      take: 20,
      select: {
        id: true,
        number: true,
        counterparty: true,
        amount: true,
        status: true,
        dueDate: true,
      },
    });

    return {
      kanban: {
        facturasPorRadicar: facturas.map((f) => ({
          id: f.id,
          number: f.number,
          counterparty: f.counterparty,
          amount: num(f.amount),
          status: f.status,
          supportHint: f.xmlHash ? "XML" : "PDF",
        })),
        anticiposPorLegalizar: legalizaciones.map((l) => ({
          id: l.id,
          code: l.code,
          driverName: l.driverName,
          advanceAmount: num(l.advanceAmount),
          expensesTotal: num(l.expensesTotal),
          status: l.status,
          linesCount: l.lines.length,
        })),
        transaccionesPorConciliar: conciliacionLines.map((c) => ({
          id: c.id,
          description: c.description,
          amount: num(c.amount),
          statementId: c.statementId,
          bankName: c.statement.bankName,
          periodDate: c.statement.periodDate.toISOString(),
        })),
      },
      carteraReadonly: cartera.map((c) => ({
        ...c,
        amount: num(c.amount),
        dueDate: c.dueDate?.toISOString() ?? null,
      })),
      productivity: {
        documentsProcessedToday: productivity?.documentsCount ?? 0,
        workDate: todayUtcDate().toISOString().slice(0, 10),
      },
    };
  }

  assertNotPucOrDisperse(path: string) {
    const p = path.toLowerCase();
    if (
      p.includes("/puc") ||
      p.includes("/dispersar") ||
      p.includes("/payments/disburse")
    ) {
      throw new ForbiddenException(RBAC_FORBIDDEN_MESSAGE);
    }
  }

  private async bumpProductivity(organizationId: string, userId: string) {
    const workDate = todayUtcDate();
    await this.prisma.auxiliarProductivityLog.upsert({
      where: {
        organizationId_userId_workDate: {
          organizationId,
          userId,
          workDate,
        },
      },
      create: {
        organizationId,
        userId,
        workDate,
        documentsCount: 1,
      },
      update: { documentsCount: { increment: 1 } },
    });
  }
}
