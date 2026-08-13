import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { FleetModule } from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";
import type {
  CrearConflictoDto,
  ResolverConflictoDto,
} from "./dto/subgerencia.dto";

@Injectable()
export class SubgerenciaService {
  constructor(private prisma: PrismaService) {}

  async dashboard(organizationId: string) {
    const [conflicts, projects, trips] = await Promise.all([
      this.prisma.subgerenciaConflict.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        take: 40,
      }),
      this.prisma.subgerenciaProject.findMany({
        where: { organizationId },
        orderBy: { updatedAt: "desc" },
        take: 40,
      }),
      this.prisma.trip.findMany({
        where: {
          organizationId,
          status: { in: ["COMPLETED", "IN_TRANSIT", "ASSIGNED"] },
        },
        select: { id: true, distanceKm: true, status: true, origin: true, destination: true },
        take: 200,
      }),
    ]);

    const deadheadKm = trips.reduce((acc, t) => {
      const metaDeadhead = 0;
      return acc + metaDeadhead + (t.distanceKm ? t.distanceKm * 0.12 : 0);
    }, 0);

    const bottlenecks = [
      {
        area: "Taller → Logística",
        severity: conflicts.filter((c) =>
          c.parties.includes("TALLER") && c.parties.includes("LOGISTICA") && c.status === "OPEN",
        ).length,
        label: "Liberación OT / despacho",
      },
      {
        area: "Patio → Talanquera",
        severity: 2,
        label: "Cola de lavado / LIFO",
      },
      {
        area: "Deadhead Miles",
        severity: Math.min(10, Math.round(deadheadKm / 50)),
        label: `${deadheadKm.toFixed(0)} km en vacío (estimado)`,
      },
    ];

    const kanban = {
      BACKLOG: projects.filter((p) => p.status === "BACKLOG"),
      IN_PROGRESS: projects.filter((p) => p.status === "IN_PROGRESS"),
      DONE: projects.filter((p) => p.status === "DONE"),
    };

    return {
      hub: "Ejecución Táctica",
      role: "SUBGERENTE",
      heatmap: bottlenecks,
      deadheadKm: Math.round(deadheadKm),
      satelliteYards: [
        { code: "SAT-NORTE", name: "Parqueadero satélite Norte", capacity: 40 },
        { code: "SAT-SUR", name: "Parqueadero satélite Sur", capacity: 28 },
      ],
      conflictsOpen: conflicts.filter((c) => c.status === "OPEN"),
      conflictsResolved: conflicts.filter((c) => c.status === "RESOLVED"),
      kanban,
    };
  }

  async crearConflicto(
    organizationId: string,
    dto: CrearConflictoDto,
  ) {
    const code = `CFG-${Date.now().toString(36).toUpperCase()}`;
    return this.prisma.subgerenciaConflict.create({
      data: {
        organizationId,
        code,
        title: dto.title,
        parties: dto.parties,
        status: "OPEN",
        level: 2,
        meta: (dto.meta ?? {}) as object,
      },
    });
  }

  async resolverConflicto(
    organizationId: string,
    userId: string,
    dto: ResolverConflictoDto,
  ) {
    if (!dto.conflictId && !dto.code) {
      throw new BadRequestException("Indique conflictId o code");
    }

    const conflict = await this.prisma.subgerenciaConflict.findFirst({
      where: {
        organizationId,
        ...(dto.conflictId ? { id: dto.conflictId } : { code: dto.code }),
      },
    });
    if (!conflict) throw new NotFoundException("Conflicto no encontrado");

    const updated = await this.prisma.subgerenciaConflict.update({
      where: { id: conflict.id },
      data: {
        status: "RESOLVED",
        resolution: dto.resolution,
        resolvedById: userId,
        resolvedAt: new Date(),
        meta: {
          ...((conflict.meta as object) || {}),
          approveLevel2: dto.approveLevel2,
          arbitrator: "SUBGERENTE",
        },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId,
        action: "SUBGERENCIA_CONFLICT_RESOLVED_N2",
        entity: "SubgerenciaConflict",
        entityId: updated.id,
        module: FleetModule.GERENCIA,
        userId,
        meta: {
          parties: conflict.parties,
          resolution: dto.resolution,
          level: 2,
        },
      },
    });

    return {
      conflict: updated,
      level: 2,
      message: "Conflicto resuelto — aprobación nivel 2 Subgerencia",
    };
  }
}
