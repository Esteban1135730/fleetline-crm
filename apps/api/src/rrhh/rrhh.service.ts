import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { EmployeeStatus, Role, UserAccountStatus } from "@fsg/db";
import {
  HARD_RULES,
  hrDocumentChecklistForCargo,
  hrDocProfileLabel,
  normalizeRole,
  resolveRrhhExcelColumns,
  roleForEmployeeCargo,
  roleRank,
  RRHH_EXCEL_COLUMN_BY_KEY,
  RRHH_EXCEL_IMPORT_KEYS,
  RRHH_EXCEL_LABEL_TO_KEY,
  type RrhhExcelColumnDef,
  type RrhhExcelColumnKey,
} from "@fsg/shared";
import { randomBytes } from "crypto";
import ExcelJS from "exceljs";
import { PrismaService } from "../prisma/prisma.service";
import { UsersService } from "../users/users.service";
import { FatigueManagementService } from "./fatigue-management.service";
import {
  isFleetDriverRole,
  LogisticsService,
} from "../logistics/logistics.service";
import { DataRoomService } from "../archivo/data-room.service";
import type { UploadArchiveDto } from "../archivo/dto/archivo.dto";
import type {
  CreateTrainingDto,
  PatchEmployeeDto,
  ProvisionEmployeeDto,
  TerminateEmployeeDto,
  UpsertEmployeeDto,
} from "./dto/rrhh.dto";

const LICENSE_ALERT_DAYS = 30;

const driverSelect = {
  id: true,
  name: true,
  document: true,
  licenseNumber: true,
  licenseCategory: true,
  licenseExpiresAt: true,
  fatigueScore: true,
  dispatchBlocked: true,
  blockReason: true,
  active: true,
  userId: true,
} as const;

const userSelect = {
  id: true,
  email: true,
  role: true,
  active: true,
  status: true,
} as const;

