import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { Role, UserAccountStatus } from "@fsg/db";
import { normalizeRole, roleRank } from "@fsg/shared";
import { PrismaService } from "../prisma/prisma.service";

/** Mapa flexible string → RoleCode Prisma */
const roleMap: Record<string, Role> = {
  PLATFORM_MASTER: Role.PLATFORM_MASTER,
  ORG_ADMIN: Role.ORG_ADMIN,
  TECNOLOGIA: Role.LIDER_TI,
  LIDER_TI: Role.LIDER_TI,
  GESTOR_DOCUMENTAL: Role.GESTOR_DOCUMENTAL,
  ARCHIVO: Role.GESTOR_DOCUMENTAL,
  GESTOR_CONTABLE: Role.GESTOR_CONTABLE,
  AUXILIAR_CONTABLE: Role.AUXILIAR_CONTABLE,
  TESORERIA: Role.TESORERIA,
  DIRECTOR_FINANCIERO: Role.DIRECTOR_FINANCIERO,
  QHSE: Role.QHSE,
  LIDER_QHSE: Role.LIDER_QHSE,
  COMPRAS: Role.COMPRAS,
  LIDER_COMPRAS: Role.LIDER_COMPRAS,
  DIRECTOR_OPERATIVO: Role.DIRECTOR_OPERATIVO,
  GESTOR_OPERATIVO: Role.GESTOR_OPERATIVO,
  COORDINADOR_OPERATIVO: Role.COORDINADOR_OPERATIVO,
  COORDINADOR_CAMPO: Role.COORDINADOR_CAMPO,
  CENTRO_CONTROL: Role.CENTRO_CONTROL,
  OPERADOR_CENTRO_CONTROL: Role.OPERADOR_CENTRO_CONTROL,
  CONTROL_INTERNO: Role.CONTROL_INTERNO,
  AUDITOR_CONTROL_INTERNO: Role.AUDITOR_CONTROL_INTERNO,
  PRESIDENCIA: Role.PRESIDENCIA,
  PRESIDENTE: Role.PRESIDENTE,
  VINCULACIONES: Role.VINCULACIONES,
  GESTOR_VINCULACIONES: Role.GESTOR_VINCULACIONES,
  COORDINADOR_COMERCIAL: Role.COORDINADOR_COMERCIAL,
  GESTOR_COMERCIAL: Role.GESTOR_COMERCIAL,
  GERENTE_GENERAL: Role.GERENTE_GENERAL,
  DIRECTOR_COMERCIAL: Role.DIRECTOR_COMERCIAL,
  DIRECTOR_JURIDICO: Role.DIRECTOR_JURIDICO,
  JURIDICO: Role.JURIDICO,
  REVISOR_FISCAL: Role.REVISOR_FISCAL,
  COORDINADOR_TALLER: Role.COORDINADOR_TALLER,
  AUXILIAR_CONTABLE_TALLER: Role.AUXILIAR_CONTABLE_TALLER,
  AUXILIAR_ALMACEN_TALLER: Role.AUXILIAR_ALMACEN_TALLER,
  MECANICO: Role.MECANICO,
  COORDINADOR_PATIO: Role.COORDINADOR_PATIO,
  AUXILIAR_PATIO: Role.AUXILIAR_PATIO,
  CONDUCTOR: Role.CONDUCTOR,
  SUB_GERENTE: Role.SUB_GERENTE,
  RECEPCIONISTA: Role.RECEPCIONISTA,
  MONITORA: Role.MONITORA,
  PADRE: Role.PADRE,
  PASAJERO: Role.PASAJERO,
  // legado
  GERENCIA: Role.GERENTE_GENERAL,
  FINANZAS: Role.TESORERIA,
  DESPACHO: Role.GESTOR_OPERATIVO,
  RRHH: Role.VINCULACIONES,
  ATENCION: Role.RECEPCIONISTA,
  RECEPCION: Role.RECEPCIONISTA,
  SISTEMAS: Role.LIDER_TI,
  REVISORIA: Role.REVISOR_FISCAL,
  SUPERVISOR: Role.CENTRO_CONTROL,
  COMERCIAL: Role.GESTOR_COMERCIAL,
  TALLER: Role.COORDINADOR_TALLER,
  platform_master: Role.PLATFORM_MASTER,
  org_admin: Role.ORG_ADMIN,
  recepcionista: Role.RECEPCIONISTA,
  recepcion: Role.RECEPCIONISTA,
  lider_ti: Role.LIDER_TI,
  gestor_documental: Role.GESTOR_DOCUMENTAL,
  tecnologia: Role.LIDER_TI,
  archivo: Role.GESTOR_DOCUMENTAL,
  gestor_contable: Role.GESTOR_CONTABLE,
  auxiliar_contable: Role.AUXILIAR_CONTABLE,
  tesoreria: Role.TESORERIA,
  director_financiero: Role.DIRECTOR_FINANCIERO,
  qhse: Role.QHSE,
  lider_qhse: Role.LIDER_QHSE,
  compras: Role.COMPRAS,
  lider_compras: Role.LIDER_COMPRAS,
  director_operativo: Role.DIRECTOR_OPERATIVO,
  gestor_operativo: Role.GESTOR_OPERATIVO,
  coordinador_operativo: Role.COORDINADOR_OPERATIVO,
  coordinador_campo: Role.COORDINADOR_CAMPO,
  centro_control: Role.CENTRO_CONTROL,
  operador_centro_control: Role.OPERADOR_CENTRO_CONTROL,
  watchtower: Role.OPERADOR_CENTRO_CONTROL,
  control_interno: Role.CONTROL_INTERNO,
  auditor_control_interno: Role.AUDITOR_CONTROL_INTERNO,
  forensic: Role.AUDITOR_CONTROL_INTERNO,
  presidencia: Role.PRESIDENCIA,
  presidente: Role.PRESIDENTE,
  founder: Role.PRESIDENTE,
  vinculaciones: Role.VINCULACIONES,
  gestor_vinculaciones: Role.GESTOR_VINCULACIONES,
  smart_onboarding: Role.GESTOR_VINCULACIONES,
  coordinador_comercial: Role.COORDINADOR_COMERCIAL,
  gestor_comercial: Role.GESTOR_COMERCIAL,
  director_comercial: Role.DIRECTOR_COMERCIAL,
  gerente_general: Role.GERENTE_GENERAL,
  juridico: Role.JURIDICO,
  director_juridico: Role.DIRECTOR_JURIDICO,
  revisor_fiscal: Role.REVISOR_FISCAL,
  coordinador_taller: Role.COORDINADOR_TALLER,
  auxiliar_contable_taller: Role.AUXILIAR_CONTABLE_TALLER,
  auxiliar_almacen_taller: Role.AUXILIAR_ALMACEN_TALLER,
  mecanico: Role.MECANICO,
  coordinador_patio: Role.COORDINADOR_PATIO,
  auxiliar_patio: Role.AUXILIAR_PATIO,
  conductor: Role.CONDUCTOR,
  sub_gerente: Role.SUB_GERENTE,
  monitora: Role.MONITORA,
  padre: Role.PADRE,
  pasajero: Role.PASAJERO,
  gerencia: Role.GERENTE_GENERAL,
  finanzas: Role.TESORERIA,
  despacho: Role.GESTOR_OPERATIVO,
  rrhh: Role.VINCULACIONES,
  atencion: Role.RECEPCIONISTA,
  sistemas: Role.LIDER_TI,
  revisoria: Role.REVISOR_FISCAL,
  supervisor: Role.CENTRO_CONTROL,
  comercial: Role.GESTOR_COMERCIAL,
  taller: Role.COORDINADOR_TALLER,
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
    status?: UserAccountStatus;
    organizationId: string;
    createdAt: Date;
    organization?: { id: string; name: string; nit: string } | null;
  }) {
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      role: normalizeRole(u.role),
      active: u.active,
      status: (u.status ?? UserAccountStatus.ACTIVE).toLowerCase(),
      organizationId: u.organizationId,
      organization: u.organization
        ? {
            id: u.organization.id,
            name: u.organization.name,
            nit: u.organization.nit,
          }
        : undefined,
      createdAt: u.createdAt,
    };
  }

  private parseRole(raw: string): Role {
    const role = roleMap[raw] ?? roleMap[raw.toLowerCase()];
    if (!role) throw new BadRequestException("Rol inválido");
    return role;
  }

  private isPlatformMaster(role: string) {
    return normalizeRole(role) === "platform_master";
  }

  private isOrgAdmin(role: string) {
    return normalizeRole(role) === "org_admin";
  }

  async list(
    actor: { userId: string; organizationId: string; role: string },
    opts?: { organizationId?: string; status?: string },
  ) {
    const where: {
      organizationId?: string;
      status?: UserAccountStatus;
    } = {
      organizationId: actor.organizationId,
    };

    if (opts?.status) {
      where.status = opts.status.toUpperCase() as UserAccountStatus;
    }

    const users = await this.prisma.user.findMany({
      where,
      include: {
        organization: { select: { id: true, name: true, nit: true } },
      },
      orderBy: [{ status: "asc" }, { name: "asc" }],
    });
    return users.map((u) => this.toPublic(u));
  }

  async create(
    actor: { userId: string; organizationId: string; role: string },
    data: {
      name: string;
      email: string;
      password: string;
      role: string;
      organizationId?: string;
      active?: boolean;
    },
  ) {
    const targetRole = this.parseRole(data.role);
    if (targetRole === Role.PLATFORM_MASTER) {
      throw new ForbiddenException(
        "Solo el seed/plataforma puede tener maestro global",
      );
    }

    const orgId = actor.organizationId;

    if (!orgId) throw new BadRequestException("organizationId requerido");

    const exists = await this.prisma.user.findUnique({
      where: { email: data.email.toLowerCase() },
    });
    if (exists) throw new BadRequestException("El email ya está registrado");

    const actorRank = roleRank(actor.role);
    const targetRank = roleRank(targetRole);
    const canActivateDirectly =
      this.isPlatformMaster(actor.role) ||
      this.isOrgAdmin(actor.role) ||
      targetRank < actorRank;

    const status = canActivateDirectly
      ? UserAccountStatus.ACTIVE
      : UserAccountStatus.PENDING;

    const user = await this.prisma.user.create({
      data: {
        name: data.name,
        email: data.email.toLowerCase(),
        passwordHash: await bcrypt.hash(data.password, 10),
        role: targetRole,
        active: data.active ?? true,
        status,
        organizationId: orgId,
        ...(status === UserAccountStatus.ACTIVE
          ? { approvedById: actor.userId, approvedAt: new Date() }
          : {}),
      },
      include: {
        organization: { select: { id: true, name: true, nit: true } },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        action: "USER_CREATE",
        entity: "User",
        entityId: user.id,
        userId: actor.userId,
        meta: {
          role: user.role,
          email: user.email,
          status: user.status,
          pending: status === UserAccountStatus.PENDING,
        },
      },
    });

    return {
      ...this.toPublic(user),
      pendingAuthorization: status === UserAccountStatus.PENDING,
      message:
        status === UserAccountStatus.PENDING
          ? "Usuario creado en PENDING — requiere autorización de mando superior / admin de empresa"
          : "Usuario activo",
    };
  }

  async update(
    actor: { userId: string; organizationId: string; role: string },
    id: string,
    data: {
      name?: string;
      email?: string;
      role?: string;
      active?: boolean;
      password?: string;
      status?: string;
    },
  ) {
    const existing = await this.prisma.user.findFirst({
      where: { id, organizationId: actor.organizationId },
    });
    if (!existing) throw new NotFoundException("Usuario no encontrado");

    if (existing.role === Role.PLATFORM_MASTER && !this.isPlatformMaster(actor.role)) {
      throw new ForbiddenException("No puedes modificar al maestro de plataforma");
    }

    const role = data.role ? this.parseRole(data.role) : undefined;
    if (role === Role.PLATFORM_MASTER) {
      throw new ForbiddenException("No se puede asignar PLATFORM_MASTER");
    }

    if (data.email && data.email.toLowerCase() !== existing.email) {
      const taken = await this.prisma.user.findUnique({
        where: { email: data.email.toLowerCase() },
      });
      if (taken) throw new BadRequestException("El email ya está registrado");
    }

    let status: UserAccountStatus | undefined;
    if (data.status) {
      status = data.status.toUpperCase() as UserAccountStatus;
    } else if (data.active === true && existing.status !== UserAccountStatus.ACTIVE) {
      status = UserAccountStatus.ACTIVE;
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        name: data.name,
        email: data.email ? data.email.toLowerCase() : undefined,
        role,
        active: data.active,
        status,
        ...(data.password
          ? { passwordHash: await bcrypt.hash(data.password, 10) }
          : {}),
      },
      include: {
        organization: { select: { id: true, name: true, nit: true } },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        action: "USER_UPDATE",
        entity: "User",
        entityId: user.id,
        userId: actor.userId,
        meta: data,
      },
    });

    return this.toPublic(user);
  }

  async remove(
    actor: { userId: string; organizationId: string; role: string },
    id: string,
  ) {
    if (id === actor.userId) {
      throw new BadRequestException("No puedes desactivar tu propio usuario");
    }
    const existing = await this.prisma.user.findFirst({
      where: { id, organizationId: actor.organizationId },
    });
    if (!existing) throw new NotFoundException("Usuario no encontrado");
    if (existing.role === Role.PLATFORM_MASTER) {
      throw new ForbiddenException("No se puede desactivar al maestro plataforma");
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: { active: false, status: UserAccountStatus.REJECTED },
      include: {
        organization: { select: { id: true, name: true, nit: true } },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        action: "USER_DEACTIVATE",
        entity: "User",
        entityId: id,
        userId: actor.userId,
      },
    });

    return this.toPublic(user);
  }

  async approve(
    actor: { userId: string; organizationId: string; role: string },
    id: string,
    decision: "APPROVE" | "REJECT",
  ) {
    if (
      !this.isPlatformMaster(actor.role) &&
      !this.isOrgAdmin(actor.role) &&
      roleRank(actor.role) < 70
    ) {
      throw new ForbiddenException(
        "Solo mando superior / admin de empresa puede autorizar altas",
      );
    }

    const existing = await this.prisma.user.findFirst({
      where: { id, organizationId: actor.organizationId },
    });
    if (!existing) throw new NotFoundException("Usuario no encontrado");
    if (existing.status !== UserAccountStatus.PENDING) {
      throw new BadRequestException("El usuario no está pendiente de autorización");
    }
    if (
      roleRank(actor.role) <= roleRank(existing.role) &&
      !this.isPlatformMaster(actor.role) &&
      !this.isOrgAdmin(actor.role)
    ) {
      throw new ForbiddenException(
        "Debes tener mayor mando que el usuario a autorizar",
      );
    }

    const user = await this.prisma.user.update({
      where: { id },
      data:
        decision === "APPROVE"
          ? {
              status: UserAccountStatus.ACTIVE,
              active: true,
              approvedById: actor.userId,
              approvedAt: new Date(),
            }
          : {
              status: UserAccountStatus.REJECTED,
              active: false,
              approvedById: actor.userId,
              approvedAt: new Date(),
            },
      include: {
        organization: { select: { id: true, name: true, nit: true } },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        action: decision === "APPROVE" ? "USER_APPROVE" : "USER_REJECT",
        entity: "User",
        entityId: id,
        userId: actor.userId,
      },
    });

    return this.toPublic(user);
  }
}
