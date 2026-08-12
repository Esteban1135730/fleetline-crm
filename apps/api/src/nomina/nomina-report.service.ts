import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  buildTarifarioRows,
  DEFAULT_OVERTIME_FACTORS,
  hourlyRateFromBase,
} from "../logistica/overtime/overtime-engine";

export type PeriodYm = { year: number; month: number; label: string };

export type DayBreakdown = {
  date: string;
  ordinaryHours: number;
  hedHours: number;
  henHours: number;
  rnHours: number;
  hedfHours: number;
  henfHours: number;
  rodFestHours: number;
  rnfHours: number;
  extrasAmount: number;
  services: Array<{
    tripId: string;
    code: string;
    origin: string;
    destination: string;
    totalAmount: number;
  }>;
  novelties: Array<{ kind: string; notes: string | null }>;
};

export type EmpleadoReporte = {
  empleadoId: string;
  document: string;
  name: string;
  baseSalary: number;
  hourlyRate: number;
  daysWorked: number;
  ordinaryHours: number;
  hedHours: number;
  henHours: number;
  rnHours: number;
  hedfHours: number;
  henfHours: number;
  rodFestHours: number;
  rnfHours: number;
  noveltyCount: number;
  totalExtrasHours: number;
  totalExtrasAmount: number;
  totalPay: number;
  daily: DayBreakdown[];
  novelties: Array<{
    id: string;
    kind: string;
    dateFrom: string;
    dateTo: string;
    notes: string | null;
  }>;
};

export type ReporteGeneral = {
  period: PeriodYm;
  laborConfig: {
    baseSalary: number;
    monthlyHoursDivisor: number;
    factors: Record<string, number>;
  };
  metrics: {
    totalExtrasHours: number;
    totalExtrasAmount: number;
    totalNovelties: number;
    topEmployee: {
      empleadoId: string;
      name: string;
      document: string;
      totalExtrasAmount: number;
    } | null;
    employeeCount: number;
  };
  rows: EmpleadoReporte[];
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function num(v: unknown) {
  return Number(v ?? 0);
}

function parseMes(mes?: string): PeriodYm {
  const now = new Date();
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
    if (mes) throw new BadRequestException("mes debe ser YYYY-MM");
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    return {
      year,
      month,
      label: `${year}-${String(month).padStart(2, "0")}`,
    };
  }
  const [y, m] = mes.split("-").map(Number);
  if (m < 1 || m > 12) throw new BadRequestException("mes inválido");
  return { year: y, month: m, label: mes };
}

function periodBounds(p: PeriodYm) {
  const from = new Date(p.year, p.month - 1, 1);
  const to = new Date(p.year, p.month, 1);
  return { from, to };
}

function dateKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

@Injectable()
export class NominaReportService {
  constructor(private prisma: PrismaService) {}

  parsePeriod(mes?: string) {
    return parseMes(mes);
  }

  async ensureLaborConfig(organizationId: string) {
    return this.prisma.payrollLaborConfig.upsert({
      where: { organizationId },
      create: {
        organizationId,
        baseSalary: DEFAULT_OVERTIME_FACTORS.baseSalary,
        monthlyHoursDivisor: DEFAULT_OVERTIME_FACTORS.monthlyHoursDivisor,
        weeklyOrdinaryHours: DEFAULT_OVERTIME_FACTORS.weeklyOrdinaryHours,
        rnFactor: DEFAULT_OVERTIME_FACTORS.rnFactor,
        hedFactor: DEFAULT_OVERTIME_FACTORS.hedFactor,
        henFactor: DEFAULT_OVERTIME_FACTORS.henFactor,
        rodFestFactor: DEFAULT_OVERTIME_FACTORS.rodFestFactor,
        hedfFactor: DEFAULT_OVERTIME_FACTORS.hedfFactor,
        henfFactor: DEFAULT_OVERTIME_FACTORS.henfFactor,
        rnfFactor: DEFAULT_OVERTIME_FACTORS.rnfFactor,
      },
      update: {},
    });
  }

