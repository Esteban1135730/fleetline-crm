import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { Role } from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";

const roleMap: Record<string, Role> = {
  PRESIDENCIA: Role.PRESIDENCIA,
  GERENCIA: Role.GERENCIA,
  FINANZAS: Role.FINANZAS,
  DESPACHO: Role.DESPACHO,
  RRHH: Role.RRHH,
  ATENCION: Role.ATENCION,
  SISTEMAS: Role.SISTEMAS,
  presidencia: Role.PRESIDENCIA,
  gerencia: Role.GERENCIA,
  finanzas: Role.FINANZAS,
  despacho: Role.DESPACHO,
  rrhh: Role.RRHH,
  atencion: Role.ATENCION,
  sistemas: Role.SISTEMAS,
};

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  private toPublic(u: {
    id: string;
    email: string;
    name: string;
    role: Role;
    active: boolean;
    organizationId: string;
    createdAt: Date;
  }) {
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role.toLowerCase(),
      active: u.active,
      organizationId: u.organizationId,
      createdAt: u.createdAt,
    };
  }

  async list(organizationId: string) {
    const users = await this.prisma.user.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
    });
    return users.map((u) => this.toPublic(u));
  }

  async create(
    organizationId: string,
    data: {
      name: string;
      email: string;
      password: string;
      role: string;
      active?: boolean;
    },
    actorId: string,
  ) {
    const role = roleMap[data.role];
    if (!role) throw new BadRequestException("Rol inválido");
    const exists = await this.prisma.user.findUnique({
      where: { email: data.email },
    });
    if (exists) throw new BadRequestException("El email ya está registrado");

    const user = await this.prisma.user.create({
      data: {
        name: data.name,
        email: data.email.toLowerCase(),
        passwordHash: await bcrypt.hash(data.password, 10),
        role,
        active: data.active ?? true,
        organizationId,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        action: "USER_CREATE",
        entity: "User",
        entityId: user.id,
        userId: actorId,
        meta: { role: user.role, email: user.email },
      },
    });

    return this.toPublic(user);
  }

  async update(
    organizationId: string,
    id: string,
    data: {
      name?: string;
      email?: string;
      role?: string;
      active?: boolean;
      password?: string;
    },
    actorId: string,
  ) {
    const existing = await this.prisma.user.findFirst({
      where: { id, organizationId },
    });
    if (!existing) throw new NotFoundException("Usuario no encontrado");

    const role = data.role ? roleMap[data.role] : undefined;
    if (data.role && !role) throw new BadRequestException("Rol inválido");

    if (data.email && data.email.toLowerCase() !== existing.email) {
      const taken = await this.prisma.user.findUnique({
        where: { email: data.email.toLowerCase() },
      });
      if (taken) throw new BadRequestException("El email ya está registrado");
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        name: data.name,
        email: data.email ? data.email.toLowerCase() : undefined,
        role,
        active: data.active,
        ...(data.password
          ? { passwordHash: await bcrypt.hash(data.password, 10) }
          : {}),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        action: "USER_UPDATE",
        entity: "User",
        entityId: user.id,
        userId: actorId,
        meta: data,
      },
    });

    return this.toPublic(user);
  }

  async remove(organizationId: string, id: string, actorId: string) {
    if (id === actorId) {
      throw new BadRequestException("No puedes desactivar tu propio usuario");
    }
    const existing = await this.prisma.user.findFirst({
      where: { id, organizationId },
    });
    if (!existing) throw new NotFoundException("Usuario no encontrado");

    const user = await this.prisma.user.update({
      where: { id },
      data: { active: false },
    });

    await this.prisma.auditLog.create({
      data: {
        action: "USER_DEACTIVATE",
        entity: "User",
        entityId: id,
        userId: actorId,
      },
    });

    return this.toPublic(user);
  }
}
