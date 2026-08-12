import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { UserAccountStatus } from "@fsg/db";
import { normalizeRole } from "@fsg/shared";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || "dev-secret-fsg-mega-os-2026",
    });
  }

  async validate(payload: {
    sub: string;
    email: string;
    role: string;
    organizationId: string;
    directiveReadOnly?: boolean;
  }) {
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

    return {
      userId: user.id,
      email: user.email,
      role: normalizeRole(user.role),
      organizationId: user.organizationId,
      directiveReadOnly: user.directiveReadOnly,
    };
  }
}
