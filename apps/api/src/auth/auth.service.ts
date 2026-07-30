import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { AccountType, Role } from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  private toPublicUser(user: {
    id: string;
    email: string;
    name: string;
    role: Role;
    organizationId: string;
  }) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role.toLowerCase() as
        | "presidencia"
        | "gerencia"
        | "finanzas"
        | "despacho"
        | "rrhh"
        | "atencion"
        | "sistemas",
      organizationId: user.organizationId,
    };
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
    if (!user || !user.active) {
      throw new UnauthorizedException("Credenciales inválidas");
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException("Credenciales inválidas");

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
    };
    return {
      accessToken: await this.jwt.signAsync(payload),
      user: this.toPublicUser(user),
    };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.active) throw new UnauthorizedException();
    return this.toPublicUser(user);
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    if (!newPassword || newPassword.length < 6) {
      throw new BadRequestException("La nueva clave debe tener al menos 6 caracteres");
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.active) throw new UnauthorizedException();
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) throw new UnauthorizedException("Contraseña actual incorrecta");

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(newPassword, 10) },
    });
    return { ok: true };
  }

  /** Alta de empresa + admin (onboarding real, sin seed demo) */
  async registerOrganization(data: {
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
    if (data.adminPassword.length < 6) {
      throw new BadRequestException("La clave debe tener al menos 6 caracteres");
    }

    const existingOrg = await this.prisma.organization.findUnique({
      where: { nit },
    });
    if (existingOrg) throw new ConflictException("Ya existe una empresa con ese NIT");

    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) throw new ConflictException("El email ya está registrado");

    const passwordHash = await bcrypt.hash(data.adminPassword, 10);

    const result = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name: data.organizationName.trim(), nit },
      });

      const admin = await tx.user.create({
        data: {
          email,
          name: data.adminName.trim(),
          passwordHash,
          role: Role.PRESIDENCIA,
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
      user: this.toPublicUser(result.admin),
      organization: {
        id: result.org.id,
        name: result.org.name,
        nit: result.org.nit,
      },
    };
  }

  async listUsers(organizationId: string) {
    const users = await this.prisma.user.findMany({
      where: { organizationId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        active: true,
      },
    });
    return users.map((u) => ({
      ...u,
      role: u.role.toLowerCase(),
    }));
  }
}