  /** Resuelve Driver por id de conductor o Employee vinculado. */
  async resolveDriverId(organizationId: string, empleadoId: string) {
    const asDriver = await this.prisma.driver.findFirst({
      where: { id: empleadoId, organizationId },
      include: { employee: true },
    });
    if (asDriver) return asDriver;

    const asEmployee = await this.prisma.employee.findFirst({
      where: { id: empleadoId, organizationId, driverId: { not: null } },
      include: { driver: { include: { employee: true } } },
    });
    if (asEmployee?.driver) {
      return {
        ...asEmployee.driver,
        employee: asEmployee,
      };
    }

    throw new NotFoundException("Empleado/conductor no encontrado");
  }

  private baseForDriver(
    cfgBase: number,
    cfgDivisor: number,
    employee?: { baseSalary: unknown; hourlyRate: unknown } | null,
  ) {
    const baseSalary =
      employee && num(employee.baseSalary) > 0
        ? num(employee.baseSalary)
        : cfgBase;
    const hourlyRate =
      employee && num(employee.hourlyRate) > 0
        ? num(employee.hourlyRate)
        : round2(baseSalary / cfgDivisor);
    return { baseSalary, hourlyRate };
  }

  async reporteEmpleado(
    organizationId: string,
    empleadoId: string,
    mes?: string,
  ): Promise<{ period: PeriodYm; employee: EmpleadoReporte }> {
    const period = parseMes(mes);
    const { from, to } = periodBounds(period);
    const driver = await this.resolveDriverId(organizationId, empleadoId);
    const cfg = await this.ensureLaborConfig(organizationId);
    const pay = this.baseForDriver(
      num(cfg.baseSalary),
      cfg.monthlyHoursDivisor,
      driver.employee,
    );

    const [lines, novelties] = await Promise.all([
      this.prisma.tripOvertimeLine.findMany({
        where: {
          driverId: driver.id,
          workDate: { gte: from, lt: to },
          trip: { organizationId },
        },
        include: {
          trip: {
            select: {
              id: true,
              code: true,
              origin: true,
              destination: true,
            },
          },
        },
        orderBy: { workDate: "asc" },
      }),
      this.prisma.driverNovelty.findMany({
        where: {
          organizationId,
          driverId: driver.id,
          dateFrom: { lt: to },
          dateTo: { gte: from },
        },
        orderBy: { dateFrom: "asc" },
      }),
    ]);

    const byDay = new Map<string, DayBreakdown>();

    for (const line of lines) {
      const key = dateKey(line.workDate);
      let day = byDay.get(key);
      if (!day) {
        day = {
          date: key,
          ordinaryHours: 0,
          hedHours: 0,
          henHours: 0,
          rnHours: 0,
          hedfHours: 0,
          henfHours: 0,
          rodFestHours: 0,
          rnfHours: 0,
          extrasAmount: 0,
          services: [],
          novelties: [],
        };
        byDay.set(key, day);
      }
      day.ordinaryHours = round2(day.ordinaryHours + line.ordinaryHours);
      day.hedHours = round2(day.hedHours + line.hedHours);
      day.henHours = round2(day.henHours + line.henHours);
      day.rnHours = round2(day.rnHours + line.rnHours);
      day.hedfHours = round2(day.hedfHours + line.hedfHours);
      day.henfHours = round2(day.henfHours + line.henfHours);
      day.rodFestHours = round2(day.rodFestHours + line.rodFestHours);
      day.rnfHours = round2(day.rnfHours + line.rnfHours);
      day.extrasAmount = round2(day.extrasAmount + num(line.totalAmount));
      day.services.push({
        tripId: line.trip.id,
        code: line.trip.code,
        origin: line.trip.origin,
        destination: line.trip.destination,
        totalAmount: num(line.totalAmount),
      });
    }

    for (const n of novelties) {
      const cursor = new Date(Math.max(n.dateFrom.getTime(), from.getTime()));
      const end = new Date(Math.min(n.dateTo.getTime(), to.getTime() - 1));
      for (
        let d = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
        d <= end;
        d.setDate(d.getDate() + 1)
      ) {
        const key = dateKey(d);
        let day = byDay.get(key);
        if (!day) {
          day = {
            date: key,
            ordinaryHours: 0,
            hedHours: 0,
            henHours: 0,
            rnHours: 0,
            hedfHours: 0,
            henfHours: 0,
            rodFestHours: 0,
            rnfHours: 0,
            extrasAmount: 0,
            services: [],
            novelties: [],
          };
          byDay.set(key, day);
        }
        day.novelties.push({ kind: n.kind, notes: n.notes });
      }
    }

    const daily = [...byDay.values()].sort((a, b) =>
      a.date.localeCompare(b.date),
    );

    const sum = (pick: (d: DayBreakdown) => number) =>
      round2(daily.reduce((s, d) => s + pick(d), 0));

    const totalExtrasHours = sum(
      (d) =>
        d.hedHours +
        d.henHours +
        d.rnHours +
        d.hedfHours +
        d.henfHours +
        d.rodFestHours +
        d.rnfHours,
    );
    const totalExtrasAmount = sum((d) => d.extrasAmount);
    const daysWorked = daily.filter(
      (d) => d.ordinaryHours > 0 || d.services.length > 0,
    ).length;

    const employee: EmpleadoReporte = {
      empleadoId: driver.id,
      document: driver.document,
      name: driver.name,
      baseSalary: pay.baseSalary,
      hourlyRate: pay.hourlyRate,
      daysWorked,
      ordinaryHours: sum((d) => d.ordinaryHours),
      hedHours: sum((d) => d.hedHours),
      henHours: sum((d) => d.henHours),
      rnHours: sum((d) => d.rnHours),
      hedfHours: sum((d) => d.hedfHours),
      henfHours: sum((d) => d.henfHours),
      rodFestHours: sum((d) => d.rodFestHours),
      rnfHours: sum((d) => d.rnfHours),
      noveltyCount: novelties.length,
      totalExtrasHours,
      totalExtrasAmount,
      totalPay: round2(pay.baseSalary + totalExtrasAmount),
      daily,
      novelties: novelties.map((n) => ({
        id: n.id,
        kind: n.kind,
        dateFrom: n.dateFrom.toISOString(),
        dateTo: n.dateTo.toISOString(),
        notes: n.notes,
      })),
    };

    return { period, employee };
  }