function generateTempPassword(length = 12): string {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$";
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

function hrDataFromDto(
  dto: Partial<
    ProvisionEmployeeDto &
      PatchEmployeeDto & {
        name?: string;
        document?: string;
        title?: string;
        area?: string;
        email?: string | null;
        phone?: string | null;
        baseSalary?: number;
        hourlyRate?: number;
        driverId?: string | null;
      }
  >,
) {
  return {
    ...(dto.name !== undefined ? { name: dto.name } : {}),
    ...(dto.document !== undefined ? { document: dto.document } : {}),
    ...(dto.title !== undefined ? { title: dto.title } : {}),
    ...(dto.area !== undefined ? { area: dto.area } : {}),
    ...(dto.email !== undefined ? { email: dto.email } : {}),
    ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
    ...(dto.baseSalary !== undefined ? { baseSalary: dto.baseSalary } : {}),
    ...(dto.hourlyRate !== undefined ? { hourlyRate: dto.hourlyRate } : {}),
    ...(dto.driverId !== undefined ? { driverId: dto.driverId } : {}),
    ...(dto.address !== undefined ? { address: dto.address } : {}),
    ...(dto.city !== undefined ? { city: dto.city } : {}),
    ...(dto.contractType !== undefined ? { contractType: dto.contractType } : {}),
    ...(dto.hireDate !== undefined ? { hireDate: dto.hireDate } : {}),
    ...(dto.eps !== undefined ? { eps: dto.eps } : {}),
    ...(dto.arl !== undefined ? { arl: dto.arl } : {}),
    ...(dto.pensionFund !== undefined ? { pensionFund: dto.pensionFund } : {}),
    ...(dto.compensationFund !== undefined
      ? { compensationFund: dto.compensationFund }
      : {}),
    ...(dto.bankName !== undefined ? { bankName: dto.bankName } : {}),
    ...(dto.bankAccountType !== undefined
      ? { bankAccountType: dto.bankAccountType }
      : {}),
    ...(dto.bankAccountNumber !== undefined
      ? { bankAccountNumber: dto.bankAccountNumber }
      : {}),
    ...(dto.emergencyContactName !== undefined
      ? { emergencyContactName: dto.emergencyContactName }
      : {}),
    ...(dto.emergencyContactPhone !== undefined
      ? { emergencyContactPhone: dto.emergencyContactPhone }
      : {}),
    ...(dto.emergencyContactRelation !== undefined
      ? { emergencyContactRelation: dto.emergencyContactRelation }
      : {}),
  };
}

function mapEmployeeRow<
  T extends {
    title: string;
    fatigueScore: number;
    driver?: {
      fatigueScore: number;
      licenseExpiresAt: Date | null;
      dispatchBlocked: boolean;
      blockReason: string | null;
    } | null;
  },
>(emp: T) {
  const driver = emp.driver ?? null;
  const fatigueScore = driver?.fatigueScore ?? emp.fatigueScore;
  const licenseExpiresAt = driver?.licenseExpiresAt ?? null;
  return {
    ...emp,
    position: emp.title,
    fatigueScore,
    licenseSemaphore: licenseSemaphore(licenseExpiresAt, !!driver),
    fatigueSemaphore: fatigueSemaphore(fatigueScore),
    dispatchBlocked: driver?.dispatchBlocked ?? false,
    blockReason: driver?.blockReason ?? null,
  };
}

function licenseSemaphore(
  expiresAt: Date | null,
  isDriver: boolean,
): "GREEN" | "AMBER" | "RED" | "N_A" {
  if (!isDriver) return "N_A";
  if (!expiresAt) return "RED";
  const ms = expiresAt.getTime() - Date.now();
  const days = ms / (1000 * 60 * 60 * 24);
  if (days <= 0) return "RED";
  if (days <= LICENSE_ALERT_DAYS) return "AMBER";
  return "GREEN";
}

function fatigueSemaphore(score: number): "GREEN" | "AMBER" | "RED" {
  if (score >= HARD_RULES.FATIGUE_BLOCK_SCORE) return "RED";
  if (score >= 31) return "AMBER";
  return "GREEN";
}

function canManageTenantIdentity(role?: string) {
  const raw = String(role || "").toLowerCase();
  const r = normalizeRole(String(role || ""));
  return (
    r === "platform_master" ||
    r === "org_admin" ||
    r === "vinculaciones" ||
    raw === "rrhh"
  );
}

function actorCanActivateRole(actorRole: string, targetRole: Role): boolean {
  const actor = normalizeRole(actorRole);
  if (actor === "platform_master" || actor === "org_admin") return true;
  return roleRank(actor) > roleRank(targetRole);
}

@Injectable()
export class RrhhService {
  constructor(
    private prisma: PrismaService,
    private fatigue: FatigueManagementService,
    private logistics: LogisticsService,
    private dataRoom: DataRoomService,
  ) {}

  async listEmployees(organizationId: string) {
    const rows = await this.prisma.employee.findMany({
      where: { organizationId },
      include: {
        driver: { select: driverSelect },
        user: { select: userSelect },
      },
      orderBy: { name: "asc" },
    });
    return rows.map((row) => ({
      ...mapEmployeeRow(row),
      user: row.user
        ? {
            ...row.user,
            role: normalizeRole(row.user.role),
            status: row.user.status.toLowerCase(),
          }
        : null,
    }));
  }

  async exportEmployeesExcel(
    organizationId: string,
    columnKeys?: string[] | null,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const cols = resolveRrhhExcelColumns(columnKeys);
    const rows = await this.listEmployees(organizationId);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "INRETRANS OS";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Personal RRHH");
    this.applyRrhhExcelColumns(sheet, cols);

    const fmtDate = (d?: Date | string | null) => {
      if (!d) return "";
      const dt = d instanceof Date ? d : new Date(d);
      if (Number.isNaN(dt.getTime())) return "";
      return dt.toISOString().slice(0, 10);
    };
    const num = (v: unknown) => {
      if (v == null || v === "") return 0;
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };

    for (const row of rows) {
      const driver = row.driver as
        | {
            licenseNumber?: string | null;
            licenseCategory?: string | null;
            licenseExpiresAt?: Date | string | null;
          }
        | null
        | undefined;
      const payload: Record<string, string | number> = {
        document: row.document,
        name: row.name,
        area: row.area,
        title: row.title,
        status: row.status,
        email: row.email ?? "",
        phone: row.phone ?? "",
        city: row.city ?? "",
        address: row.address ?? "",
        contractType: row.contractType ?? "",
        hireDate: fmtDate(row.hireDate),
        baseSalary: num(row.baseSalary),
        hourlyRate: num(row.hourlyRate),
        eps: row.eps ?? "",
        arl: row.arl ?? "",
        pensionFund: row.pensionFund ?? "",
        compensationFund: row.compensationFund ?? "",
        bankName: row.bankName ?? "",
        bankAccountType: row.bankAccountType ?? "",
        bankAccountNumber: row.bankAccountNumber ?? "",
        emergencyContactName: row.emergencyContactName ?? "",
        emergencyContactPhone: row.emergencyContactPhone ?? "",
        emergencyContactRelation: row.emergencyContactRelation ?? "",
        userEmail: row.user?.email ?? "",
        userRole: row.user?.role ?? "",
        userActive: row.user
          ? row.user.active
            ? "Sí"
            : "No"
          : "Sin usuario",
        fatigueScore: row.fatigueScore,
        fatigueSemaphore: row.fatigueSemaphore,
        licenseSemaphore: row.licenseSemaphore,
        licenseNumber: driver?.licenseNumber ?? "",
        licenseCategory: driver?.licenseCategory ?? "",
        licenseExpiresAt: fmtDate(driver?.licenseExpiresAt),
        dispatchBlocked: row.dispatchBlocked ? "Sí" : "No",
        blockReason: row.blockReason ?? "",
        terminatedAt: fmtDate(
          (row as { terminatedAt?: Date | string | null }).terminatedAt,
        ),
        terminationReason:
          (row as { terminationReason?: string | null }).terminationReason ??
          "",
      };
      const filtered: Record<string, string | number> = {};
      for (const col of cols) {
        filtered[col.key] = payload[col.key] ?? "";
      }
      sheet.addRow(filtered);
    }

    this.finalizeRrhhExcelSheet(sheet, cols);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const stamp = new Date().toISOString().slice(0, 10);
    return {
      buffer,
      filename: `rrhh-personal-${stamp}.xlsx`,
    };
  }

  async buildEmployeesExcelTemplate(
    columnKeys?: string[] | null,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const keys =
      columnKeys?.length
        ? columnKeys
        : [...RRHH_EXCEL_IMPORT_KEYS];
    const cols = resolveRrhhExcelColumns(keys).filter((c) => c.importable);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "INRETRANS OS";
    workbook.created = new Date();
    const sheet = workbook.addWorksheet("Plantilla importación");
    this.applyRrhhExcelColumns(sheet, cols);
    sheet.addRow(
      Object.fromEntries(
        cols.map((c) => [
          c.key,
          c.requiredOnImport ? `(obligatorio)` : "",
        ]),
      ),
    );
    this.finalizeRrhhExcelSheet(sheet, cols);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    return {
      buffer,
      filename: `rrhh-plantilla-importacion.xlsx`,
    };
  }

  async importEmployeesExcel(
    organizationId: string,
    actor: { userId: string; role: string },
    fileBuffer: Buffer,
  ): Promise<{
    created: number;
    updated: number;
    skipped: number;
    errors: Array<{ row: number; message: string }>;
  }> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Uint8Array.from(fileBuffer));
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      throw new BadRequestException("El archivo no contiene hojas");
    }

    const headerRow = sheet.getRow(1);
    const colMap = new Map<number, RrhhExcelColumnKey>();
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const label = String(cell.text ?? cell.value ?? "")
        .trim()
        .toLowerCase();
      const key =
        RRHH_EXCEL_LABEL_TO_KEY[label] ||
        (RRHH_EXCEL_COLUMN_BY_KEY[label as RrhhExcelColumnKey]
          ? (label as RrhhExcelColumnKey)
          : undefined);
      if (key) colMap.set(colNumber, key);
    });

    if (![...colMap.values()].includes("document")) {
      throw new BadRequestException(
        'La plantilla debe incluir la columna "Documento"',
      );
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: Array<{ row: number; message: string }> = [];

    const lastRow = sheet.rowCount;
    for (let r = 2; r <= lastRow; r++) {
      const excelRow = sheet.getRow(r);
      const raw: Partial<Record<RrhhExcelColumnKey, string>> = {};
      let hasAny = false;
      for (const [colNumber, key] of colMap.entries()) {
        const cell = excelRow.getCell(colNumber);
        let text = "";
        if (cell.value instanceof Date) {
          text = cell.value.toISOString().slice(0, 10);
        } else if (
          cell.value &&
          typeof cell.value === "object" &&
          "text" in (cell.value as object)
        ) {
          text = String((cell.value as { text?: string }).text ?? "").trim();
        } else if (cell.value != null) {
          text = String(cell.text || cell.value).trim();
        }
        if (text && text !== "(obligatorio)") {
          raw[key] = text;
          hasAny = true;
        }
      }
      if (!hasAny) {
        skipped += 1;
        continue;
      }

      const document = (raw.document || "").replace(/\D/g, "") || raw.document?.trim();
      if (!document) {
        errors.push({ row: r, message: "Documento vacío" });
        continue;
      }

      try {
        const existing = await this.prisma.employee.findFirst({
          where: { organizationId, document },
          select: { id: true },
        });

        const title = (raw.title || "").trim();
        const area = (raw.area || "").trim();
        const name = (raw.name || "").trim();
        const email = (raw.email || "").trim().toLowerCase();

        const hireDate = raw.hireDate ? new Date(raw.hireDate) : undefined;
        const baseSalary = raw.baseSalary
          ? Number(String(raw.baseSalary).replace(/[^\d.-]/g, ""))
          : undefined;
        const hourlyRate = raw.hourlyRate
          ? Number(String(raw.hourlyRate).replace(/[^\d.-]/g, ""))
          : undefined;

        const contractOk = [
          "INDEFINIDO",
          "TERMINO_FIJO",
          "OBRA_LABOR",
          "APRENDIZAJE",
          "PRESTACION_SERVICIOS",
        ] as const;
        const bankOk = ["AHORROS", "CORRIENTE"] as const;
        const statusOk = ["ACTIVE", "VACATION", "MEDICAL", "INACTIVE"] as const;
        const contractType = contractOk.find(
          (v) => v === (raw.contractType || "").toUpperCase(),
        );
        const bankAccountType = bankOk.find(
          (v) => v === (raw.bankAccountType || "").toUpperCase(),
        );
        const status = statusOk.find(
          (v) => v === (raw.status || "").toUpperCase(),
        );

        const hrPatch = {
          ...(raw.phone ? { phone: raw.phone } : {}),
          ...(raw.city ? { city: raw.city } : {}),
          ...(raw.address ? { address: raw.address } : {}),
          ...(contractType ? { contractType } : {}),
          ...(hireDate && !Number.isNaN(hireDate.getTime())
            ? { hireDate }
            : {}),
          ...(baseSalary !== undefined && Number.isFinite(baseSalary)
            ? { baseSalary }
            : {}),
          ...(hourlyRate !== undefined && Number.isFinite(hourlyRate)
            ? { hourlyRate }
            : {}),
          ...(raw.eps ? { eps: raw.eps } : {}),
          ...(raw.arl ? { arl: raw.arl } : {}),
          ...(raw.pensionFund ? { pensionFund: raw.pensionFund } : {}),
          ...(raw.compensationFund
            ? { compensationFund: raw.compensationFund }
            : {}),
          ...(raw.bankName ? { bankName: raw.bankName } : {}),
          ...(bankAccountType ? { bankAccountType } : {}),
          ...(raw.bankAccountNumber
            ? { bankAccountNumber: raw.bankAccountNumber }
            : {}),
          ...(raw.emergencyContactName
            ? { emergencyContactName: raw.emergencyContactName }
            : {}),
          ...(raw.emergencyContactPhone
            ? { emergencyContactPhone: raw.emergencyContactPhone }
            : {}),
          ...(raw.emergencyContactRelation
            ? { emergencyContactRelation: raw.emergencyContactRelation }
            : {}),
          ...(status ? { status } : {}),
        };

        if (existing) {
          await this.patchEmployee(
            organizationId,
            existing.id,
            {
              ...(name ? { name } : {}),
              ...(title ? { title } : {}),
              ...(area ? { area } : {}),
              ...(email ? { email } : {}),
              ...hrPatch,
            },
            actor.role,
          );
          updated += 1;
        } else {
          if (!name || !title || !area || !email) {
            errors.push({
              row: r,
              message:
                "Alta nueva requiere Nombre, Área, Cargo y Correo laboral",
            });
            continue;
          }
          const role = roleForEmployeeCargo(title);
          await this.provisionEmployee(organizationId, actor, {
            name,
            document,
            email,
            title,
            area,
            role,
            phone: raw.phone,
            baseSalary:
              baseSalary !== undefined && Number.isFinite(baseSalary)
                ? baseSalary
                : undefined,
            hourlyRate:
              hourlyRate !== undefined && Number.isFinite(hourlyRate)
                ? hourlyRate
                : undefined,
            address: raw.address ?? null,
            city: raw.city ?? null,
            contractType: contractType ?? null,
            hireDate:
              hireDate && !Number.isNaN(hireDate.getTime()) ? hireDate : null,
            eps: raw.eps ?? null,
            arl: raw.arl ?? null,
            pensionFund: raw.pensionFund ?? null,
            compensationFund: raw.compensationFund ?? null,
            bankName: raw.bankName ?? null,
            bankAccountType: bankAccountType ?? null,
            bankAccountNumber: raw.bankAccountNumber ?? null,
            emergencyContactName: raw.emergencyContactName ?? null,
            emergencyContactPhone: raw.emergencyContactPhone ?? null,
            emergencyContactRelation: raw.emergencyContactRelation ?? null,
          });
          created += 1;
        }
      } catch (e) {
        errors.push({
          row: r,
          message: e instanceof Error ? e.message : "Fila no procesada",
        });
      }
    }

    return { created, updated, skipped, errors };
  }

  private applyRrhhExcelColumns(
    sheet: ExcelJS.Worksheet,
    cols: RrhhExcelColumnDef[],
  ) {
    sheet.columns = cols.map((c) => ({
      header: c.label,
      key: c.key,
      width: c.width,
    }));
    const header = sheet.getRow(1);
    header.font = { bold: true, color: { argb: "FFF8FAFC" } };
    header.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0D9488" },
    };
    header.alignment = { vertical: "middle" };
  }

  private finalizeRrhhExcelSheet(
    sheet: ExcelJS.Worksheet,
    cols: RrhhExcelColumnDef[],
  ) {
    if (cols.some((c) => c.key === "baseSalary")) {
      try {
        sheet.getColumn("baseSalary").numFmt = "#,##0";
      } catch {
        /* ignore */
      }
    }
    if (cols.some((c) => c.key === "hourlyRate")) {
      try {
        sheet.getColumn("hourlyRate").numFmt = "#,##0";
      } catch {
        /* ignore */
      }
    }
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: cols.length },
    };
  }

  async provisionEmployee(
    organizationId: string,
    actor: { userId: string; role: string },
    dto: ProvisionEmployeeDto,
  ) {
    if (dto.driverId) {
      const driver = await this.prisma.driver.findFirst({
        where: { id: dto.driverId, organizationId },
      });
      if (!driver) throw new NotFoundException("Conductor no encontrado");
    }

    const email = dto.email.toLowerCase().trim();
    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new BadRequestException("El correo ya está registrado como usuario");
    }

    const existingDoc = await this.prisma.employee.findFirst({
      where: { organizationId, document: dto.document.trim() },
    });
    if (existingDoc) {
      throw new BadRequestException({
        error: "EMPLOYEE_DOCUMENT_CONFLICT",
        message: "Ya existe un expediente con ese documento",
      });
    }

    const targetRole = UsersService.resolveRole(dto.role);
    if (targetRole === Role.PLATFORM_MASTER) {
      throw new ForbiddenException("No se puede provisionar PLATFORM_MASTER");
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await UsersService.hashPassword(tempPassword);
    const canActivate = actorCanActivateRole(actor.role, targetRole);
    const status = canActivate
      ? UserAccountStatus.ACTIVE
      : UserAccountStatus.PENDING;

    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: dto.name,
          email,
          passwordHash,
          role: targetRole,
          active: true,
          status,
          organizationId,
          ...(canActivate
            ? { approvedById: actor.userId, approvedAt: new Date() }
            : {}),
        },
        select: userSelect,
      });

      const employee = await tx.employee.create({
        data: {
          organizationId,
          userId: user.id,
          name: dto.name,
          document: dto.document.trim(),
          title: dto.title,
          area: dto.area,
          status: EmployeeStatus.ACTIVE,
          baseSalary: dto.baseSalary ?? 0,
          hourlyRate: dto.hourlyRate ?? 0,
          email,
          phone: dto.phone ?? null,
          driverId: dto.driverId ?? null,
          address: dto.address ?? null,
          city: dto.city ?? null,
          contractType: dto.contractType ?? null,
          hireDate: dto.hireDate ?? null,
          eps: dto.eps ?? null,
          arl: dto.arl ?? null,
          pensionFund: dto.pensionFund ?? null,
          compensationFund: dto.compensationFund ?? null,
          bankName: dto.bankName ?? null,
          bankAccountType: dto.bankAccountType ?? null,
          bankAccountNumber: dto.bankAccountNumber ?? null,
          emergencyContactName: dto.emergencyContactName ?? null,
          emergencyContactPhone: dto.emergencyContactPhone ?? null,
          emergencyContactRelation: dto.emergencyContactRelation ?? null,
        },
        include: {
          driver: { select: driverSelect },
          user: { select: userSelect },
        },
      });

      return { user, employee };
    });

    await this.logistics.ensureDriverForEmployee(organizationId, created.employee);

    const linked = await this.prisma.employee.findFirst({
      where: { id: created.employee.id },
      include: {
        driver: { select: driverSelect },
        user: { select: userSelect },
      },
    });

    if (linked?.driverId && linked.userId) {
      await this.prisma.driver.update({
        where: { id: linked.driverId },
        data: { userId: linked.userId },
      });
    }

    if (
      isFleetDriverRole(linked?.title ?? dto.title, linked?.area ?? dto.area) &&
      normalizeRole(dto.role) === "monitora" &&
      linked?.userId
    ) {
      const existingMonitor = await this.prisma.monitorProfile.findUnique({
        where: { userId: linked.userId },
      });
      if (!existingMonitor) {
        await this.prisma.monitorProfile.create({
          data: {
            userId: linked.userId,
            organizationId,
          },
        });
      }
    }

    await this.prisma.auditLog.create({
      data: {
        action: "EMPLOYEE_PROVISION",
        entity: "Employee",
        entityId: created.employee.id,
        userId: actor.userId,
        meta: {
          email,
          role: targetRole,
          userId: created.user.id,
          status,
        },
      },
    });

    const row = linked ?? created.employee;
    const mapped = mapEmployeeRow(row);
    return {
      ...mapped,
      user: row.user
        ? {
            ...row.user,
            role: normalizeRole(row.user.role),
            status: row.user.status.toLowerCase(),
          }
        : null,
      tempPassword: canActivate ? tempPassword : undefined,
      pendingAuthorization: status === UserAccountStatus.PENDING,
      message:
        status === UserAccountStatus.PENDING
          ? "Expediente indexado — usuario en PENDING hasta autorización de mando"
          : "Expediente y acceso provisionados",
    };
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
      const updated = await this.prisma.employee.update({
        where: { id: dto.id },
        data,
        include: { driver: { select: driverSelect } },
      });
      await this.logistics.ensureDriverForEmployee(organizationId, updated);
      const linked = await this.prisma.employee.findFirst({
        where: { id: updated.id },
        include: { driver: { select: driverSelect } },
      });
      return mapEmployeeRow(linked ?? updated);
    }

    try {
      const created = await this.prisma.employee.create({
        data: { ...data, organizationId },
        include: { driver: { select: driverSelect } },
      });
      if (!created.driverId) {
        await this.logistics.ensureDriverForEmployee(organizationId, created);
        const linked = await this.prisma.employee.findFirst({
          where: { id: created.id },
          include: { driver: { select: driverSelect } },
        });
        if (linked) return mapEmployeeRow(linked);
      }
      return mapEmployeeRow(created);
    } catch {
      throw new BadRequestException({
        error: "EMPLOYEE_DOCUMENT_CONFLICT",
        message: "Ya existe un expediente con ese documento",
      });
    }
  }

  async patchEmployee(
    organizationId: string,
    id: string,
    dto: PatchEmployeeDto,
    actorRole?: string,
  ) {
    const existing = await this.prisma.employee.findFirst({
      where: { id, organizationId },
    });
    if (!existing) throw new NotFoundException("Expediente no encontrado");

    const canManageIdentity = canManageTenantIdentity(actorRole);
    if (dto.document !== undefined && !canManageIdentity) {
      throw new ForbiddenException(
        "Solo el maestro de plataforma o el admin de la empresa pueden corregir el documento",
      );
    }

    if (dto.document) {
      const clash = await this.prisma.employee.findFirst({
        where: {
          organizationId,
          document: dto.document.trim(),
          NOT: { id },
        },
      });
      if (clash) {
        throw new BadRequestException({
          error: "EMPLOYEE_DOCUMENT_CONFLICT",
          message: "Ya existe un expediente con ese documento",
        });
      }
    }

    if (dto.driverId) {
      const driver = await this.prisma.driver.findFirst({
        where: { id: dto.driverId, organizationId },
      });
      if (!driver) throw new NotFoundException("Conductor no encontrado");
    }

    const nextDocument = dto.document?.trim();
    const updated = await this.prisma.employee.update({
      where: { id },
      data: {
        ...hrDataFromDto(dto),
        fatigueScore: dto.fatigueScore,
        document: canManageIdentity ? nextDocument : undefined,
        status: dto.status
          ? (dto.status.toUpperCase() as EmployeeStatus)
          : undefined,
      },
      include: {
        driver: { select: driverSelect },
        user: { select: userSelect },
      },
    });

    if (dto.role && existing.userId) {
      const targetRole = UsersService.resolveRole(dto.role);
      if (targetRole === Role.PLATFORM_MASTER) {
        throw new ForbiddenException("No se puede asignar PLATFORM_MASTER");
      }
      await this.prisma.user.update({
        where: { id: existing.userId },
        data: { role: targetRole },
      });
    }

    if (dto.email !== undefined && existing.userId) {
      const nextEmail = dto.email?.toLowerCase().trim() ?? null;
      if (nextEmail) {
        const taken = await this.prisma.user.findFirst({
          where: { email: nextEmail, NOT: { id: existing.userId } },
        });
        if (taken) {
          throw new BadRequestException("El correo ya está registrado como usuario");
        }
        await this.prisma.user.update({
          where: { id: existing.userId },
          data: { email: nextEmail, name: dto.name ?? existing.name },
        });
      }
    } else if (dto.name && existing.userId) {
      await this.prisma.user.update({
        where: { id: existing.userId },
        data: { name: dto.name },
      });
    }

    if (canManageIdentity && nextDocument && existing.driverId) {
      await this.prisma.driver.update({
        where: { id: existing.driverId },
        data: { document: nextDocument },
      });
    }

    await this.logistics.ensureDriverForEmployee(organizationId, updated);
    const linked = await this.prisma.employee.findFirst({
      where: { id: updated.id },
      include: {
        driver: { select: driverSelect },
        user: { select: userSelect },
      },
    });

    if (linked?.driverId && linked.userId) {
      await this.prisma.driver.update({
        where: { id: linked.driverId },
        data: { userId: linked.userId },
      });
    }

    const row = linked ?? updated;
    return {
      ...mapEmployeeRow(row),
      user: row.user
        ? {
            ...row.user,
            role: normalizeRole(row.user.role),
            status: row.user.status.toLowerCase(),
          }
        : null,
    };
  }

  async suspendAccess(organizationId: string, id: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, organizationId },
      include: { user: { select: userSelect } },
    });
    if (!employee) throw new NotFoundException("Expediente no encontrado");
    if (!employee.userId) {
      throw new BadRequestException("El expediente no tiene usuario vinculado");
    }
    await this.prisma.user.update({
      where: { id: employee.userId },
      data: { active: false },
    });
    return { ok: true as const, id, action: "SUSPENDED" as const };
  }

  async restoreAccess(organizationId: string, id: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, organizationId },
    });
    if (!employee) throw new NotFoundException("Expediente no encontrado");
    if (!employee.userId) {
      throw new BadRequestException("El expediente no tiene usuario vinculado");
    }
    if (employee.status === EmployeeStatus.INACTIVE) {
      throw new BadRequestException(
        "Restaure el expediente laboral antes de reactivar el acceso",
      );
    }
    await this.prisma.user.update({
      where: { id: employee.userId },
      data: { active: true, status: UserAccountStatus.ACTIVE },
    });
    return { ok: true as const, id, action: "RESTORED" as const };
  }

  async terminateEmployee(
    organizationId: string,
    id: string,
    dto: TerminateEmployeeDto,
  ) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, organizationId },
    });
    if (!employee) throw new NotFoundException("Expediente no encontrado");

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id },
        data: {
          status: EmployeeStatus.INACTIVE,
          terminatedAt: now,
          terminationReason: dto.reason?.trim() || null,
        },
      });
      if (employee.userId) {
        await tx.user.update({
          where: { id: employee.userId },
          data: { active: false },
        });
      }
      if (employee.driverId) {
        await tx.driver.update({
          where: { id: employee.driverId },
          data: { active: false },
        });
      }
    });

    return { ok: true as const, id, action: "TERMINATED" as const };
  }

  async resetUserPassword(
    organizationId: string,
    id: string,
    actor: { userId: string; role: string },
  ) {
    if (!canManageTenantIdentity(actor.role)) {
      throw new ForbiddenException("Sin permiso para resetear clave");
    }
    const employee = await this.prisma.employee.findFirst({
      where: { id, organizationId },
    });
    if (!employee?.userId) {
      throw new BadRequestException("El expediente no tiene usuario vinculado");
    }
    const tempPassword = generateTempPassword();
    await this.prisma.user.update({
      where: { id: employee.userId },
      data: { passwordHash: await UsersService.hashPassword(tempPassword) },
    });
    return { ok: true as const, tempPassword };
  }

  async deleteEmployee(
    organizationId: string,
    id: string,
    actorRole?: string,
  ) {
    if (!canManageTenantIdentity(actorRole)) {
      throw new ForbiddenException(
        "Solo RRHH o el admin de la empresa pueden dar de baja un expediente",
      );
    }
    return this.terminateEmployee(organizationId, id, {
      reason: "Baja administrativa",
    });
  }

  fatigueStatus(organizationId: string, driverId: string) {
    return this.fatigue.fatigueStatus(organizationId, driverId);
  }

  async overview(organizationId: string) {
    const now = new Date();
    const alertThreshold = new Date();
    alertThreshold.setDate(now.getDate() + LICENSE_ALERT_DAYS);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      personalActivo,
      fatigaAlta,
      licenciasPorVencer,
      novedadesNominaMes,
    ] = await Promise.all([
      this.prisma.employee.count({
        where: { organizationId, status: EmployeeStatus.ACTIVE },
      }),
      this.prisma.driver.count({
        where: {
          organizationId,
          active: true,
          OR: [
            { fatigueScore: { gte: HARD_RULES.FATIGUE_BLOCK_SCORE } },
            { dispatchBlocked: true },
          ],
        },
      }),
      this.prisma.driver.count({
        where: {
          organizationId,
          active: true,
          licenseExpiresAt: { gte: now, lte: alertThreshold },
        },
      }),
      this.prisma.payrollRun.count({
        where: {
          organizationId,
          createdAt: { gte: monthStart },
        },
      }),
    ]);

    return {
      personalActivo,
      fatigaAlta,
      licenciasPorVencer,
      novedadesNominaMes,
      systemStatus:
        fatigaAlta > 0 || licenciasPorVencer > 0 ? "ALERT" : "NOMINAL",
    };
  }

  /** Auditoría de licencias: hard-stop en drivers vencidos. */
  async auditLicenses(organizationId: string) {
    const now = new Date();
    const alertThreshold = new Date();
    alertThreshold.setDate(now.getDate() + LICENSE_ALERT_DAYS);

    const expired = await this.prisma.driver.findMany({
      where: {
        organizationId,
        active: true,
        OR: [
          { licenseExpiresAt: { lt: now } },
          { licenseExpiresAt: null, licenseNumber: { not: null } },
        ],
      },
    });

    let blocked = 0;
    for (const d of expired) {
      if (d.dispatchBlocked && d.blockReason === "DRIVER_LICENSE_EXPIRED") {
        continue;
      }
      await this.prisma.driver.update({
        where: { id: d.id },
        data: {
          dispatchBlocked: true,
          blockReason: "DRIVER_LICENSE_EXPIRED",
        },
      });
      blocked += 1;
    }

    const expiringSoon = await this.prisma.driver.count({
      where: {
        organizationId,
        active: true,
        licenseExpiresAt: { gte: now, lte: alertThreshold },
      },
    });

    return {
      auditedAt: now.toISOString(),
      expiredFound: expired.length,
      newlyBlocked: blocked,
      expiringSoon,
    };
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async nightlyLicenseAudit() {
    const orgs = await this.prisma.organization.findMany({
      select: { id: true },
      take: 50,
    });
    for (const org of orgs) {
      await this.auditLicenses(org.id);
    }
  }

  listPayrollRuns(organizationId: string, take = 20) {
    return this.prisma.payrollRun.findMany({
      where: { organizationId },
      include: {
        lines: {
          include: {
            employee: { select: { id: true, name: true, document: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(take, 50),
    });
  }

  listTrainings(organizationId: string) {
    return this.prisma.hqseTrainingRecord.findMany({
      where: { organizationId },
      include: {
        driver: {
          select: { id: true, name: true, document: true },
        },
      },
      orderBy: { completedAt: "desc" },
      take: 100,
    });
  }

  async createTraining(organizationId: string, dto: CreateTrainingDto) {
    const driver = await this.prisma.driver.findFirst({
      where: { id: dto.driverId, organizationId },
    });
    if (!driver) throw new NotFoundException("Conductor no encontrado");

    return this.prisma.hqseTrainingRecord.create({
      data: {
        organizationId,
        driverId: dto.driverId,
        topic: dto.topic.trim(),
        completedAt: dto.completedAt ?? new Date(),
        expiresAt: dto.expiresAt ?? null,
        provider: dto.provider ?? null,
        certificateRef: dto.certificateRef ?? null,
      },
      include: {
        driver: { select: { id: true, name: true, document: true } },
      },
    });
  }

  listDriversForOps(organizationId: string) {
    return this.logistics.listDrivers(organizationId);
  }

  async getEmployeeDocuments(organizationId: string, employeeId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, organizationId },
      select: {
        id: true,
        name: true,
        document: true,
        title: true,
        area: true,
        driverId: true,
        email: true,
        driver: {
          select: {
            id: true,
            licenseNumber: true,
            licenseCategory: true,
            licenseExpiresAt: true,
            dispatchBlocked: true,
            blockReason: true,
          },
        },
      },
    });
    if (!employee) throw new NotFoundException("Expediente no encontrado");

    const checklist = hrDocumentChecklistForCargo(employee.title, employee.area);
    const orFilters: Array<Record<string, unknown>> = [
      { entityType: "EMPLOYEE", entityId: employee.id },
    ];
    if (employee.driverId) {
      orFilters.push({ driverId: employee.driverId });
    }

    const documents = await this.prisma.archiveDocument.findMany({
      where: {
        organizationId,
        deletedAt: null,
        OR: orFilters,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const slots = checklist.map((slot) => {
      const matches = documents.filter((d) =>
        (d.tags || []).some(
          (t) => t === slot.key || t.toUpperCase() === slot.key,
        ),
      );
      const latest = matches[0] ?? null;
      return {
        ...slot,
        status: latest ? ("UPLOADED" as const) : ("MISSING" as const),
        document: latest
          ? {
              id: latest.id,
              title: latest.title,
              fileRef: latest.fileRef,
              originalName: latest.originalName,
              createdAt: latest.createdAt,
              validationStatus: latest.validationStatus,
              expiresAt: latest.expiresAt,
            }
          : null,
      };
    });

    const required = slots.filter((s) => s.required);
    const uploadedRequired = required.filter((s) => s.status === "UPLOADED");

    return {
      employee: {
        id: employee.id,
        name: employee.name,
        document: employee.document,
        title: employee.title,
        area: employee.area,
        driverId: employee.driverId,
      },
      license: employee.driver
        ? {
            number: employee.driver.licenseNumber,
            category: employee.driver.licenseCategory,
            expiresAt: employee.driver.licenseExpiresAt,
            dispatchBlocked: employee.driver.dispatchBlocked,
            blockReason: employee.driver.blockReason,
          }
        : null,
      profileLabel: hrDocProfileLabel(employee.title, employee.area),
      checklist: slots,
      documents: documents.map((d) => ({
        id: d.id,
        title: d.title,
        docType: d.docType,
        tags: d.tags,
        fileRef: d.fileRef,
        originalName: d.originalName,
        createdAt: d.createdAt,
        validationStatus: d.validationStatus,
        expiresAt: d.expiresAt,
      })),
      progress: {
        requiredTotal: required.length,
        requiredDone: uploadedRequired.length,
        complete: uploadedRequired.length === required.length,
      },
    };
  }

  async uploadEmployeeDocument(
    organizationId: string,
    employeeId: string,
    actorUserId: string,
    file: {
      storedName: string;
      originalName: string;
      absolutePath: string;
      byteSize: number;
      mimeType?: string;
    },
    opts: {
      slotKey: string;
      title?: string;
      licenseNumber?: string;
      licenseCategory?: string;
      licenseExpiresAt?: string;
    },
  ) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, organizationId },
      select: {
        id: true,
        name: true,
        document: true,
        title: true,
        area: true,
        phone: true,
        driverId: true,
      },
    });
    if (!employee) throw new NotFoundException("Expediente no encontrado");

    const checklist = hrDocumentChecklistForCargo(employee.title, employee.area);
    const slot = checklist.find((s) => s.key === opts.slotKey);
    if (!slot) {
      throw new BadRequestException("Tipo de documento no válido para este cargo");
    }

    const isLicense = slot.key === "LICENCIA" || slot.docType === "LICENCIA";
    let licenseExpiresAt: Date | null = null;
    if (isLicense) {
      const number = String(opts.licenseNumber || "").trim();
      const category = String(opts.licenseCategory || "").trim();
      const expiresRaw = String(opts.licenseExpiresAt || "").trim();
      if (!number || !category || !expiresRaw) {
        throw new BadRequestException(
          "Para la licencia debes indicar número, categoría y fecha de vencimiento",
        );
      }
      licenseExpiresAt = new Date(expiresRaw);
      if (Number.isNaN(licenseExpiresAt.getTime())) {
        throw new BadRequestException("Fecha de vencimiento inválida");
      }
    }

    // Asegura perfil conductor antes de vincular el PDF / datos de licencia
    let driverId = employee.driverId;
    if (isLicense || isFleetDriverRole(employee.title, employee.area)) {
      driverId = await this.logistics.ensureDriverForEmployee(organizationId, {
        id: employee.id,
        name: employee.name,
        document: employee.document,
        phone: employee.phone,
        driverId: employee.driverId,
        title: employee.title,
        area: employee.area,
      });
    }

    const meta: UploadArchiveDto & {
      storedName: string;
      originalName: string;
      absolutePath: string;
      byteSize?: number;
      mimeType?: string;
    } = {
      title: opts.title?.trim() || `${slot.label} · ${employee.name}`,
      category: "HR",
      docType: slot.docType,
      tags: [slot.key, "HR", "RRHH"],
      entityType: "EMPLOYEE",
      entityId: employee.id,
      driverId: driverId ?? undefined,
      autoOcr: false,
      storedName: file.storedName,
      originalName: file.originalName,
      absolutePath: file.absolutePath,
      byteSize: file.byteSize,
      mimeType: file.mimeType,
    };

    const uploaded = await this.dataRoom.upload(
      organizationId,
      meta,
      actorUserId,
    );

    if (isLicense && driverId && licenseExpiresAt) {
      const expired = licenseExpiresAt.getTime() <= Date.now();
      await this.prisma.driver.update({
        where: { id: driverId },
        data: {
          licenseNumber: String(opts.licenseNumber).trim(),
          licenseCategory: String(opts.licenseCategory).trim().toUpperCase(),
          licenseExpiresAt,
          dispatchBlocked: expired,
          blockReason: expired ? "LICENSE_EXPIRED" : null,
        },
      });
      await this.prisma.archiveDocument.update({
        where: { id: uploaded.document.id },
        data: { expiresAt: licenseExpiresAt },
      });
    }

    const dossier = await this.getEmployeeDocuments(organizationId, employeeId);
    return {
      ...uploaded,
      dossier,
    };
  }
}
