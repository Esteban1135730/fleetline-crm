import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AccountType, Role, UserAccountStatus } from "@fsg/db";
import { normalizeRole } from "@fsg/shared";
import { PrismaService } from "../prisma/prisma.service";
import { hashPassword, isKnownGenericPassword, assertPasswordPolicy, verifyPassword } from "../security/password-hash";
import type { PageParams } from "../security/pagination";

/** Solo cuenta fallos (no logins OK). Menos agresivo que throttlear cada request. */
type FailBucket = { count: number; resetAt: number };

@Injectable()
export class AuthService {
  private readonly failByIp = new Map<string, FailBucket>();

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  private failLimit() {
    return Math.max(3, Number(process.env.LOGIN_FAIL_LIMIT || 15) || 15);
  }

  private failWindowMs() {
    return Math.max(
      60_000,
      Number(process.env.LOGIN_FAIL_WINDOW_MS || 900_000) || 900_000,
    );
  }

  private clientKey(ip: string | undefined) {
    return (ip || "unknown").trim() || "unknown";
  }

  /** Limpia ventana vencida y lanza 429 si la IP ya agotó fallos. */
  assertLoginNotLocked(ip: string | undefined) {
    const key = this.clientKey(ip);
    const now = Date.now();
    const bucket = this.failByIp.get(key);
    if (!bucket) return;
    if (now >= bucket.resetAt) {
      this.failByIp.delete(key);
      return;
    }
    if (bucket.count >= this.failLimit()) {
      const mins = Math.max(1, Math.ceil((bucket.resetAt - now) / 60_000));
      throw new HttpException(
        `Demasiados intentos fallidos desde esta red. Espere ~${mins} min o pida a TI reiniciar el API.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private recordLoginFailure(ip: string | undefined) {
    const key = this.clientKey(ip);
    const now = Date.now();
    const windowMs = this.failWindowMs();
    const prev = this.failByIp.get(key);
    if (!prev || now >= prev.resetAt) {
      this.failByIp.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }
    prev.count += 1;
    this.failByIp.set(key, prev);
  }

  private clearLoginFailures(ip: string | undefined) {
    this.failByIp.delete(this.clientKey(ip));
  }

  /** Ops: limpia bloqueo de una IP (o todas si ip vacío). */
  clearLoginLock(ip?: string) {
    if (!ip?.trim()) {
      this.failByIp.clear();
      return { cleared: "all" as const };
    }
    this.failByIp.delete(this.clientKey(ip));
    return { cleared: this.clientKey(ip) };
  }

  private toPublicUser(user: {
    id: string;
    email: string;
    name: string;
    role: Role;
    organizationId: string;
    directiveReadOnly?: boolean;
    status?: UserAccountStatus;
    mustChangePassword?: boolean;
    organization?: { name: string } | null;
  }) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: normalizeRole(user.role),
      /** Alias multi-tenant: organizationId === tenantId */
      organizationId: user.organizationId,
      tenantId: user.organizationId,
      companyId: user.organizationId,
      organizationName: user.organization?.name,
      directiveReadOnly: Boolean(user.directiveReadOnly),
      status: String(user.status ?? UserAccountStatus.ACTIVE).toLowerCase(),
      mustChangePassword: Boolean(user.mustChangePassword),
    };
  }

  async login(email: string, password: string, clientIp?: string) {
    this.assertLoginNotLocked(clientIp);

    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: { organization: true },
    });
    if (!user || !user.active) {
      this.recordLoginFailure(clientIp);
      throw new UnauthorizedException("Credenciales inválidas");
    }
    if (user.organization.status === "SUSPENDED") {
      throw new ForbiddenException(
        "Empresa suspendida — contacte al Usuario Maestro de plataforma",
      );
    }
    if (user.status === UserAccountStatus.PENDING) {
      throw new UnauthorizedException(
        "Cuenta pendiente de autorización por mando superior",
      );
    }
    if (user.status === UserAccountStatus.REJECTED) {
      throw new UnauthorizedException("Cuenta rechazada — contacta al admin de empresa");
    }
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      this.recordLoginFailure(clientIp);
      throw new UnauthorizedException("Credenciales inválidas");
    }

    this.clearLoginFailures(clientIp);

    /** Siempre: clave genérica detectada → forzar cambio. */
    const usedGeneric = isKnownGenericPassword(password);
    let mustChangePassword =
      Boolean(user.mustChangePassword) || usedGeneric;

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        ...(usedGeneric && !user.mustChangePassword
          ? { mustChangePassword: true }
          : {}),
      },
    });

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      tenantId: user.organizationId,
      directiveReadOnly: user.directiveReadOnly,
    };
    return {
      accessToken: await this.jwt.signAsync(payload),
      user: this.toPublicUser({ ...user, mustChangePassword }),
    };
  }
  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true },
    });
    if (!user || !user.active) throw new UnauthorizedException();
    if (
      user.status === UserAccountStatus.PENDING ||
      user.status === UserAccountStatus.REJECTED
    ) {
      throw new UnauthorizedException("Cuenta no activa");
    }
    return this.toPublicUser(user);
  }

  /** Renovación silenciosa de JWT (apps móviles Offline-first). */
  async refresh(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true },
    });
    if (!user || !user.active) throw new UnauthorizedException();
    if (user.organization.status === "SUSPENDED") {
      throw new ForbiddenException("Empresa suspendida");
    }
    if (
      user.status === UserAccountStatus.PENDING ||
      user.status === UserAccountStatus.REJECTED
    ) {
      throw new UnauthorizedException("Cuenta no activa");
    }
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      tenantId: user.organizationId,
      directiveReadOnly: user.directiveReadOnly,
    };
    const accessToken = await this.jwt.signAsync(payload);
    return {
      accessToken,
      refreshToken: accessToken,
      user: this.toPublicUser(user),
    };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    assertPasswordPolicy(newPassword);
    if (currentPassword === newPassword) {
      throw new BadRequestException(
        "La nueva clave debe ser distinta a la actual",
      );
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.active) throw new UnauthorizedException();
    const ok = await verifyPassword(currentPassword, user.passwordHash);
    if (!ok) throw new UnauthorizedException("Contraseña actual incorrecta");

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await hashPassword(newPassword),
        mustChangePassword: false,
      },
    });
    return { ok: true, mustChangePassword: false };
  }

  /**
   * Alta pública deshabilitada — solo el maestro crea empresas en /plataforma.
   * Se mantiene el método por si un proceso interno lo invoca.
   */
  async registerOrganization(_data: {
    organizationName: string;
    nit: string;
    adminName: string;
    adminEmail: string;
    adminPassword: string;
  }) {
    throw new ForbiddenException(
      "Registro público cerrado. El maestro de plataforma da de alta empresas.",
    );
  }

  /** Uso interno (tests / migración) — no exponer por HTTP abierto */
  async registerOrganizationInternal(data: {
    organizationName: string;
    nit: string;
    adminName: string;
    adminEmail: string;
    adminPassword: string;
  }) {
    const nit = data.nit.trim();
    const email = data.adminEmail.toLowerCase().trim();
    if (!data.organizationName?.trim()) {
      throw new BadRequestException("Nombre de empresa requerido");
    }
    assertPasswordPolicy(data.adminPassword);

    const existingOrg = await this.prisma.organization.findUnique({
      where: { nit },
    });
    if (existingOrg) throw new ConflictException("Ya existe una empresa con ese NIT");

    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) throw new ConflictException("El email ya está registrado");

    const passwordHash = await hashPassword(data.adminPassword);

    const result = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name: data.organizationName.trim(), nit },
      });

      const admin = await tx.user.create({
        data: {
          email,
          name: data.adminName.trim(),
          passwordHash,
          role: Role.ORG_ADMIN,
          status: UserAccountStatus.ACTIVE,
          mustChangePassword: true,
          organizationId: org.id,
        },
      });

      const chart = [
        { code: "1105", name: "Caja", type: AccountType.ASSET },
        { code: "1110", name: "Bancos", type: AccountType.ASSET },
        { code: "1305", name: "Clientes", type: AccountType.ASSET },
        { code: "2205", name: "Proveedores", type: AccountType.LIABILITY },
        { code: "4135", name: "Ingresos por transporte", type: AccountType.INCOME },
        { code: "5105", name: "Gastos de personal", type: AccountType.EXPENSE },
        { code: "5135", name: "Combustibles y lubricantes", type: AccountType.EXPENSE },
      ];
      await tx.account.createMany({
        data: chart.map((a) => ({ ...a, organizationId: org.id })),
      });

      return { org, admin };
    });

    const payload = {
      sub: result.admin.id,
      email: result.admin.email,
      role: result.admin.role,
      organizationId: result.org.id,
    };

    return {
      accessToken: await this.jwt.signAsync(payload),
      user: this.toPublicUser({
        ...result.admin,
        organization: result.org,
      }),
      organization: {
        id: result.org.id,
        name: result.org.name,
        nit: result.org.nit,
      },
    };
  }

  async listUsers(organizationId: string) {
    const { items } = await this.listUsersPaged(organizationId, {
      take: 100,
      skip: 0,
      page: 1,
    });
    return items;
  }

  async listUsersPaged(organizationId: string, page: PageParams) {
    const where = { organizationId };
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          active: true,
          status: true,
        },
        orderBy: { name: "asc" },
        take: page.take,
        skip: page.skip,
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      total,
      items: users.map((u) => ({
        ...u,
        role: normalizeRole(u.role),
        status: String(u.status).toLowerCase(),
      })),
    };
  }
}
