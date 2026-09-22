import {
  ForbiddenException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { InvoiceStatus, InvoiceType } from "@fsg/db";
import { COMMERCIAL_ARREARS_DAYS_HARD_STOP } from "@fsg/shared";
import type { PrismaService } from "../prisma/prisma.service";
import type { SarlaftGuardService } from "../sarlaft/sarlaft-guard.service";

/**
 * SCRUM-25 + SCRUM-28 — Hard-stops comerciales (mora ≥60d + SARLAFT).
 */
export async function assertCustomerCommercialClear(
  prisma: PrismaService,
  sarlaft: SarlaftGuardService,
  organizationId: string,
  customerId: string,
) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organizationId },
    select: {
      id: true,
      name: true,
      nit: true,
      sarlaftBlocked: true,
    },
  });
  if (!customer) {
    throw new UnprocessableEntityException("Cliente no encontrado");
  }

  if (customer.sarlaftBlocked) {
    throw new ForbiddenException({
      statusCode: 403,
      error: "SARLAFT_COMPLIANCE_BLOCKED",
      message: `Operación comercial bloqueada — cliente ${customer.name} en riesgo SARLAFT`,
      customerId: customer.id,
      document: customer.nit,
    });
  }

  await sarlaft.assertClear({
    organizationId,
    subjectDoc: customer.nit,
    subjectName: customer.name,
    context: "CUSTOMER_CREATE",
  });

  const arrears = await getCustomerArrearsDays(prisma, organizationId, customerId);
  if (arrears.maxDaysOverdue >= COMMERCIAL_ARREARS_DAYS_HARD_STOP) {
    throw new ForbiddenException({
      statusCode: 403,
      error: "COMMERCIAL_ARREARS_HARD_STOP",
      message: `Venta bloqueada — mora de ${arrears.maxDaysOverdue} días (límite ${COMMERCIAL_ARREARS_DAYS_HARD_STOP})`,
      customerId: customer.id,
      overdueInvoiceIds: arrears.overdueInvoiceIds,
      maxDaysOverdue: arrears.maxDaysOverdue,
    });
  }

  return customer;
}

export async function getCustomerArrearsDays(
  prisma: PrismaService,
  organizationId: string,
  customerId: string,
): Promise<{ maxDaysOverdue: number; overdueInvoiceIds: string[] }> {
  const now = new Date();
  const invoices = await prisma.invoice.findMany({
    where: {
      organizationId,
      customerId,
      type: InvoiceType.RECEIVABLE,
      status: {
        in: [InvoiceStatus.ISSUED, InvoiceStatus.OVERDUE, InvoiceStatus.CAUSED],
      },
      dueDate: { lt: now },
    },
    select: { id: true, dueDate: true, status: true },
  });

  let maxDaysOverdue = 0;
  const overdueInvoiceIds: string[] = [];
  for (const inv of invoices) {
    if (!inv.dueDate) continue;
    const days = Math.floor(
      (now.getTime() - inv.dueDate.getTime()) / (24 * 60 * 60 * 1000),
    );
    if (days <= 0) continue;
    overdueInvoiceIds.push(inv.id);
    if (days > maxDaysOverdue) maxDaysOverdue = days;
  }

  return { maxDaysOverdue, overdueInvoiceIds };
}
