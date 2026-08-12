import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { JwtStrategy } from "./jwt.strategy";
import { RolesGuard } from "./roles.guard";
import { PermissionsGuard } from "./permissions.guard";
import { ModulesGuard } from "./modules.guard";

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || "dev-secret-fsg-mega-os-2026",
      signOptions: { expiresIn: "7d" },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, RolesGuard, PermissionsGuard, ModulesGuard],
  exports: [
    AuthService,
    JwtModule,
    RolesGuard,
    PermissionsGuard,
    ModulesGuard,
  ],
})
export class AuthModule {}
