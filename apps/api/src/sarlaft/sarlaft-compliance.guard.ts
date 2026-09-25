import {
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { SarlaftAlertStatus, SarlaftRisk } from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";
import { normalizeSarlaftDoc } from "./restrictive-lists.client";
import { SARLAFT_BLOCK_SCORE } from "./sarlaft-screening.service";

export type SarlaftComplianceContext =
  | "PURCHASE_ORDER"
  | "TREASURY_DISBURSE"
  | "LOGISTICS_ASSIGN"
  | "LOGISTICS_DISPATCH"
  | "CUSTOMER_CREATE"
  | "INVOICE_PAY";

/**
 * Guard operativo SARLAFT — Compras (08), Tesorería (09) y Logística (04).
 * Impide OC / desembolsos / asignación-despacho si la contraparte tiene
 * sarlaftBlocked o alerta abierta de alto riesgo.
 */
@Injectable()
export class SarlaftComplianceGuard {
  constructor(private prisma: PrismaService) {}

  assertNotBlocked(params: {
    entityLabel: string;
    sarlaftBlocked?: boolean | null;
    document?: string;
    entityId?: string;
    context: SarlaftComplianceContext;
  }) {
    if (!params.sarlaftBlocked) return;
    throw new ForbiddenException({
      statusCode: 403,
      error: "SARLAFT_COMPLIANCE_BLOCKED",
      message: `Operación bloqueada por SARLAFT — ${params.entityLabel} en lista restrictiva / riesgo alto`,
      context: params.context,
      entityId: params.entityId,
      document: params.document,
    });
  }

  async assertSupplierClear(
    organizationId: string,
    supplierId: string,
    context: "PURCHASE_ORDER" | "TREASURY_DISBURSE" = "PURCHASE_ORDER",
  ) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, organizationId },
    });
    if (!supplier) return null;

    this.assertNotBlocked({
      entityLabel: `Proveedor ${supplier.name}`,
      sarlaftBlocked: supplier.sarlaftBlocked,
      document: supplier.nit,
      entityId: supplier.id,
      context,
    });

    await this.assertDocumentClear(organizationId, supplier.nit, context);
    return supplier;
  }

  /**
   * Hard-stop logística: conductor con hallazgo SARLAFT alto no se asigna/despacha.
   */
  async assertDriverClear(
    organizationId: string,
    driverId: string,
    context: "LOGISTICS_ASSIGN" | "LOGISTICS_DISPATCH" = "LOGISTICS_ASSIGN",
  ) {
    const driver = await this.prisma.driver.findFirst({
      where: { id: driverId, organizationId },
      select: { id: true, name: true, document: true },
    });
    if (!driver) return null;

    const employee = await this.prisma.employee.findFirst({
      where: {
        organizationId,
        OR: [
          { document: driver.document },
          { driverId: driver.id },
        ],
      },
      select: { id: true, name: true, document: true, sarlaftBlocked: true },
    });

    if (employee?.sarlaftBlocked) {
      this.assertNotBlocked({
        entityLabel: `Conductor ${driver.name}`,
        sarlaftBlocked: true,
        document: employee.document || driver.document,
        entityId: employee.id,
        context,
      });
    }

    await this.assertDocumentClear(organizationId, driver.document, context);
    return driver;
  }

  async assertDocumentClear(
    organizationId: string,
    document: string,
    context: SarlaftComplianceContext,
  ) {
    const needle = normalizeSarlaftDoc(document);
    if (!needle) return;

    const hit = await this.prisma.sarlaftCheck.findFirst({
      where: {
        organizationId,
        document: needle,
        status: {
          in: [SarlaftAlertStatus.PENDING, SarlaftAlertStatus.UNDER_REVIEW],
        },
        OR: [
          { risk: { in: [SarlaftRisk.HIGH, SarlaftRisk.BLOCKED] } },
          { riskScore: { gte: SARLAFT_BLOCK_SCORE } },
        ],
      },
      orderBy: { createdAt: "desc" },
    });

    if (!hit) return;

    throw new ForbiddenException({
      statusCode: 403,
      error: "SARLAFT_COMPLIANCE_BLOCKED",
      message: `Sujeto en hallazgo SARLAFT (${hit.risk}: ${hit.subjectName})`,
      context,
      alertId: hit.id,
      document: hit.document,
      riskScore: hit.riskScore,
    });
  }

  /** Compat legado (clientes / finance). */
  async assertClear(params: {
    organizationId: string;
    subjectDoc: string;
    subjectName?: string;
    context:
      | "CUSTOMER_CREATE"
      | "INVOICE_PAY"
      | "PURCHASE_ORDER"
      | "TREASURY_DISBURSE";
    forceDespiteSarlaft?: boolean;
    actorUserId?: string;
    actorRole?: string;
  }) {
    const mapped: "PURCHASE_ORDER" | "TREASURY_DISBURSE" =
      params.context === "INVOICE_PAY" || params.context === "TREASURY_DISBURSE"
        ? "TREASURY_DISBURSE"
        : "PURCHASE_ORDER";

    if (params.forceDespiteSarlaft) {
      const role = String(params.actorRole || "").toLowerCase();
      if (role !== "presidencia" && role !== "finanzas") {
        throw new ForbiddenException(
          "Override SARLAFT solo roles presidencia/finanzas",
        );
      }
      await this.prisma.auditLog.create({
        data: {
          action: "SARLAFT_FORCE_OVERRIDE",
          entity: params.context,
          userId: params.actorUserId,
          organizationId: params.organizationId,
          meta: {
            subjectDoc: params.subjectDoc,
            subjectName: params.subjectName,
            context: params.context,
          },
        },
      });
      return;
    }

    const needle = normalizeSarlaftDoc(params.subjectDoc);
    const customers = await this.prisma.customer.findMany({
      where: { organizationId: params.organizationId },
      select: {
        id: true,
        name: true,
        nit: true,
        sarlaftBlocked: true,
      },
      take: 500,
    });
    const customer = customers.find(
      (c) => normalizeSarlaftDoc(c.nit) === needle,
    );
    if (customer?.sarlaftBlocked) {
      this.assertNotBlocked({
        entityLabel: `Cliente ${customer.name}`,
        sarlaftBlocked: true,
        document: customer.nit,
        entityId: customer.id,
        context: mapped,
      });
    }

    await this.assertDocumentClear(
      params.organizationId,
      params.subjectDoc,
      mapped,
    );
  }
}
