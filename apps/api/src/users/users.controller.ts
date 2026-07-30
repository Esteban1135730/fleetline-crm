import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles, RolesGuard } from "../auth/roles.guard";
import { UsersService } from "./users.service";

@Controller("users")
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private users: UsersService) {}

  @Get()
  @Roles("presidencia", "sistemas", "PRESIDENCIA", "SISTEMAS")
  list(@Req() req: { user: { organizationId: string } }) {
    return this.users.list(req.user.organizationId);
  }

  @Post()
  @Roles("presidencia", "sistemas", "PRESIDENCIA", "SISTEMAS")
  create(
    @Req() req: { user: { organizationId: string; userId: string } },
    @Body()
    body: {
      name: string;
      email: string;
      password: string;
      role: string;
      active?: boolean;
    },
  ) {
    return this.users.create(req.user.organizationId, body, req.user.userId);
  }

  @Patch(":id")
  @Roles("presidencia", "sistemas", "PRESIDENCIA", "SISTEMAS")
  update(
    @Req() req: { user: { organizationId: string; userId: string } },
    @Param("id") id: string,
    @Body()
    body: {
      name?: string;
      email?: string;
      role?: string;
      active?: boolean;
      password?: string;
    },
  ) {
    return this.users.update(
      req.user.organizationId,
      id,
      body,
      req.user.userId,
    );
  }

  @Post(":id/deactivate")
  @Roles("presidencia", "sistemas", "PRESIDENCIA", "SISTEMAS")
  deactivate(
    @Req() req: { user: { organizationId: string; userId: string } },
    @Param("id") id: string,
  ) {
    return this.users.remove(req.user.organizationId, id, req.user.userId);
  }
}
