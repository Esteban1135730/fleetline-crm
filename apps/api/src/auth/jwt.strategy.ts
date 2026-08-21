import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { Request } from "express";
import { UserAccountStatus } from "@fsg/db";
import { normalizeRole } from "@fsg/shared";
import { PrismaService } from "../prisma/prisma.service";
import { resolveJwtSecret } from "../security/jwt-secret";
import { ACCESS_COOKIE } from "../security/session-cookie";

function jwtFromCookieOrBearer(req: Request): string | null {
  const fromCookie = req?.cookies?.[ACCESS_COOKIE];
  if (typeof fromCookie === "string" && fromCookie.length > 0) return fromCookie;
  return ExtractJwt.fromAuthHeaderAsBearerToken()(req);
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: jwtFromCookieOrBearer,
      ignoreExpiration: false,
      secretOrKey: resolveJwtSecret(),
      passReqToCallback: true,
    });
  }

  async validate(
    req: Request,
    payload: {
      sub: string;
      email: string;
      role: string;
      organizationId: string;
      directiveReadOnly?: boolean;
    },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        organizationId: true,
        directiveReadOnly: true,
        active: true,
        status: true,
      },
    });

    if (!user || !user.active) {
      throw new UnauthorizedException("Sesión inválida");
    }
    if (
      user.status === UserAccountStatus.PENDING ||
      user.status === UserAccountStatus.REJECTED
    ) {
      throw new UnauthorizedException("Cuenta no autorizada");
    }

    const role = normalizeRole(user.role);
    let organizationId = user.organizationId;

    const path = String(req.originalUrl || req.url || req.path || "").split(
      "?",
    )[0];
    const isPlatformConsole = /\/plataforma(\/|$)/.test(path);

    if (role === "platform_master" && !isPlatformConsole) {
      const raw = req.headers["x-organization-id"];
      const requested = Array.isArray(raw) ? raw[0] : raw;
      const tenantId = requested?.trim();
      if (tenantId && tenantId !== user.organizationId) {
        const org = await this.prisma.organization.findUnique({
          where: { id: tenantId },
          select: { id: true },
        });
        if (org) organizationId = org.id;
      }
    }

    return {
      userId: user.id,
      email: user.email,
      role,
      organizationId,
      homeOrganizationId: user.organizationId,
      directiveReadOnly: user.directiveReadOnly,
    };
  }
}
