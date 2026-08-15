import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { Field } from "@fsg/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles, RolesGuard } from "../auth/roles.guard";
import { UsersService } from "./users.service";

type AuthReq = {
  user: { organizationId: string; userId: string; role: string };
};

const CreateUserBody = z.object({
  name: Field.personName,
  email: Field.email,
  password: Field.password,
  role: z.string().min(2).max(64),
  organizationId: z.string().min(1).optional(),
  active: z.boolean().optional(),
});

const UpdateUserBody = z.object({
  name: Field.personName.optional(),
  email: Field.email.optional(),
  role: z.string().min(2).max(64).optional(),
  active: z.boolean().optional(),
  password: Field.password.optional(),
  status: z.string().optional(),
});

/** Quién puede listar / dar de alta (org admin + mando alto + ops/vinculaciones/ti) */
const MANAGERS = [
  "platform_master",
  "org_admin",
  "presidencia",
  "gerente_general",
  "sub_gerente",
  "tecnologia",
  "lider_ti",
  "vinculaciones",
  "director_operativo",
  "gestor_operativo",
  // legado
  "sistemas",
  "gerencia",
  "despacho",
  "rrhh",
] as const;

const EDITORS = [
  "platform_master",
  "org_admin",
  "presidencia",
  "gerente_general",
  "tecnologia",
  "lider_ti",
  "vinculaciones",
  "sistemas",
] as const;

const AUTHORIZERS = [
  "platform_master",
  "org_admin",
  "presidencia",
  "gerente_general",
  "sub_gerente",
  "gerencia",
] as const;

@Controller("users")
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private users: UsersService) {}

  @Get()
  @Roles(...MANAGERS)
  list(
    @Req() req: AuthReq,
    @Query("organizationId") organizationId?: string,
    @Query("status") status?: string,
  ) {
    return this.users.list(req.user, { organizationId, status });
  }

  @Post()
  @Roles(...MANAGERS)
  create(
    @Req() req: AuthReq,
    @Body()
    body: {
      name: string;
      email: string;
      password: string;
      role: string;
      organizationId?: string;
      active?: boolean;
    },
  ) {
    return this.users.create(req.user, CreateUserBody.parse(body ?? {}));
  }

  @Patch(":id")
  @Roles(...EDITORS)
  update(
    @Req() req: AuthReq,
    @Param("id") id: string,
    @Body()
    body: {
      name?: string;
      email?: string;
      role?: string;
      active?: boolean;
      password?: string;
      status?: string;
    },
  ) {
    return this.users.update(req.user, id, UpdateUserBody.parse(body ?? {}));
  }

  @Post(":id/deactivate")
  @Roles(...EDITORS)
  deactivate(@Req() req: AuthReq, @Param("id") id: string) {
    return this.users.remove(req.user, id);
  }

  @Post(":id/authorize")
  @Roles(...AUTHORIZERS)
  authorize(
    @Req() req: AuthReq,
    @Param("id") id: string,
    @Body() body: { decision?: "APPROVE" | "REJECT" },
  ) {
    return this.users.approve(
      req.user,
      id,
      body?.decision === "REJECT" ? "REJECT" : "APPROVE",
    );
  }
}