  async reporteGeneral(
    organizationId: string,
    mes?: string,
  ): Promise<ReporteGeneral> {
    const period = parseMes(mes);
    const drivers = await this.prisma.driver.findMany({
      where: { organizationId, active: true },
      include: { employee: true },
      orderBy: { name: "asc" },
    });
    const cfg = await this.ensureLaborConfig(organizationId);

    const rows: EmpleadoReporte[] = [];
    for (const d of drivers) {
      const { employee } = await this.reporteEmpleado(
        organizationId,
        d.id,
        period.label,
      );
      rows.push(employee);
    }

    const totalExtrasHours = round2(
      rows.reduce((s, r) => s + r.totalExtrasHours, 0),
    );
    const totalExtrasAmount = round2(
      rows.reduce((s, r) => s + r.totalExtrasAmount, 0),
    );
    const totalNovelties = rows.reduce((s, r) => s + r.noveltyCount, 0);
    const top = [...rows].sort(
      (a, b) => b.totalExtrasAmount - a.totalExtrasAmount,
    )[0];

    return {
      period,
      laborConfig: {
        baseSalary: num(cfg.baseSalary),
        monthlyHoursDivisor: cfg.monthlyHoursDivisor,
        factors: {
          rn: cfg.rnFactor,
          hed: cfg.hedFactor,
          hen: cfg.henFactor,
          rodFest: cfg.rodFestFactor,
          hedf: cfg.hedfFactor,
          henf: cfg.henfFactor,
          rnf: cfg.rnfFactor,
        },
      },
      metrics: {
        totalExtrasHours,
        totalExtrasAmount,
        totalNovelties,
        topEmployee: top
          ? {
              empleadoId: top.empleadoId,
              name: top.name,
              document: top.document,
              totalExtrasAmount: top.totalExtrasAmount,
            }
          : null,
        employeeCount: rows.length,
      },
      rows,
    };
  }

