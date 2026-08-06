import { BadRequestException, Injectable } from "@nestjs/common";
import {
  EmployeeStatus,
  PayrollRunStatus,
  ShiftStatus,
  TripStatus,
} from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";
import { KafkaEventsService } from "../logistics/kafka-events.service";
import { calculatePayrollLine } from "./payroll.calc";
import type { PayrollCalculateDto } from "./dto/rrhh.dto";

@Injectable()
export class PayrollService {
  constructor(
    private prisma: PrismaService,
    private kafka: KafkaEventsService,
  ) {}

  async calculate(organizationId: string, dto: PayrollCalculateDto) {
    if (dto.periodEnd.getTime() < dto.periodStart.getTime()) {
      throw new BadRequestException("periodEnd anterior a periodStart");
    }

    const employees = await this.prisma.employee.findMany({
      where: {
        organizationId,
        status: EmployeeStatus.ACTIVE,
        ...(dto.employeeIds?.length
          ? { id: { in: dto.employeeIds } }
          : {}),
      },
      include: { driver: { select: { id: true } } },
    });

    if (!employees.length) {
      throw new BadRequestException("No hay empleados ACTIVE para liquidar");
    }

    const linesData = [];

    for (const emp of employees) {
      const driverId = emp.driverId;
      let shifts: Array<{ checkInAt: Date; checkOutAt: Date }> = [];
      let completedTrips = 0;

      if (driverId) {
        const closedShifts = await this.prisma.driverShift.findMany({
          where: {
            organizationId,
            driverId,
            status: ShiftStatus.CLOSED,
            checkInAt: { gte: dto.periodStart },
            checkOutAt: { lte: dto.periodEnd, not: null },
          },
        });
        shifts = closedShifts
          .filter((s) => s.checkOutAt)
          .map((s) => ({
            checkInAt: s.checkInAt,
            checkOutAt: s.checkOutAt as Date,
          }));

        completedTrips = await this.prisma.trip.count({
          where: {
            organizationId,
            driverId,
            status: TripStatus.COMPLETED,
            departAt: { gte: dto.periodStart, lte: dto.periodEnd },
          },
        });
      }

      const breakdown = calculatePayrollLine({
        employeeId: emp.id,
        driverId,
        baseSalary: Number(emp.baseSalary),
        hourlyRate: Number(emp.hourlyRate),
        shifts,
        completedTrips,
        commissionPerTrip: dto.commissionPerTrip,
        overtimeMultiplier: dto.overtimeMultiplier,
        nightMultiplier: dto.nightMultiplier,
        ordinaryDayHours: dto.ordinaryDayHours,
      });

      // Pre-nómina Logística: acumula TripOvertimeLine (motor CSV horas extras)
      if (driverId) {
        const otAgg = await this.prisma.tripOvertimeLine.aggregate({
          where: {
            driverId,
            workDate: { gte: dto.periodStart, lte: dto.periodEnd },
            trip: { organizationId },
          },
          _sum: {
            totalAmount: true,
            hedHours: true,
            henHours: true,
            hedfHours: true,
            henfHours: true,
            rnHours: true,
            rnfHours: true,
            rnAmount: true,
            rnfAmount: true,
            ordinaryHours: true,
          },
        });
        const logisticsOt = Number(otAgg._sum.totalAmount ?? 0);
        const logisticsNight =
          Number(otAgg._sum.rnAmount ?? 0) + Number(otAgg._sum.rnfAmount ?? 0);
        const logisticsOtHours =
          Number(otAgg._sum.hedHours ?? 0) +
          Number(otAgg._sum.henHours ?? 0) +
          Number(otAgg._sum.hedfHours ?? 0) +
          Number(otAgg._sum.henfHours ?? 0);
        if (logisticsOt > 0) {
          breakdown.overtimeAmount = Math.round(
            (breakdown.overtimeAmount + logisticsOt) * 100,
          ) / 100;
          breakdown.overtimeHours = Math.round(
            (breakdown.overtimeHours + logisticsOtHours) * 100,
          ) / 100;
          breakdown.nightHours = Math.round(
            (breakdown.nightHours +
              Number(otAgg._sum.rnHours ?? 0) +
              Number(otAgg._sum.rnfHours ?? 0)) *
              100,
          ) / 100;
          breakdown.nightAmount = Math.round(
            (breakdown.nightAmount + logisticsNight) * 100,
          ) / 100;
          breakdown.grossTotal = Math.round(
            (Number(emp.baseSalary) +
              breakdown.overtimeAmount +
              breakdown.nightAmount +
              breakdown.tripCommissions) *
              100,
          ) / 100;
        }
      }

      linesData.push(breakdown);
    }

    const totalGross = linesData.reduce((s, l) => s + l.grossTotal, 0);
    const totalOvertime = linesData.reduce((s, l) => s + l.overtimeAmount, 0);
    const totalNight = linesData.reduce((s, l) => s + l.nightAmount, 0);
    const totalCommissions = linesData.reduce(
      (s, l) => s + l.tripCommissions,
      0,
    );

    const run = await this.prisma.payrollRun.create({
      data: {
        organizationId,
        periodStart: dto.periodStart,
        periodEnd: dto.periodEnd,
        status: PayrollRunStatus.CALCULATED,
        totalGross,
        totalOvertime,
        totalNight,
        totalCommissions,
        totalNet: totalGross,
        calculatedAt: new Date(),
        meta: {
          commissionPerTrip: dto.commissionPerTrip,
          overtimeMultiplier: dto.overtimeMultiplier,
          nightMultiplier: dto.nightMultiplier,
        },
        lines: {
          create: linesData.map((l) => ({
            employeeId: l.employeeId,
            driverId: l.driverId,
            baseSalary: l.baseSalary,
            ordinaryHours: l.ordinaryHours,
            overtimeHours: l.overtimeHours,
            overtimeAmount: l.overtimeAmount,
            nightHours: l.nightHours,
            nightAmount: l.nightAmount,
            completedTrips: l.completedTrips,
            tripCommissions: l.tripCommissions,
            grossTotal: l.grossTotal,
          })),
        },
      },
      include: {
        lines: {
          include: {
            employee: { select: { id: true, name: true, document: true } },
          },
        },
      },
    });

    await this.kafka.emitPayrollCalculated({
      organizationId,
      payrollRunId: run.id,
      amount: totalGross,
      totalOvertime,
      totalNight,
      totalCommissions,
      periodStart: dto.periodStart.toISOString(),
      periodEnd: dto.periodEnd.toISOString(),
    });

    return {
      payrollRun: run,
      breakdown: {
        totalGross,
        totalOvertime,
        totalNight,
        totalCommissions,
        lines: linesData,
      },
    };
  }
}
