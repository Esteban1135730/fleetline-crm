import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  CommercialChannel,
  ContractRateType,
  ContractStatus,
} from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";
import { evaluateContractGate } from "./contract.calc";
import type { CreateContractDto } from "./dto/comercial.dto";

export const CONTRACT_DISPATCH_DENIED = "CONTRACT_QUOTA_OR_VALIDITY_BLOCKED";

@Injectable()
export class CommercialContractService {
  constructor(private prisma: PrismaService) {}

  list(organizationId: string) {
    return this.prisma.transportContract.findMany({
      where: { organizationId },
      include: {
        customer: { select: { id: true, name: true, nit: true, segment: true } },
        _count: { select: { trips: true } },
      },
      orderBy: { startsAt: "desc" },
    });
  }

  async create(organizationId: string, dto: CreateContractDto) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, organizationId },
    });
    if (!customer) throw new NotFoundException("Cliente no encontrado");

    const startsAt = dto.startsAt || dto.startDate || new Date();
    const endsAt = dto.endsAt || dto.endDate || null;
    if (endsAt && endsAt.getTime() < startsAt.getTime()) {
      throw new BadRequestException("endsAt anterior a startsAt");
    }

    const routeLabel = dto.routeLabel || dto.route || "Ruta contratada";
    const rateType = (dto.rateType as ContractRateType) || ContractRateType.FIXED;
    const fixedFare =
      dto.fixedFare ??
      (rateType === ContractRateType.FIXED ? dto.monthlyValue : undefined);
    const monthlyValue = dto.monthlyValue ?? fixedFare ?? 0;

    const count = await this.prisma.transportContract.count({
      where: { organizationId },
    });

    return this.prisma.transportContract.create({
      data: {
        organizationId,
        customerId: customer.id,
        code: `CTR-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`,
        name: dto.name,
        channel:
          (dto.channel as CommercialChannel) || CommercialChannel.PRIVATE,
        routeLabel,
        monthlyValue,
        budgetCap: dto.budgetCap,
        tripQuota: dto.tripQuota,
        vehicleQuota: dto.vehicleQuota,
        rateType,
        fixedFare: fixedFare ?? null,
        ratePerKm: dto.ratePerKm ?? null,
        secopProcessId: dto.secopProcessId,
        startsAt,
        endsAt,
        status: (dto.status as ContractStatus) || ContractStatus.ACTIVE,
      },
      include: {
        customer: { select: { id: true, name: true, nit: true } },
      },
    });
  }

  /**
   * Hard-Stop comercial: vigencia / cupo / presupuesto antes de planilla-FUEC.
   */
  async assertAssignableForDispatch(
    organizationId: string,
    contractId: string,
    opts?: { departAt?: Date; estimatedFare?: number },
  ) {
    const contract = await this.prisma.transportContract.findFirst({
      where: { id: contractId, organizationId },
    });
    if (!contract) {
      throw new NotFoundException("Contrato comercial no encontrado");
    }

    const gate = evaluateContractGate(contract, opts);
    if (!gate.ok) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        error: CONTRACT_DISPATCH_DENIED,
        message:
          "Planilla/FUEC bloqueada — contrato vencido, sin cupo o presupuesto agotado",
        blocks: gate.blocks,
        contractId: contract.id,
        code: contract.code,
      });
    }
    return contract;
  }

  async consumeTripQuota(
    contractId: string,
    fareAmount: number,
  ) {
    return this.prisma.transportContract.update({
      where: { id: contractId },
      data: {
        tripsUsed: { increment: 1 },
        budgetConsumed: { increment: fareAmount },
      },
    });
  }
}
