import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { VisitorKind } from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";
import type {
  VisitorCheckInDto,
  VisitorCheckOutDto,
} from "./dto/pqrs.dto";
import { buildVisitorPass } from "./pqrs.calc";

export const VISITOR_CHECKIN_DENIED = "VISITOR_CHECKIN_DENIED";

/**
 * Control de accesos a sedes/patios — visitantes y contratistas.
 */
@Injectable()
export class VisitorControlService {
  private readonly logger = new Logger(VisitorControlService.name);

  constructor(private prisma: PrismaService) {}

  list(organizationId: string) {
    return this.prisma.visitor.findMany({
      where: { organizationId },
      orderBy: { checkedInAt: "desc" },
      take: 200,
    });
  }

  async checkIn(organizationId: string, dto: VisitorCheckInDto) {
    const kind = (dto.kind as VisitorKind) || VisitorKind.VISITOR;
    const siteLabel = dto.siteLabel || "SEDE_PRINCIPAL";

    if (!dto.document?.trim()) {
      throw new BadRequestException("Documento de identidad requerido");
    }
    if (!dto.reason?.trim()) {
      throw new BadRequestException("Motivo de visita requerido");
    }

    if (kind === VisitorKind.CONTRACTOR) {
      const arlOk =
        dto.arlValid === true &&
        (!dto.arlExpiresAt || dto.arlExpiresAt.getTime() > Date.now());
      if (!arlOk) {
        throw new UnprocessableEntityException({
          error: VISITOR_CHECKIN_DENIED,
          message:
            "Ingreso denegado — contratista requiere ARL vigente",
          blocks: ["ARL_MISSING_OR_EXPIRED"],
        });
      }
    }

    const open = await this.prisma.visitor.findFirst({
      where: {
        organizationId,
        document: dto.document.trim(),
        checkedOutAt: null,
      },
    });
    if (open) {
      throw new BadRequestException(
        `Visitante ya en sede con pase ${open.passCode || open.id}`,
      );
    }

    const { passCode, qrPayload } = buildVisitorPass({
      organizationId,
      document: dto.document.trim(),
      name: dto.name.trim(),
      siteLabel,
    });

    const visitor = await this.prisma.visitor.create({
      data: {
        organizationId,
        name: dto.name.trim(),
        document: dto.document.trim(),
        reason: dto.reason.trim(),
        hostName: dto.hostName.trim(),
        company: dto.company,
        kind,
        siteLabel,
        phone: dto.phone,
        arlValid: dto.arlValid ?? kind === VisitorKind.VISITOR,
        arlExpiresAt: dto.arlExpiresAt,
        passCode,
        qrPayload,
        badgeIssuedAt: new Date(),
        checkedInAt: new Date(),
      },
    });

    this.logger.log(
      `[VISITAS] check-in ${visitor.name} pass=${passCode} site=${siteLabel}`,
    );

    return {
      ...visitor,
      pass: {
        passCode,
        qrPayload,
        qrDataUrlHint: `fleetline-visitor://${passCode}`,
      },
    };
  }

  async checkOut(organizationId: string, dto: VisitorCheckOutDto) {
    const visitor = await this.resolveVisitor(organizationId, dto);
    if (visitor.checkedOutAt) {
      throw new BadRequestException("El visitante ya registró salida");
    }

    const updated = await this.prisma.visitor.update({
      where: { id: visitor.id },
      data: { checkedOutAt: new Date() },
    });

    this.logger.log(
      `[VISITAS] check-out ${updated.name} pass=${updated.passCode}`,
    );

    return {
      ...updated,
      dwellMinutes: Math.round(
        (updated.checkedOutAt!.getTime() - updated.checkedInAt.getTime()) /
          60_000,
      ),
    };
  }

  private async resolveVisitor(
    organizationId: string,
    dto: VisitorCheckOutDto,
  ) {
    if (dto.visitorId) {
      const v = await this.prisma.visitor.findFirst({
        where: { id: dto.visitorId, organizationId },
      });
      if (!v) throw new NotFoundException("Visitante no encontrado");
      return v;
    }
    if (dto.passCode) {
      const v = await this.prisma.visitor.findFirst({
        where: {
          organizationId,
          passCode: dto.passCode,
          checkedOutAt: null,
        },
        orderBy: { checkedInAt: "desc" },
      });
      if (!v) throw new NotFoundException("Pase de visitante no encontrado");
      return v;
    }
    if (dto.document) {
      const v = await this.prisma.visitor.findFirst({
        where: {
          organizationId,
          document: dto.document,
          checkedOutAt: null,
        },
        orderBy: { checkedInAt: "desc" },
      });
      if (!v) throw new NotFoundException("Visitante en sede no encontrado");
      return v;
    }
    throw new BadRequestException("Identificador de visitante requerido");
  }
}
