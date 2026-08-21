import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Field, LoginSchema } from "@fsg/shared";
import { z } from "zod";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { Public } from "../security/public.decorator";
import { TurnstileService } from "../security/turnstile.service";
import {
  ACCESS_COOKIE,
  clearCookieOptions,
  sessionCookieOptions,
} from "../security/session-cookie";
import { parsePagination, pageMeta } from "../security/pagination";

const RegisterOrgSchema = z.object({
  organizationName: Field.legalName,
  nit: Field.nit,
  adminName: Field.personName,
  adminEmail: Field.email,
  adminPassword: Field.password,
  turnstileToken: z.string().optional(),
});

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(8).max(128),
  newPassword: Field.password,
});

const LoginBodySchema = LoginSchema.extend({
  turnstileToken: z.string().optional(),
});

@Controller("auth")
export class AuthController {
  constructor(
    private auth: AuthService,
    private turnstile: TurnstileService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @Post("login")
  async login(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const dto = LoginBodySchema.parse(body ?? {});
    await this.turnstile.assertValid(
      dto.turnstileToken ||
        (req.headers["x-turnstile-token"] as string | undefined),
      req.ip,
    );
    const result = await this.auth.login(dto.email, dto.password);
    res.cookie(ACCESS_COOKIE, result.accessToken, sessionCookieOptions());
    return result;
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @Post("register")
  async register(@Body() body: unknown, @Req() req: Request) {
    const dto = RegisterOrgSchema.parse(body ?? {});
    await this.turnstile.assertValid(dto.turnstileToken, req.ip);
    return this.auth.registerOrganization(dto);
  }

  @Public()
  @Post("logout")
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(ACCESS_COOKIE, clearCookieOptions());
    return { ok: true };
  }

  @Get("me")
  me(@Req() req: { user: { userId: string } }) {
    return this.auth.me(req.user.userId);
  }

  @Post("refresh")
  async refresh(
    @Req() req: { user: { userId: string } },
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.refresh(req.user.userId);
    res.cookie(ACCESS_COOKIE, result.accessToken, sessionCookieOptions());
    return result;
  }

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

  @Get("users")
  async users(
    @Req() req: { user: { organizationId: string } },
    @Query() query: Record<string, string>,
  ) {
    const page = parsePagination(query);
    const { items, total } = await this.auth.listUsersPaged(
      req.user.organizationId,
      page,
    );
    return { items, meta: pageMeta(total, page) };
  }
}
