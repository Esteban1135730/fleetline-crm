import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { EmployeeStatus } from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";
import { FatigueManagementService } from "./fatigue-management.service";
import type { UpsertEmployeeDto } from "./dto/rrhh.dto";

@Injectable()
export class RrhhService {
  constructor(
    private prisma: PrismaService,
    private fatigue: FatigueManagementService,
  ) {}

  listEmployees(organizationId: string) {
    return this.prisma.employee.findMany({
      where: { organizationId },
      include: {
        driver: {
          select: {
            id: true,
            name: true,
            dispatchBlocked: true,
            blockReason: true,
            fatigueScore: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });
  }

  async upsertEmployee(organizationId: string, dto: UpsertEmployeeDto) {
    if (dto.driverId) {
      const driver = await this.prisma.driver.findFirst({
        where: { id: dto.driverId, organizationId },
      });
      if (!driver) throw new NotFoundException("Conductor no encontrado");
    }

    const data = {
      name: dto.name,
      document: dto.document,
      title: dto.title,
      area: dto.area,
      status: (dto.status as EmployeeStatus) || EmployeeStatus.ACTIVE,
      baseSalary: dto.baseSalary ?? 0,
      hourlyRate: dto.hourlyRate ?? 0,
      email: dto.email ?? null,
      phone: dto.phone ?? null,
      driverId: dto.driverId ?? null,
    };

    if (dto.id) {
      const existing = await this.prisma.employee.findFirst({
        where: { id: dto.id, organizationId },
      });
      if (!existing) throw new NotFoundException("Expediente no encontrado");
      return this.prisma.employee.update({
        where: { id: dto.id },
        data,
        include: { driver: true },
      });
    }

    try {
      return await this.prisma.employee.create({
        data: { ...data, organizationId },
        include: { driver: true },
      });
    } catch {
      throw new BadRequestException({
        error: "EMPLOYEE_DOCUMENT_CONFLICT",
        message: "Ya existe un expediente con ese documento",
      });
    }
  }

  fatigueStatus(organizationId: string, driverId: string) {
    return this.fatigue.fatigueStatus(organizationId, driverId);
  }
}
