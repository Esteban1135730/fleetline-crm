import { Body, Controller, Get, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { Field, LoginSchema } from "@fsg/shared";
import { z } from "zod";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";

const RegisterOrgSchema = z.object({
  organizationName: Field.legalName,
  nit: Field.nit,
  adminName: Field.personName,
  adminEmail: Field.email,
  adminPassword: Field.password,
});

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(4).max(128),
  newPassword: Field.password,
});

@Controller("auth")
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post("login")
  login(@Body() body: unknown) {
    const dto = LoginSchema.parse(body ?? {});
    return this.auth.login(dto.email, dto.password);
  }

  @Post("register")
  register(@Body() body: unknown) {
    return this.auth.registerOrganization(RegisterOrgSchema.parse(body ?? {}));
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@Req() req: { user: { userId: string } }) {
    return this.auth.me(req.user.userId);
  }

  /** Renovación de sesión móvil — requiere Bearer vigente. */
  @UseGuards(JwtAuthGuard)
  @Post("refresh")
  refresh(@Req() req: { user: { userId: string } }) {
    return this.auth.refresh(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch("password")
  changePassword(
    @Req() req: { user: { userId: string } },
    @Body() body: unknown,
  ) {
    const dto = ChangePasswordSchema.parse(body ?? {});
    return this.auth.changePassword(
      req.user.userId,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get("users")
  users(@Req() req: { user: { organizationId: string } }) {
    return this.auth.listUsers(req.user.organizationId);
  }
}
