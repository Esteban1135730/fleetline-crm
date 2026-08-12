import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { AccountType, Role, UserAccountStatus } from "@fsg/db";
import { normalizeRole } from "@fsg/shared";
import { z } from "zod";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles, RolesGuard } from "../auth/roles.guard";
import { PrismaService } from "../prisma/prisma.service";

type AuthReq = {
  user: { organizationId: string; userId: string; role: string };
};

const CreateOrgSchema = z.object({
  organizationName: z.string().min(2),
  nit: z.string().min(3),
  adminName: z.string().min(2),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8),
  maxUsers: z.number().int().min(1).max(10_000).optional(),
});

const PatchOrgSchema = z.object({
  name: z.string().min(2).optional(),
  maxUsers: z.number().int().min(1).max(10_000).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED", "TRIAL"]).optional(),
  suspendedReason: z.string().max(500).optional(),
});

const PatchUserSchema = z.object({
  active: z.boolean().optional(),
  status: z.enum(["PENDING", "ACTIVE", "REJECTED"]).optional(),
  name: z.string().min(2).optional(),
  role: z.string().optional(),
});

/**
 * Consola del Usuario Maestro (SUPERADMIN / PLATFORM_MASTER).
 * Control total de tenants (empresas) y usuarios cross-tenant.
 */
@Controller(["plataforma", "api/v1/plataforma"])
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("platform_master", "PLATFORM_MASTER", "superadmin", "SUPERADMIN")
export class PlatformController {
  constructor(private prisma: PrismaService) {}