  /** Tarifario org + bases por conductor/empleado + tabla de valores */
  async getTarifario(organizationId: string) {
    const cfg = await this.ensureLaborConfig(organizationId);
    const baseSalary = num(cfg.baseSalary);
    const divisor = cfg.monthlyHoursDivisor || 230;
    const hourlyRate = round2(hourlyRateFromBase(baseSalary, divisor));
    const factors = {
      rnFactor: cfg.rnFactor,
      hedFactor: cfg.hedFactor,
      henFactor: cfg.henFactor,
      rodFestFactor: cfg.rodFestFactor,
      hedfFactor: cfg.hedfFactor,
      henfFactor: cfg.henfFactor,
      rnfFactor: cfg.rnfFactor,
    };
    const conceptos = buildTarifarioRows(hourlyRate, factors);

    const drivers = await this.prisma.driver.findMany({
      where: { organizationId, active: true },
      include: { employee: true },
      orderBy: { name: "asc" },
    });

    const empleados = drivers.map((d) => {
      const pay = this.baseForDriver(baseSalary, divisor, d.employee);
      return {
        driverId: d.id,
        employeeId: d.employee?.id ?? null,
        name: d.name,
        document: d.document,
        baseSalary: pay.baseSalary,
        hourlyRate: pay.hourlyRate,
        usesOrgDefault: !(d.employee && num(d.employee.baseSalary) > 0),
        conceptos: buildTarifarioRows(pay.hourlyRate, factors),
      };
    });

    return {
      config: {
        baseSalary,
        monthlyHoursDivisor: divisor,
        weeklyOrdinaryHours: cfg.weeklyOrdinaryHours,
        ...factors,
        hourlyRate,
      },
      conceptos,
      empleados,
    };
  }

  async updateLaborConfig(
    organizationId: string,
    input: {
      baseSalary?: number;
      monthlyHoursDivisor?: number;
      weeklyOrdinaryHours?: number;
      rnFactor?: number;
      hedFactor?: number;
      henFactor?: number;
      rodFestFactor?: number;
      hedfFactor?: number;
      henfFactor?: number;
      rnfFactor?: number;
    },
  ) {
    await this.ensureLaborConfig(organizationId);
    const data: Record<string, number> = {};
    if (input.baseSalary != null) data.baseSalary = input.baseSalary;
    if (input.monthlyHoursDivisor != null) {
      data.monthlyHoursDivisor = input.monthlyHoursDivisor;
    }
    if (input.weeklyOrdinaryHours != null) {
      data.weeklyOrdinaryHours = input.weeklyOrdinaryHours;
    }
    for (const k of [
      "rnFactor",
      "hedFactor",
      "henFactor",
      "rodFestFactor",
      "hedfFactor",
      "henfFactor",
      "rnfFactor",
    ] as const) {
      if (input[k] != null) data[k] = input[k]!;
    }
    await this.prisma.payrollLaborConfig.update({
      where: { organizationId },
      data,
    });
    return this.getTarifario(organizationId);
  }

  /**
   * Define base salarial / tarifa hora del conductor.
   * Crea Employee vinculado si aún no existe.
   */
  async updateEmpleadoBase(
    organizationId: string,
    driverId: string,
    input: { baseSalary?: number; hourlyRate?: number },
  ) {
    const driver = await this.prisma.driver.findFirst({
      where: { id: driverId, organizationId },
      include: { employee: true },
    });
    if (!driver) throw new NotFoundException("Conductor no encontrado");

    const cfg = await this.ensureLaborConfig(organizationId);
    const baseSalary =
      input.baseSalary != null && input.baseSalary > 0
        ? input.baseSalary
        : driver.employee && num(driver.employee.baseSalary) > 0
          ? num(driver.employee.baseSalary)
          : num(cfg.baseSalary);
    const hourlyRate =
      input.hourlyRate != null && input.hourlyRate > 0
        ? input.hourlyRate
        : round2(baseSalary / (cfg.monthlyHoursDivisor || 230));

    if (driver.employee) {
      await this.prisma.employee.update({
        where: { id: driver.employee.id },
        data: { baseSalary, hourlyRate },
      });
    } else {
      await this.prisma.employee.create({
        data: {
          organizationId,
          name: driver.name,
          document: driver.document,
          title: "Conductor",
          area: "Logística",
          status: "ACTIVE",
          baseSalary,
          hourlyRate,
          driverId: driver.id,
        },
      });
    }

    return this.getTarifario(organizationId);
  }
}
