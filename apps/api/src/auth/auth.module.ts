import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { JwtStrategy } from "./jwt.strategy";
import { RolesGuard } from "./roles.guard";
import { PermissionsGuard } from "./permissions.guard";
import { ModulesGuard } from "./modules.guard";
import { resolveJwtSecret } from "../security/jwt-secret";

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.registerAsync({
      useFactory: (): import("@nestjs/jwt").JwtModuleOptions => ({
        secret: resolveJwtSecret(),
        signOptions: {
          expiresIn: (process.env.JWT_EXPIRES_IN || "8h") as `${number}h`,
        },
      }),
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