  @Get("organizations")
  async listOrgs() {
    const orgs = await this.prisma.organization.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { users: true } },
        users: {
          where: { role: { in: [Role.ORG_ADMIN, Role.SUPERADMIN] } },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            status: true,
            active: true,
          },
          take: 8,
        },
      },
    });
    return orgs.map((o) => ({
      id: o.id,
      tenantId: o.id,
      name: o.name,
      nit: o.nit,
      status: o.status,
      maxUsers: o.maxUsers,
      userCount: o._count.users,
      licensesUsed: o._count.users,
      licensesRemaining: Math.max(0, o.maxUsers - o._count.users),
      suspendedAt: o.suspendedAt,
      suspendedReason: o.suspendedReason,
      admins: o.users.map((u) => ({
        ...u,
        role: normalizeRole(String(u.role)),
        status: String(u.status).toLowerCase(),
      })),
      createdAt: o.createdAt,
    }));
  }

  @Post("organizations")
  async createOrg(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = CreateOrgSchema.parse(body ?? {});
    const nit = dto.nit.trim();
    const email = dto.adminEmail.toLowerCase().trim();
    const maxUsers = dto.maxUsers ?? 50;

    const existingOrg = await this.prisma.organization.findUnique({
      where: { nit },
    });
    if (existingOrg) {
      throw new ConflictException("Ya existe una empresa con ese NIT");
    }
    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ConflictException("El email del admin ya está registrado");
    }

    const passwordHash = await bcrypt.hash(dto.adminPassword, 10);
    const result = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: dto.organizationName.trim(),
          nit,
          maxUsers,
          status: "ACTIVE",
        },
      });
      const admin = await tx.user.create({
        data: {
          email,
          name: dto.adminName.trim(),
          passwordHash,
          role: Role.ORG_ADMIN,
          status: UserAccountStatus.ACTIVE,
          active: true,
          organizationId: org.id,
          approvedById: req.user.userId,
          approvedAt: new Date(),
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

    await this.prisma.auditLog.create({
      data: {
        action: "ORG_CREATE",
        entity: "Organization",
        entityId: result.org.id,
        userId: req.user.userId,
        meta: {
          tenantId: result.org.id,
          nit,
          adminEmail: email,
          maxUsers,
        },
      },
    });

    return {
      tenantId: result.org.id,
      organization: {
        id: result.org.id,
        tenantId: result.org.id,
        name: result.org.name,
        nit: result.org.nit,
        maxUsers: result.org.maxUsers,
        status: result.org.status,
      },
      admin: {
        id: result.admin.id,
        email: result.admin.email,
        name: result.admin.name,
        role: "org_admin",
        status: "active",
      },
      message: `Empresa ${result.org.name} creada · admin ${email}`,
    };
  }

  @Patch("organizations/:tenantId")
  async patchOrg(
    @Req() req: AuthReq,
    @Param("tenantId") tenantId: string,
    @Body() body: unknown,
  ) {
    const dto = PatchOrgSchema.parse(body ?? {});
    const org = await this.prisma.organization.findUnique({
      where: { id: tenantId },
    });
    if (!org) throw new NotFoundException("Tenant no encontrado");

    const data: {
      name?: string;
      maxUsers?: number;
      status?: "ACTIVE" | "SUSPENDED" | "TRIAL";
      suspendedAt?: Date | null;
      suspendedReason?: string | null;
    } = {};
    if (dto.name) data.name = dto.name.trim();
    if (dto.maxUsers != null) data.maxUsers = dto.maxUsers;
    if (dto.status) {
      data.status = dto.status;
      if (dto.status === "SUSPENDED") {
        data.suspendedAt = new Date();
        data.suspendedReason = dto.suspendedReason || "Suspendido por Usuario Maestro";
      } else {
        data.suspendedAt = null;
        data.suspendedReason = null;
      }
    }

    const updated = await this.prisma.organization.update({
      where: { id: tenantId },
      data,
    });

    await this.prisma.auditLog.create({
      data: {
        action: "ORG_PATCH",
        entity: "Organization",
        entityId: tenantId,
        userId: req.user.userId,
        meta: { ...dto, tenantId },
      },
    });

    return {
      tenantId: updated.id,
      id: updated.id,
      name: updated.name,
      nit: updated.nit,
      status: updated.status,
      maxUsers: updated.maxUsers,
      suspendedAt: updated.suspendedAt,
      suspendedReason: updated.suspendedReason,
    };
  }

  @Get("users")
  async allUsers() {
    const users = await this.prisma.user.findMany({
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            nit: true,
            status: true,
            maxUsers: true,
          },
        },
      },
      orderBy: [{ organizationId: "asc" }, { name: "asc" }],
      take: 1000,
    });
    return users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: normalizeRole(String(u.role)),
      status: String(u.status).toLowerCase(),
      active: u.active,
      tenantId: u.organizationId,
      organizationId: u.organizationId,
      organization: u.organization
        ? {
            ...u.organization,
            tenantId: u.organization.id,
          }
        : null,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
    }));
  }

  @Patch("users/:userId")
  async patchUser(
    @Req() req: AuthReq,
    @Param("userId") userId: string,
    @Body() body: unknown,
  ) {
    const dto = PatchUserSchema.parse(body ?? {});
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("Usuario no encontrado");

    const roleNorm = normalizeRole(String(user.role));
    if (roleNorm === "platform_master" && dto.active === false) {
      throw new BadRequestException("No se puede desactivar al Usuario Maestro");
    }

    let role: Role | undefined;
    if (dto.role) {
      const n = normalizeRole(dto.role);
      const map: Record<string, Role> = {
        platform_master: Role.SUPERADMIN,
        org_admin: Role.ORG_ADMIN,
        recepcionista: Role.RECEPCIONISTA,
        lider_ti: Role.LIDER_TI,
        gestor_documental: Role.GESTOR_DOCUMENTAL,
        gestor_contable: Role.GESTOR_CONTABLE,
        auxiliar_contable: Role.AUXILIAR_CONTABLE,
        tesoreria: Role.TESORERIA,
        gestor_operativo: Role.GESTOR_OPERATIVO,
        conductor: Role.CONDUCTOR,
      };
      role = map[n] || (dto.role.toUpperCase() as Role);
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.active != null ? { active: dto.active } : {}),
        ...(dto.status ? { status: dto.status as UserAccountStatus } : {}),
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(role ? { role } : {}),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        action: "USER_PATCH_MASTER",
        entity: "User",
        entityId: userId,
        userId: req.user.userId,
        meta: { ...dto, tenantId: updated.organizationId },
      },
    });

    return {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      role: normalizeRole(String(updated.role)),
      status: String(updated.status).toLowerCase(),
      active: updated.active,
      tenantId: updated.organizationId,
    };
  }

  @Get("audit")
  async auditTrail() {
    return this.prisma.auditLog.findMany({
      where: {
        action: {
          in: ["ORG_CREATE", "ORG_PATCH", "USER_PATCH_MASTER", "ORG_SUSPEND"],
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }
}
