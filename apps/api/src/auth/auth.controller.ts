import { Body, Controller, Get, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";

@Controller("auth")
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post("login")
  login(@Body() body: { email: string; password: string }) {
    return this.auth.login(body.email, body.password);
  }

  @Post("register")
  register(
    @Body()
    body: {
      organizationName: string;
      nit: string;
      adminName: string;
      adminEmail: string;
      adminPassword: string;
    },
  ) {
    return this.auth.registerOrganization(body);
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
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    return this.auth.changePassword(
      req.user.userId,
      body.currentPassword,
      body.newPassword,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get("users")
  users(@Req() req: { user: { organizationId: string } }) {
    return this.auth.listUsers(req.user.organizationId);
  }
}
