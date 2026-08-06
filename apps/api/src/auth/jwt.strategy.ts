import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
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
      },
    });

    if (!user || !user.active) {
      throw new UnauthorizedException("Sesión inválida");
    }

    return {
      userId: user.id,
      email: user.email,
      // ROLE_VIEWS / canAccessModule esperan clave en minúsculas (despacho, no DESPACHO)
      role: String(user.role).toLowerCase(),
      organizationId: user.organizationId,
      directiveReadOnly: user.directiveReadOnly,
    };
  }
}
